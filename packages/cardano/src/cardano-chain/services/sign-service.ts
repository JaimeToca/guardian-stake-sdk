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
import { selectUtxosPaged, type SelectedUtxos } from "../tx/coin-selection";
import { buildTransactionBody, buildSignedTransaction, type TxWitness } from "../tx/tx-builder";
import {
  buildCertificates,
  buildWithdrawals,
  rewardAccountWithdrawal,
  computeSelectionTarget,
} from "../tx/tx-helpers";
import {
  buildRewardAccount,
  parseCardanoPrivateKey,
  parseCardanoPublicKey,
  checkIfPaymentAddressIsValid,
  getBaseAddressCredentials,
  assertHexBytes,
  parseLovelaceString,
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
export function createSignService(
  rpcClient: BlockfrostRpcClientContract,
  logger: Logger = new NoopLogger()
) {
  function buildBody(
    transaction: Transaction,
    paymentAddress: string,
    selected: SelectedUtxos,
    fee: bigint,
    protocolParams: BlockfrostProtocolParams,
    stakeKeyHashHex: string,
    ttl: number,
    isStakeKeyRegistered: boolean,
    rewardsOnChain = 0n
  ): ReturnType<typeof buildTransactionBody> {
    const keyDeposit = BigInt(protocolParams.key_deposit);
    const { requiredLovelaces, minUtxo } = computeSelectionTarget(
      transaction,
      fee,
      protocolParams,
      isStakeKeyRegistered,
      paymentAddress
    );

    const certificates = buildCertificates(transaction, stakeKeyHashHex, isStakeKeyRegistered);
    const withdrawals = buildWithdrawals(transaction, stakeKeyHashHex, rewardsOnChain);

    const { inputs, totalLovelaces } = selected;

    // Rewards moving from the reward account into the wallet (0 for Delegate/Redelegate).
    const rewardsReceived = rewardAccountWithdrawal(transaction, rewardsOnChain);

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
      fee,
      ttl,
      certificates: certificates.length > 0 ? certificates : undefined,
      withdrawals: withdrawals.size > 0 ? withdrawals : undefined,
    });
  }

  /**
   * Fetches and validates the on-chain state both `sign()` and `prehash()` need:
   * protocol params, UTXOs, TTL, whether the stake key is registered, and the
   * withdrawable reward balance. Also enforces the transaction-type preconditions
   * (Undelegate requires a registered key; ClaimRewards must request a valid,
   * available amount) so both signing paths stay in lockstep.
   *
   * `transaction.account` must already be validated by the caller.
   */
  async function resolveChainState(
    transaction: Transaction,
    stakeKeyHashHex: string
  ): Promise<{
    protocolParams: BlockfrostProtocolParams;
    seedPage: BlockfrostUtxo[];
    ttl: number;
    isStakeKeyRegistered: boolean;
    rewardsOnChain: bigint;
  }> {
    // Every staking type except a first-ever Delegate benefits from the account:
    // Delegate/Redelegate need registration status, Undelegate/ClaimRewards need
    // both registration status and the reward balance.
    const needsAccount =
      transaction.type === "Delegate" ||
      transaction.type === "Redelegate" ||
      transaction.type === "Undelegate" ||
      transaction.type === "ClaimRewards";
    const rewardAccount = buildRewardAccount(stakeKeyHashHex);

    // Fetch UTXO page 1 here (in parallel with the rest); the paged selector reuses
    // it as the seed page and only fetches further pages if page 1 is insufficient.
    const [protocolParams, seedPage, latestBlock, existingAccount] = await Promise.all([
      rpcClient.getProtocolParams(),
      rpcClient.getUtxos(transaction.account as string),
      rpcClient.getLatestBlock(),
      needsAccount ? rpcClient.getAccountOrNull(rewardAccount) : Promise.resolve(null),
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
    // active: false/null covers "never registered" and "deregistered" — both need
    // a StakeRegistration cert (conservative).
    const isStakeKeyRegistered = existingAccount?.active === true;

    const rewardsOnChain =
      transaction.type === "Undelegate" || transaction.type === "ClaimRewards"
        ? parseLovelaceString(existingAccount?.withdrawable_amount ?? "0", "withdrawable_amount")
        : 0n;

    // A stake key that isn't registered cannot be deregistered, and there is no
    // 2 ADA deposit to refund — reject rather than build a tx the node will reject.
    if (transaction.type === "Undelegate" && !isStakeKeyRegistered) {
      throw new ValidationError(
        "UNSUPPORTED_OPERATION",
        "Cannot undelegate: the stake key is not registered on-chain (nothing to deregister)."
      );
    }

    // Cardano withdraws the ENTIRE reward balance (partial withdrawals are invalid),
    // so `transaction.amount` is validated but the full on-chain balance is claimed.
    if (transaction.type === "ClaimRewards") {
      if (transaction.amount <= 0n) {
        throw new ValidationError("INVALID_AMOUNT", "Claim amount must be greater than zero.");
      }
      if (rewardsOnChain <= 0n) {
        throw new ValidationError(
          "INVALID_AMOUNT",
          "No rewards are available to claim for this stake key."
        );
      }
      if (transaction.amount > rewardsOnChain) {
        throw new ValidationError(
          "INVALID_AMOUNT",
          `ClaimRewards amount (${transaction.amount} lovelace) exceeds on-chain rewards (${rewardsOnChain} lovelace).`
        );
      }
      if (transaction.amount !== rewardsOnChain) {
        logger.debug(
          "SignService: Cardano requires draining the full reward balance; claiming entire balance",
          { requested: transaction.amount.toString(), claimed: rewardsOnChain.toString() }
        );
      }
    }

    return { protocolParams, seedPage, ttl, isStakeKeyRegistered, rewardsOnChain };
  }

  /** Paginates the payment address's UTXOs (seeded with page 1) and selects inputs. */
  function selectInputs(
    transaction: Transaction,
    fee: bigint,
    protocolParams: BlockfrostProtocolParams,
    isStakeKeyRegistered: boolean,
    seedPage: BlockfrostUtxo[]
  ): Promise<SelectedUtxos> {
    const paymentAddress = transaction.account as string;
    const { target } = computeSelectionTarget(
      transaction,
      fee,
      protocolParams,
      isStakeKeyRegistered,
      paymentAddress
    );
    return selectUtxosPaged(target, {
      fetchPage: (page, count) => rpcClient.getUtxos(paymentAddress, page, count),
      seedPage,
      logger,
    });
  }

  return {
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
          "INVALID_FEE_TYPE",
          "Cardano transactions require a `UtxoFee`. Call `estimateFee()` first."
        );
      }

      checkIfPaymentAddressIsValid(transaction.account);

      // #4: the payment and staking keys must correspond to transaction.account,
      // otherwise the witnesses won't satisfy the tx and the node rejects it.
      const addrCreds = getBaseAddressCredentials(transaction.account);
      if (addrCreds.paymentKeyHashHex.toLowerCase() !== paymentPubKey.hash().hex().toLowerCase()) {
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "paymentPrivateKey does not correspond to transaction.account (payment credential mismatch)."
        );
      }
      if (addrCreds.stakeKeyHashHex.toLowerCase() !== stakeKeyHashHex.toLowerCase()) {
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "stakingPrivateKey does not correspond to transaction.account (stake credential mismatch)."
        );
      }

      const { protocolParams, seedPage, ttl, isStakeKeyRegistered, rewardsOnChain } =
        await resolveChainState(transaction, stakeKeyHashHex);

      const selected = await selectInputs(
        transaction,
        fee.total,
        protocolParams,
        isStakeKeyRegistered,
        seedPage
      );

      const body = buildBody(
        transaction,
        transaction.account,
        selected,
        fee.total,
        protocolParams,
        stakeKeyHashHex,
        ttl,
        isStakeKeyRegistered,
        rewardsOnChain
      );

      const txBodyHash = body.hash();

      const paymentSig = paymentPrivKey.sign(HexBlob(txBodyHash));
      const stakingSig = stakingPrivKey.sign(HexBlob(txBodyHash));

      const witnesses: TxWitness[] = [
        { vkeyHex: paymentPubKey.hex(), sigHex: paymentSig.hex() },
        { vkeyHex: stakingPubKey.hex(), sigHex: stakingSig.hex() },
      ];

      const txCborHex = buildSignedTransaction(body, witnesses);

      logger.debug("SignService: transaction signed", {
        txBodyHash,
        txSizeBytes: txCborHex.length / 2,
      });

      return txCborHex;
    },

    async prehash(preHashArgs: BaseSignArgs): Promise<PrehashResult> {
      if (!preHashArgs.transaction.account) {
        throw new ValidationError(
          "INVALID_ADDRESS",
          "transaction.account (payment address, addr1...) is required."
        );
      }

      if (preHashArgs.fee.type !== "UtxoFee") {
        throw new SigningError(
          "INVALID_FEE_TYPE",
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

      // #4: the staking key must match the address's stake credential. The payment
      // key is not available in the external-signing flow — its match against the
      // address is enforced later in compile().
      const addrCreds = getBaseAddressCredentials(preHashArgs.transaction.account);
      if (addrCreds.stakeKeyHashHex.toLowerCase() !== stakeKeyHashHex.toLowerCase()) {
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "stakingPublicKey does not correspond to transaction.account (stake credential mismatch)."
        );
      }

      const { protocolParams, seedPage, ttl, isStakeKeyRegistered, rewardsOnChain } =
        await resolveChainState(preHashArgs.transaction, stakeKeyHashHex);

      const selected = await selectInputs(
        preHashArgs.transaction,
        preHashArgs.fee.total,
        protocolParams,
        isStakeKeyRegistered,
        seedPage
      );

      const body = buildBody(
        preHashArgs.transaction,
        preHashArgs.transaction.account,
        selected,
        preHashArgs.fee.total,
        protocolParams,
        stakeKeyHashHex,
        ttl,
        isStakeKeyRegistered,
        rewardsOnChain
      );

      // Return the tx body hash — the exact 32-byte preimage the external signer must sign with Ed25519.
      // #2: Embed the serialised tx body so compile() can reconstruct it without re-fetching chain
      // state, preventing a signature mismatch if UTXOs or the block tip change in the interim.
      return {
        serializedTransaction: body.hash(),
        signArgs: { ...preHashArgs, _txBodyCbor: body.toCbor() } as CardanoPrehashArgs,
      };
    },

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

      assertHexBytes(paymentSigHex, 64, "paymentSigHex");
      assertHexBytes(stakingVKeyHex, 32, "stakingVKeyHex");
      assertHexBytes(stakingSigHex, 64, "stakingSigHex");
      assertHexBytes(paymentVKeyHex, 32, "paymentVKeyHex");

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
        throw new SigningError("INVALID_FEE_TYPE", "Cardano compile requires a `UtxoFee`.");
      }

      checkIfPaymentAddressIsValid(transaction.account);

      const stakeKeyHashHex = Ed25519PublicKey.fromHex(Ed25519PublicKeyHex(stakingVKeyHex))
        .hash()
        .hex();

      // #4: both witness keys must correspond to transaction.account. In the MPC flow
      // this is the first point the payment key is known, so it's validated here.
      const addrCreds = getBaseAddressCredentials(transaction.account);
      const paymentKeyHashHex = Ed25519PublicKey.fromHex(Ed25519PublicKeyHex(paymentVKeyHex))
        .hash()
        .hex();
      if (addrCreds.paymentKeyHashHex.toLowerCase() !== paymentKeyHashHex.toLowerCase()) {
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "paymentVKeyHex does not correspond to transaction.account (payment credential mismatch)."
        );
      }
      if (addrCreds.stakeKeyHashHex.toLowerCase() !== stakeKeyHashHex.toLowerCase()) {
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "stakingVKeyHex does not correspond to transaction.account (stake credential mismatch)."
        );
      }

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
    },
  };
}
