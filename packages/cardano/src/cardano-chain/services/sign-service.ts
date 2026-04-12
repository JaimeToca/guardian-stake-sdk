import {
  Ed25519PrivateKey,
  Ed25519PrivateNormalKeyHex,
  Ed25519PublicKey,
  Ed25519PublicKeyHex,
} from "@cardano-sdk/crypto";
import { HexBlob } from "@cardano-sdk/util";
import type {
  BaseSignArgs,
  CompileArgs,
  Logger,
  PrehashResult,
  Transaction,
} from "@guardian-sdk/sdk";
import { NoopLogger, SigningError, ValidationError } from "@guardian-sdk/sdk";
import type { CardanoSigningWithPrivateKey, CardanoPrehashArgs } from "../sign-types";
import { isCardanoSigningWithPrivateKey, isCardanoPrehashArgs } from "../sign-types";
import type { BlockfrostRpcClientContract } from "../rpc/blockfrost-rpc-client-contract";
import type { BlockfrostProtocolParams, BlockfrostUtxo } from "../rpc/blockfrost-rpc-types";
import { selectUtxos, DEFAULT_COINS_PER_UTXO_SIZE } from "../tx/coin-selection";
import {
  buildTransactionBody,
  buildSignedTransaction,
  type TxBodyParams,
  type TxWitness,
} from "../tx/tx-builder";
import {
  buildCertificates,
  buildWithdrawals,
  computeMinOutputLovelace,
  computeRequiredLovelaces,
} from "../tx/tx-helpers";
import {
  buildRewardAccount,
  parseCardanoPrivateKey,
  checkIfPaymentAddressIsValid,
} from "../validations";

/** Transactions expire after ~2 hours (1 slot ≈ 1 second on mainnet). */
const TTL_VALIDITY_SLOTS = 7_200;

/**
 * Cardano signing service.
 *
 * Builds and signs Cardano transactions using @cardano-sdk/core for serialisation
 * and @cardano-sdk/crypto for Ed25519 key operations.
 *
 * ## Two keys
 *
 * Every staking transaction requires two witnesses:
 * - The **payment key** witness authorizes UTXO consumption.
 * - The **staking key** witness authorizes delegation certificates and reward withdrawals.
 *
 * Pass both via `CardanoSigningWithPrivateKey`:
 *
 * ```typescript
 * await sdk.sign({
 *   transaction, fee, nonce: 0,
 *   paymentPrivateKey: "hex...",
 *   stakingPrivateKey: "hex...",
 * });
 * ```
 */
export class SignService {
  constructor(
    private readonly rpcClient: BlockfrostRpcClientContract,
    private readonly logger: Logger = new NoopLogger()
  ) {}

