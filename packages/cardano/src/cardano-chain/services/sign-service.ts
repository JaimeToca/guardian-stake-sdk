import { Serialization } from "@cardano-sdk/core";
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
import {
  isCardanoSigningWithPrivateKey,
  isCardanoPrehashArgs,
  type CardanoPrehashArgs,
} from "../sign-types";
import type { BlockfrostRpcClientContract } from "../rpc/blockfrost-rpc-client-contract";
import type { BlockfrostProtocolParams, BlockfrostUtxo } from "../rpc/blockfrost-rpc-types";
import { selectUtxos, DEFAULT_COINS_PER_UTXO_SIZE } from "../tx/coin-selection";
import { buildTransactionBody, buildSignedTransaction, type TxWitness } from "../tx/tx-builder";
import {
  buildCertificates,
  buildWithdrawals,
  rewardAccountWithdrawal,
  computeMinOutputLovelace,
  computeRequiredLovelaces,
} from "../tx/tx-helpers";
import {
  buildRewardAccount,
  parseCardanoPrivateKey,
  parseCardanoPublicKey,
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
      transaction.type === "Delegate" || transaction.type === "Undelegate"
        ? this.rpcClient.getAccountOrNull(rewardAccount)
        : Promise.resolve(null),
    ]);

    // #8: Sanity-check the slot number before computing the TTL.
    if (latestBlock.slot <= 0) {
      throw new SigningError(
        "INVALID_SIGNING_ARGS",
        "Received an invalid slot number from the node. Cannot compute a safe TTL."
      );
    }
    const ttl = latestBlock.slot + TTL_VALIDITY_SLOTS;
    // Stake key is considered registered only when the account is actively delegating.
    // active: false covers both "never registered" and "deregistered" cases — both need StakeRegistration.
    // active: null is treated identically to false (conservative — include registration cert).
    const isStakeKeyRegistered = existingAccount?.active === true;
    const rewardsAvailableToSweep =
      transaction.type === "Undelegate"
        ? BigInt(existingAccount?.withdrawable_amount ?? "0")
        : 0n;

    const body = this.buildBody(
      transaction,
      transaction.account,
      utxos,
      fee.total,
      protocolParams,
      stakeKeyHashHex,
      ttl,
      isStakeKeyRegistered,
      rewardsAvailableToSweep
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

    parseCardanoPublicKey(preHashArgs.stakingPublicKey); // #4: validate format
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
      preHashArgs.transaction.type === "Delegate" ||
      preHashArgs.transaction.type === "Undelegate"
        ? this.rpcClient.getAccountOrNull(rewardAccount)
        : Promise.resolve(null),
    ]);

    // #8: Sanity-check the slot number before computing the TTL.
    if (latestBlock.slot <= 0) {
      throw new SigningError(
        "INVALID_SIGNING_ARGS",
        "Received an invalid slot number from the node. Cannot compute a safe TTL."
      );
    }
    const ttl = latestBlock.slot + TTL_VALIDITY_SLOTS;
    // active: null is treated identically to false — include registration cert (conservative).
    const isStakeKeyRegistered = existingAccount?.active === true;
    const rewardsAvailableToSweep =
      preHashArgs.transaction.type === "Undelegate"
        ? BigInt(existingAccount?.withdrawable_amount ?? "0")
        : 0n;

    const body = this.buildBody(
      preHashArgs.transaction,
      preHashArgs.transaction.account,
      utxos,
      preHashArgs.fee.total,
      protocolParams,
      stakeKeyHashHex,
      ttl,
      isStakeKeyRegistered,
      rewardsAvailableToSweep
    );

    // Return the tx body hash — the exact 32-byte preimage the external signer must sign with Ed25519.
    // #2: Embed the serialised tx body so compile() can reconstruct it without re-fetching chain
    // state, preventing a signature mismatch if UTXOs or the block tip change in the interim.
    return {
      serializedTransaction: body.hash(),
      signArgs: { ...preHashArgs, _txBodyCbor: body.toCbor() } as CardanoPrehashArgs,
    };
  }

  /**
   * Compiles a pre-hashed Cardano transaction with externally produced signatures.
   *
   * `compileArgs.signature` must be: `paymentSigHex:stakingVKeyHex:stakingSigHex:paymentVKeyHex`
   *
   * When called after `prehash()`, the tx body is reconstructed from the CBOR embedded
   * in `compileArgs.signArgs._txBodyCbor` — no network requests are made and there is
   * no risk of the body diverging from what was actually signed.
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

    // #3: Validate the format of each signature part before using them.
    const HEX64 = /^[0-9a-fA-F]{64}$/;
    const HEX128 = /^[0-9a-fA-F]{128}$/;
    if (
      !HEX128.test(paymentSigHex) ||
      !HEX64.test(stakingVKeyHex) ||
      !HEX128.test(stakingSigHex) ||
      !HEX64.test(paymentVKeyHex)
    ) {
      throw new SigningError(
        "INVALID_SIGNING_ARGS",
        "Malformed signature: expected `paymentSigHex(128):stakingVKeyHex(64):stakingSigHex(128):paymentVKeyHex(64)` " +
          "where each value is a lowercase or uppercase hex string of the indicated length."
      );
    }

    // #5: Ensure the two witness keys are distinct.
    if (paymentVKeyHex.toLowerCase() === stakingVKeyHex.toLowerCase()) {
      throw new SigningError(
        "INVALID_SIGNING_ARGS",
        "paymentVKeyHex and stakingVKeyHex must be different keys."
      );
    }

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

    // #9: When compileArgs.signArgs came from prehash(), verify the staking key matches.
    const prehashArgs = isCardanoPrehashArgs(compileArgs.signArgs)
      ? compileArgs.signArgs
      : undefined;
    if (prehashArgs) {
      const expectedStakeHash = Ed25519PublicKey.fromHex(
        Ed25519PublicKeyHex(prehashArgs.stakingPublicKey)
      )
        .hash()
        .hex();
      if (stakeKeyHashHex !== expectedStakeHash) {
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "stakingVKeyHex does not match the stakingPublicKey that was used in prehash(). " +
            "The compiled transaction would be invalid."
        );
      }
    }

    // #2: Reconstruct the tx body from the CBOR cached by prehash(). compile() is only
    // valid after prehash() — _txBodyCbor is always present in that flow.
    if (!prehashArgs?._txBodyCbor) {
      throw new SigningError(
        "INVALID_SIGNING_ARGS",
        "compile() requires signArgs produced by prehash(). No serialized tx body found."
      );
    }
    const body = Serialization.TransactionBody.fromCbor(HexBlob(prehashArgs._txBodyCbor));

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
    isStakeKeyRegistered: boolean,
    rewardsAvailableToSweep = 0n
  ): ReturnType<typeof buildTransactionBody> {
    const keyDeposit = BigInt(protocolParams.key_deposit);
    const coinsPerUtxoByte = BigInt(
      protocolParams.coins_per_utxo_size ?? DEFAULT_COINS_PER_UTXO_SIZE
    );
    const minUtxo = computeMinOutputLovelace(paymentAddress, coinsPerUtxoByte);

    const certificates = buildCertificates(transaction, stakeKeyHashHex, isStakeKeyRegistered);
    const withdrawals = buildWithdrawals(transaction, stakeKeyHashHex, rewardsAvailableToSweep);
    const requiredLovelaces = computeRequiredLovelaces(
      transaction,
      fee,
      keyDeposit,
      isStakeKeyRegistered
    );

    // Select enough inputs to cover required + minUtxo so the change output is always valid.
    const { inputs, totalLovelaces, inputAssets } = selectUtxos(utxos, requiredLovelaces + minUtxo);

    // Rewards moving from the reward account into the wallet (0 for Delegate/Redelegate).
    const rewardsReceived = rewardAccountWithdrawal(transaction, rewardsAvailableToSweep);

    // The 2 ADA key deposit is refunded by the protocol when the stake key is deregistered.
    const keyDepositRefund = transaction.type === "Undelegate" ? keyDeposit : 0n;

    // Change = UTXOs consumed − what we owe (fee + any deposit paid) + what flows back in
    const outputLovelaces = totalLovelaces - requiredLovelaces + rewardsReceived + keyDepositRefund;

    // #1: Guard against an under-funded change output. This can happen if the fee
    // passed by the caller is significantly higher than the estimate (e.g. manual override)
    // or if the wallet's UTxO set changed between fee estimation and signing.
    if (outputLovelaces < minUtxo) {
      throw new ValidationError(
        "INVALID_AMOUNT",
        `Insufficient funds: the change output would be ${outputLovelaces} lovelace but the minimum UTxO is ${minUtxo}. ` +
          `Ensure the wallet has enough ADA to cover the fee${
            transaction.type === "Delegate" && !isStakeKeyRegistered ? " and the key deposit" : ""
          }.`
      );
    }

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
