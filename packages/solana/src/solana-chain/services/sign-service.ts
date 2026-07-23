import type {
  BaseSignArgs,
  CompileArgs,
  Logger,
  PrehashResult,
  SigningWithPrivateKey,
  SolanaFee,
} from "@guardian-sdk/sdk";
import { NoopLogger, SigningError } from "@guardian-sdk/sdk";
import {
  createKeyPairFromPrivateKeyBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  signTransaction,
  signatureBytes,
  type Transaction as KitTransaction,
} from "@solana/kit";
import type { SolanaRpcClientContract } from "../rpc/solana-rpc-client-contract";
import { buildUnsignedTx } from "../tx/tx-builder";
import type { SolanaSignArgs } from "../tx/solana-types";

export interface SolanaSignServiceConfig {
  defaultComputeUnitPrice?: bigint;
  seedScanMax?: number;
}

export interface SolanaSignService {
  sign(args: SigningWithPrivateKey): Promise<string>;
  prehash(args: BaseSignArgs): Promise<PrehashResult>;
  compile(args: CompileArgs): Promise<string>;
}

/** 32-byte Ed25519 seed as 64 lowercase hex characters (v1). */
const SEED_HEX_RE = /^[0-9a-f]{64}$/;

function assertSolanaFee(fee: { type: string }): asserts fee is SolanaFee {
  if (fee.type !== "SolanaFee") {
    throw new SigningError(
      "INVALID_FEE_TYPE",
      `Solana sign/prehash requires a SolanaFee, got "${fee.type}".`
    );
  }
}

/**
 * Parse a 32-byte Ed25519 seed from 64-char lowercase hex.
 * Full 64-byte solana-keygen secret arrays are out of scope for v1.
 */
export function parseEd25519SeedHex(privateKey: string): Uint8Array {
  if (typeof privateKey !== "string" || !SEED_HEX_RE.test(privateKey)) {
    throw new SigningError(
      "INVALID_SIGNING_ARGS",
      "Solana privateKey must be a 32-byte Ed25519 seed as 64 lowercase hex characters."
    );
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number.parseInt(privateKey.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function decodeWireTransaction(wireBase64: string): KitTransaction {
  const bytes = Buffer.from(wireBase64, "base64");
  return getTransactionDecoder().decode(bytes);
}

function attachFeePayerSignature(
  unsigned: KitTransaction,
  feePayer: string,
  signature: Uint8Array
): KitTransaction {
  if (signature.byteLength !== 64) {
    throw new SigningError(
      "INVALID_SIGNING_ARGS",
      `compile() signature must decode to 64 Ed25519 bytes, got ${signature.byteLength}.`
    );
  }
  if (!(feePayer in unsigned.signatures)) {
    throw new SigningError(
      "INVALID_SIGNING_ARGS",
      `Fee payer "${feePayer}" is not a required signer on the prehashed transaction.`
    );
  }
  const sig = signatureBytes(signature);
  return {
    messageBytes: unsigned.messageBytes,
    signatures: {
      ...unsigned.signatures,
      [feePayer]: sig,
    },
  };
}

/**
 * Solana signing service (Ed25519 over compiled transaction message bytes).
 *
 * - `sign` → base64 wire transaction
 * - `prehash` → `serializedTransaction` = base64 message bytes; threads `_messageBytes` / `_wireTransaction`
 * - `compile` → `signature` = base64 of 64-byte Ed25519 sig over message bytes → base64 wire tx
 */
export function createSignService(
  rpc: SolanaRpcClientContract,
  config: SolanaSignServiceConfig = {},
  logger: Logger = new NoopLogger()
): SolanaSignService {
  const buildConfig = {
    seedScanMax: config.seedScanMax,
    defaultComputeUnitPrice: config.defaultComputeUnitPrice,
  };

  return {
    async sign(args: SigningWithPrivateKey): Promise<string> {
      logger.info("SignService: signing transaction", { type: args.transaction.type });
      assertSolanaFee(args.fee);

      const seed = parseEd25519SeedHex(args.privateKey);
      const [keypair, keypairSigner] = await Promise.all([
        createKeyPairFromPrivateKeyBytes(seed),
        createKeyPairSignerFromPrivateKeyBytes(seed),
      ]);
      const authorityAddress = keypairSigner.address;

      if (args.transaction.account && args.transaction.account !== authorityAddress) {
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "transaction.account must match the address derived from privateKey."
        );
      }

      const built = await buildUnsignedTx(
        {
          rpc,
          authorityAddress,
          config: buildConfig,
          computeUnitPrice: args.fee.computeUnitPrice,
        },
        args.transaction,
        args.fee
      );

      const unsigned = decodeWireTransaction(built.wireTransactionBase64);
      const signed = await signTransaction([keypair], unsigned);
      const wire = getBase64EncodedWireTransaction(signed);

      logger.info("SignService: transaction signed");
      return wire;
    },

    async prehash(args: BaseSignArgs): Promise<PrehashResult> {
      logger.info("SignService: prehashing transaction", { type: args.transaction.type });
      assertSolanaFee(args.fee);

      const authorityAddress = args.transaction.account;
      if (!authorityAddress || authorityAddress.trim() === "") {
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "prehash() requires transaction.account (fee payer / authority)."
        );
      }

      const built = await buildUnsignedTx(
        {
          rpc,
          authorityAddress,
          config: buildConfig,
          computeUnitPrice: args.fee.computeUnitPrice,
        },
        args.transaction,
        args.fee
      );

      const signArgs: SolanaSignArgs = {
        transaction: args.transaction,
        fee: args.fee,
        nonce: args.nonce,
        _messageBytes: built.messageBytes,
        _wireTransaction: built.wireTransactionBase64,
      };

      logger.info("SignService: prehash complete — send serializedTransaction to external signer");
      return {
        // Exact Ed25519 payload the external signer must sign (message bytes, not wire tx).
        serializedTransaction: Buffer.from(built.messageBytes).toString("base64"),
        signArgs,
      };
    },

    async compile(args: CompileArgs): Promise<string> {
      logger.info("SignService: compiling signed transaction");

      const solanaArgs = args.signArgs as SolanaSignArgs;
      const wire = solanaArgs._wireTransaction;
      if (typeof wire !== "string" || wire.length === 0) {
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "compile() requires signArgs._wireTransaction from prehash()."
        );
      }
      if (typeof args.signature !== "string" || args.signature.length === 0) {
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "compile() requires a non-empty base64 signature."
        );
      }

      let sigBytes: Buffer;
      try {
        sigBytes = Buffer.from(args.signature, "base64");
      } catch {
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "compile() signature must be valid base64 of a 64-byte Ed25519 signature."
        );
      }

      const feePayer = solanaArgs.transaction.account;
      if (!feePayer) {
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "compile() requires signArgs.transaction.account (fee payer)."
        );
      }

      const unsigned = decodeWireTransaction(wire);
      const signed = attachFeePayerSignature(unsigned, feePayer, new Uint8Array(sigBytes));
      const out = getBase64EncodedWireTransaction(signed);

      logger.info("SignService: transaction compiled");
      return out;
    },
  };
}