  async sign(signingArgs: BaseSignArgs): Promise<string> {
    if (!isCardanoSigningWithPrivateKey(signingArgs)) {
      throw new SigningError(
        "INVALID_SIGNING_ARGS",
        "Cardano requires `paymentPrivateKey` and `stakingPrivateKey` in the signing args. " +
          "See CardanoSigningWithPrivateKey."
      );
    }

    const paymentPrivHex = parseCardanoPrivateKey(signingArgs.paymentPrivateKey);
    const stakingPrivHex = parseCardanoPrivateKey(signingArgs.stakingPrivateKey);

    const paymentPrivKey = Ed25519PrivateKey.fromNormalHex(
      Ed25519PrivateNormalKeyHex(paymentPrivHex)
    );
    const stakingPrivKey = Ed25519PrivateKey.fromNormalHex(
      Ed25519PrivateNormalKeyHex(stakingPrivHex)
    );

    const paymentPubKey = paymentPrivKey.toPublic();
    const stakingPubKey = stakingPrivKey.toPublic();
    const stakeKeyHashHex = stakingPubKey.hash().hex();

    const { transaction, fee } = signingArgs;

    if (!transaction.account) {
      throw new ValidationError(
        "INVALID_ADDRESS",
        "transaction.account (payment address, addr1...) is required for Cardano signing."
      );
    }

    if (fee.type !== "UtxoFee") {
      throw new SigningError(
        "INVALID_SIGNING_ARGS",
        "Cardano transactions require a `UtxoFee`. Call `estimateFee()` first."
      );
    }

    checkIfPaymentAddressIsValid(transaction.account);

    const rewardAccount = buildRewardAccount(stakeKeyHashHex);
    const [protocolParams, utxos, latestBlock, existingAccount] = await Promise.all([
      this.rpcClient.getProtocolParams(),
      this.rpcClient.getUtxos(transaction.account),
      this.rpcClient.getLatestBlock(),
      transaction.type === "Delegate"
        ? this.rpcClient.getAccountOrNull(rewardAccount)
        : Promise.resolve(null),
    ]);

    const ttl = latestBlock.slot + TTL_VALIDITY_SLOTS;
    // Stake key is considered registered only when the account is actively delegating.
    // active: false covers both "never registered" and "deregistered" cases — both need StakeRegistration.
    const isStakeKeyRegistered = existingAccount?.active === true;

    const body = this.buildBody(
      transaction,
      transaction.account,
      utxos,
      fee.total,
      protocolParams,
      stakeKeyHashHex,
      ttl,
      isStakeKeyRegistered
    );

    const txBodyHash = body.hash();

    const paymentSig = paymentPrivKey.sign(HexBlob(txBodyHash));
    const stakingSig = stakingPrivKey.sign(HexBlob(txBodyHash));

    const witnesses: TxWitness[] = [
      { vkeyHex: paymentPubKey.hex(), sigHex: paymentSig.hex() },
      { vkeyHex: stakingPubKey.hex(), sigHex: stakingSig.hex() },
    ];

    const txCborHex = buildSignedTransaction(body, witnesses);

    this.logger.debug("SignService: transaction signed", {
      txBodyHash,
      txSizeBytes: txCborHex.length / 2,
    });

    return txCborHex;
  }

  async prehash(preHashArgs: BaseSignArgs): Promise<PrehashResult> {
    if (!preHashArgs.transaction.account) {
      throw new ValidationError(
        "INVALID_ADDRESS",
        "transaction.account (payment address, addr1...) is required."
      );
    }

    if (preHashArgs.fee.type !== "UtxoFee") {
      throw new SigningError(
        "INVALID_SIGNING_ARGS",
        "Cardano prehash requires a `UtxoFee`. Call `estimateFee()` first."
      );
    }

    if (!isCardanoPrehashArgs(preHashArgs)) {
      throw new SigningError(
        "INVALID_SIGNING_ARGS",
        "Cardano prehash requires `stakingPublicKey` (32-byte Ed25519 public key hex). " +
          "See CardanoPrehashArgs."
      );
    }

    checkIfPaymentAddressIsValid(preHashArgs.transaction.account);

    const stakingPubKey = Ed25519PublicKey.fromHex(
      Ed25519PublicKeyHex(preHashArgs.stakingPublicKey)
    );
    const stakeKeyHashHex = stakingPubKey.hash().hex();
    const rewardAccount = buildRewardAccount(stakeKeyHashHex);

    const [protocolParams, utxos, latestBlock, existingAccount] = await Promise.all([
      this.rpcClient.getProtocolParams(),
      this.rpcClient.getUtxos(preHashArgs.transaction.account),
      this.rpcClient.getLatestBlock(),
      preHashArgs.transaction.type === "Delegate"
        ? this.rpcClient.getAccountOrNull(rewardAccount)
        : Promise.resolve(null),
    ]);

    const ttl = latestBlock.slot + TTL_VALIDITY_SLOTS;
    const isStakeKeyRegistered = existingAccount?.active === true;

    const body = this.buildBody(
      preHashArgs.transaction,
      preHashArgs.transaction.account,
      utxos,
      preHashArgs.fee.total,
      protocolParams,
      stakeKeyHashHex,
      ttl,
      isStakeKeyRegistered
    );

    // Return the tx body hash — the exact 32-byte preimage the external signer must sign with Ed25519.
    return {
      serializedTransaction: body.hash(),
      signArgs: preHashArgs,
    };
  }

