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
  getBase16Encoder,
  getBase64Decoder,
  getBase64Encoder,
  getBase64EncodedWireTransaction,
  getPublicKeyFromAddress,
  getTransactionDecoder,
  signTransaction,
  signatureBytes,
  verifySignature,
  type Address,
  type ReadonlyUint8Array,
  type Transaction as KitTransaction,
} from "@solana/kit";
import { timingSafeEqual } from "node:crypto";
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

const base16Encoder = getBase16Encoder();
const base64Encoder = getBase64Encoder();
const base64Decoder = getBase64Decoder();
const transactionDecoder = getTransactionDecoder();

function assertSolanaFee(fee: { type: string }): asserts fee is SolanaFee {
  if (fee.type !== "SolanaFee") {
    throw new SigningError(
      "INVALID_FEE_TYPE",
      `Solana sign/prehash requires a SolanaFee, got "${fee.type}".`
    );
  }
}

/**
 * Parse a 32-byte Ed25519 seed from 64-char lowercase hex via Kit {@link getBase16Encoder}.
 * Full 64-byte solana-keygen secret arrays are out of scope for v1.
 */
export function parseEd25519SeedHex(privateKey: string): Uint8Array {
  if (typeof privateKey !== "string" || !SEED_HEX_RE.test(privateKey)) {
    throw new SigningError(
      "INVALID_SIGNING_ARGS",
      "Solana privateKey must be a 32-byte Ed25519 seed as 64 lowercase hex characters."
    );
  }
  return new Uint8Array(base16Encoder.encode(privateKey));
}

function decodeWireTransaction(wireBase64: string): KitTransaction {
  // Kit: base64 *encoder* maps base64 string → bytes.
  const bytes = base64Encoder.encode(wireBase64);
  return transactionDecoder.decode(bytes);
}

function bytesToBase64(bytes: Uint8Array): string {
  // Kit: base64 *decoder* maps bytes → base64 string.
  return base64Decoder.decode(bytes);
}

/**
 * Constant-time byte-array equality. Compares full length first (a length mismatch is not
 * secret-dependent), then compares every byte via `crypto.timingSafeEqual` — never short-circuits
 * on the first differing byte — so the comparison time doesn't leak *where* two buffers diverge.
 */
function constantTimeBytesEqual(a: ReadonlyUint8Array, b: ReadonlyUint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  return timingSafeEqual(Uint8Array.from(a), Uint8Array.from(b));
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
        serializedTransaction: bytesToBase64(built.messageBytes),
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

      // Kit base64 encoder: base64 string → bytes (invalid base64 may not throw — length checked below).
      const sigBytes = new Uint8Array(base64Encoder.encode(args.signature));

      const feePayer = solanaArgs.transaction.account;
      if (!feePayer) {
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "compile() requires signArgs.transaction.account (fee payer)."
        );
      }

      const unsigned = decodeWireTransaction(wire);

      // SEC-SIGN-1d, check 1: bind compile() to the exact bytes prehash() returned (and that the
      // external signer signed) instead of trusting `_wireTransaction` alone. If `_wireTransaction`
      // was swapped or mutated for a different message after prehash(), `unsigned.messageBytes`
      // will diverge from `_messageBytes` and this must throw before any signature is attached.
      const expectedMessageBytes = solanaArgs._messageBytes;
      if (!expectedMessageBytes) {
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "compile() requires signArgs._messageBytes from prehash()."
        );
      }
      if (!constantTimeBytesEqual(unsigned.messageBytes, expectedMessageBytes)) {
        throw new SigningError(
          "SIGNATURE_MISMATCH",
          "compile() detected that signArgs._wireTransaction's message does not match " +
            "signArgs._messageBytes. This means _wireTransaction was mutated or swapped after prehash()."
        );
      }

      // SEC-SIGN-1d, check 2: verify the supplied signature is a valid Ed25519 signature by the
      // fee payer over the message bytes, before attaching it. Without this, a garbage/invalid
      // signature — or a valid signature from an unrelated key — would be silently assembled into
      // a wire transaction that only fails (or is rejected) at broadcast.
      // Length is validated here (rather than relying solely on attachFeePayerSignature's later
      // check) because `signatureBytes`/`verifySignature` require exactly 64 bytes.
      if (sigBytes.byteLength !== 64) {
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          `compile() signature must decode to 64 Ed25519 bytes, got ${sigBytes.byteLength}.`
        );
      }
      const feePayerPublicKey = await getPublicKeyFromAddress(feePayer as Address);
      const isValidSignature = await verifySignature(
        feePayerPublicKey,
        signatureBytes(sigBytes),
        expectedMessageBytes
      );
      if (!isValidSignature) {
        throw new SigningError(
          "SIGNATURE_MISMATCH",
          "compile() produced a transaction whose signature does not verify against the fee " +
            "payer's public key over the prehashed message. This can mean signArgs was mutated " +
            "after prehash(), or the supplied signature belongs to a different signer/transaction."
        );
      }

      const signed = attachFeePayerSignature(unsigned, feePayer, sigBytes);
      const out = getBase64EncodedWireTransaction(signed);

      logger.info("SignService: transaction compiled");
      return out;
    },
  };
}
