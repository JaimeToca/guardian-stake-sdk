import { Ed25519PrivateKey, Ed25519PrivateNormalKeyHex, Ed25519PublicKey, Ed25519PublicKeyHex } from "@cardano-sdk/crypto";
import { HexBlob } from "@cardano-sdk/util";
import type {
  BaseSignArgs,
  CompileArgs,
  Logger,
  PrehashResult,
  Transaction,
} from "@guardian-sdk/sdk";
import { NoopLogger, SigningError, ValidationError } from "@guardian-sdk/sdk";
import type { CardanoSigningWithPrivateKey } from "../sign-types";
import { isCardanoSigningWithPrivateKey } from "../sign-types";
import type { BlockfrostRpcClientContract } from "../rpc/blockfrost-rpc-client-contract";
import type { BlockfrostProtocolParams, BlockfrostUtxo } from "../rpc/blockfrost-rpc-types";
import { selectUtxos, DEFAULT_COINS_PER_UTXO_SIZE, UTXO_OUTPUT_SIZE_BYTES } from "../tx/coin-selection";
import {
  buildTransactionBody,
  buildSignedTransaction,
  type CardanoCertificate,
  type TxBodyParams,
  type TxWitness,
} from "../tx/tx-builder";
import {
  buildRewardAccount,
  parseCardanoPrivateKey,
  checkIfPaymentAddressIsValid,
  parsePoolId,
} from "../validations";

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

    const paymentPrivKey = Ed25519PrivateKey.fromNormalHex(Ed25519PrivateNormalKeyHex(paymentPrivHex));
    const stakingPrivKey = Ed25519PrivateKey.fromNormalHex(Ed25519PrivateNormalKeyHex(stakingPrivHex));

    const paymentPubKey = paymentPrivKey.toPublic();
    const stakingPubKey = stakingPrivKey.toPublic();

    // blake2b-224 (28 bytes) of the staking public key = stake key hash
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

    const [protocolParams, utxos] = await Promise.all([
      this.rpcClient.getProtocolParams(),
      this.rpcClient.getUtxos(transaction.account),
    ]);

    const body = this.buildBody(
      transaction,
      transaction.account,
      utxos,
      fee.total,
      protocolParams,
      stakeKeyHashHex
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

    checkIfPaymentAddressIsValid(preHashArgs.transaction.account);

    const [protocolParams, utxos] = await Promise.all([
      this.rpcClient.getProtocolParams(),
      this.rpcClient.getUtxos(preHashArgs.transaction.account),
    ]);

    const body = this.buildBody(
      preHashArgs.transaction,
      preHashArgs.transaction.account,
      utxos,
      preHashArgs.fee.total,
      protocolParams,
      "00".repeat(28) // placeholder staking key hash — replaced in compile()
    );

    return {
      serializedTransaction: body.toCbor(),
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

    // Derive stake key hash from the provided staking public key
    const stakeKeyHashHex = Ed25519PublicKey.fromHex(Ed25519PublicKeyHex(stakingVKeyHex)).hash().hex();

    const [protocolParams, utxos] = await Promise.all([
      this.rpcClient.getProtocolParams(),
      this.rpcClient.getUtxos(transaction.account),
    ]);

    const body = this.buildBody(
      transaction,
      transaction.account,
      utxos,
      fee.total,
      protocolParams,
      stakeKeyHashHex
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
    stakeKeyHashHex: string
  ): ReturnType<typeof buildTransactionBody> {
    const keyDeposit = BigInt(protocolParams.key_deposit);
    // Minimum lovelace every output must contain, derived from protocol params.
    // 160 is a conservative estimate of the serialised byte size of a pure-ADA base-address output.
    const minUtxo = BigInt(protocolParams.coins_per_utxo_size ?? DEFAULT_COINS_PER_UTXO_SIZE) * UTXO_OUTPUT_SIZE_BYTES;
    const certificates = this.buildCertificates(transaction, stakeKeyHashHex);
    const withdrawals = this.buildWithdrawals(transaction, stakeKeyHashHex);

    const requiredLovelaces = this.computeRequiredLovelaces(transaction, fee, keyDeposit);
    // Select enough inputs to cover required + minUtxo so the change output is always valid.
    const { inputs, totalLovelaces } = selectUtxos(utxos, requiredLovelaces + minUtxo);

    const rewardAmount = transaction.type === "Claim" ? transaction.amount : 0n;
    const depositReturn = transaction.type === "Undelegate" ? keyDeposit : 0n;
    const outputLovelaces = totalLovelaces + rewardAmount + depositReturn - requiredLovelaces;

    const params: TxBodyParams = {
      inputs,
      outputAddress: paymentAddress,
      outputLovelaces,
      fee,
      certificates: certificates.length > 0 ? certificates : undefined,
      withdrawals: withdrawals.size > 0 ? withdrawals : undefined,
    };

    return buildTransactionBody(params);
  }

  private computeRequiredLovelaces(
    transaction: Transaction,
    fee: bigint,
    keyDeposit: bigint
  ): bigint {
    switch (transaction.type) {
      case "Delegate":
        return fee + keyDeposit;
      case "Redelegate":
        return fee;
      case "Undelegate":
        return fee;
      case "Claim":
        return fee;
    }
  }

  private buildCertificates(
    transaction: Transaction,
    stakeKeyHashHex: string
  ): CardanoCertificate[] {
    if (transaction.type === "Delegate") {
      const poolId =
        typeof transaction.validator === "string"
          ? transaction.validator
          : transaction.validator.operatorAddress;
      const poolKeyHashHex = parsePoolId(poolId);
      return [
        { type: "StakeRegistration", stakeKeyHashHex },
        { type: "StakeDelegation", stakeKeyHashHex, poolKeyHashHex },
      ];
    }

    if (transaction.type === "Redelegate") {
      const poolId =
        typeof transaction.toValidator === "string"
          ? transaction.toValidator
          : transaction.toValidator.operatorAddress;
      const poolKeyHashHex = parsePoolId(poolId);
      return [{ type: "StakeDelegation", stakeKeyHashHex, poolKeyHashHex }];
    }

    if (transaction.type === "Undelegate") {
      return [{ type: "StakeDeregistration", stakeKeyHashHex }];
    }

    return [];
  }

  private buildWithdrawals(transaction: Transaction, stakeKeyHashHex: string): Map<string, bigint> {
    if (transaction.type !== "Claim") return new Map();
    const rewardAccount = buildRewardAccount(stakeKeyHashHex);
    return new Map([[rewardAccount, transaction.amount]]);
  }
}