  /**
   * Compiles a pre-hashed Cardano transaction with externally produced signatures.
   *
   * `compileArgs.signature` must be: `paymentSigHex:stakingVKeyHex:stakingSigHex:paymentVKeyHex`
   */
  async compile(compileArgs: CompileArgs): Promise<string> {
    const parts = compileArgs.signature.split(":");
    if (parts.length !== 4) {
      throw new SigningError(
        "INVALID_SIGNING_ARGS",
        "For Cardano, `signature` must be `paymentSigHex:stakingVKeyHex:stakingSigHex:paymentVKeyHex`."
      );
    }

    const [paymentSigHex, stakingVKeyHex, stakingSigHex, paymentVKeyHex] = parts;
    const { transaction, fee } = compileArgs.signArgs;

    if (!transaction.account) {
      throw new ValidationError("INVALID_ADDRESS", "transaction.account is required.");
    }

    if (fee.type !== "UtxoFee") {
      throw new SigningError("INVALID_SIGNING_ARGS", "Cardano compile requires a `UtxoFee`.");
    }

    checkIfPaymentAddressIsValid(transaction.account);

    const stakeKeyHashHex = Ed25519PublicKey.fromHex(Ed25519PublicKeyHex(stakingVKeyHex))
      .hash()
      .hex();
    const rewardAccount = buildRewardAccount(stakeKeyHashHex);

    const [protocolParams, utxos, latestBlock, existingAccount] = await Promise.all([
      this.rpcClient.getProtocolParams(),
      this.rpcClient.getUtxos(transaction.account),
      this.rpcClient.getLatestBlock(),
      transaction.type === "Delegate"
        ? this.rpcClient.getAccountOrNull(rewardAccount)
        : Promise.resolve(null),
    ]);

    const ttl = latestBlock.slot + TTL_VALIDITY_SLOTS;
    const isStakeKeyRegistered = existingAccount?.active === true;

    const body = this.buildBody(
      transaction,
      transaction.account,
      utxos,
      fee.total,
      protocolParams,
      stakeKeyHashHex,
      ttl,
      isStakeKeyRegistered
    );

    const witnesses: TxWitness[] = [
      { vkeyHex: paymentVKeyHex, sigHex: paymentSigHex },
      { vkeyHex: stakingVKeyHex, sigHex: stakingSigHex },
    ];

    return buildSignedTransaction(body, witnesses);
  }

  // ─── Transaction body builder ──────────────────────────────────────────────

  private buildBody(
    transaction: Transaction,
    paymentAddress: string,
    utxos: BlockfrostUtxo[],
    fee: bigint,
    protocolParams: BlockfrostProtocolParams,
    stakeKeyHashHex: string,
    ttl: number,
    isStakeKeyRegistered: boolean
  ): ReturnType<typeof buildTransactionBody> {
    const keyDeposit = BigInt(protocolParams.key_deposit);
    const coinsPerUtxoByte = BigInt(
      protocolParams.coins_per_utxo_size ?? DEFAULT_COINS_PER_UTXO_SIZE
    );
    const minUtxo = computeMinOutputLovelace(paymentAddress, coinsPerUtxoByte);

    const certificates = buildCertificates(transaction, stakeKeyHashHex, isStakeKeyRegistered);
    const withdrawals = buildWithdrawals(transaction, stakeKeyHashHex);
    const requiredLovelaces = computeRequiredLovelaces(
      transaction,
      fee,
      keyDeposit,
      isStakeKeyRegistered
    );

    // Select enough inputs to cover required + minUtxo so the change output is always valid.
    const { inputs, totalLovelaces, inputAssets } = selectUtxos(utxos, requiredLovelaces + minUtxo);

    const rewardAmount = transaction.type === "Claim" ? transaction.amount : 0n;
    const depositReturn = transaction.type === "Undelegate" ? keyDeposit : 0n;
    const outputLovelaces = totalLovelaces + rewardAmount + depositReturn - requiredLovelaces;

    return buildTransactionBody({
      inputs,
      outputAddress: paymentAddress,
      outputLovelaces,
      outputAssets: inputAssets,
      fee,
      ttl,
      certificates: certificates.length > 0 ? certificates : undefined,
      withdrawals: withdrawals.size > 0 ? withdrawals : undefined,
    });
  }
}
