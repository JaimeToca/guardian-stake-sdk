import type { Fee, FeeServiceContract, Logger, Transaction } from "@guardian-sdk/sdk";
import { NoopLogger, ValidationError } from "@guardian-sdk/sdk";
import type { BlockfrostRpcClientContract } from "../rpc/blockfrost-rpc-client-contract";
import type { BlockfrostProtocolParams } from "../rpc/blockfrost-rpc-types";
import { selectUtxosPaged, type SelectedUtxos } from "../tx/coin-selection";
import { buildMockTransaction, type TxBodyParams } from "../tx/tx-builder";
import { buildCertificates, buildWithdrawals, computeSelectionTarget } from "../tx/tx-helpers";
import {
  buildRewardAccount,
  checkIfPaymentAddressIsValid,
  getBaseAddressCredentials,
  parseLovelaceString,
} from "../validations";

/**
 * Safety buffer applied on top of the calculated fee (10%).
 * Covers UTXO-set changes between estimation and signing without requiring iteration.
 */
const FEE_BUFFER_PERCENT = 10n;

/** Number of witnesses for a typical staking tx (payment key + staking key). */
const STAKING_WITNESS_COUNT = 2;

/**
 * Placeholder slot for the mock transaction's TTL. The signed tx always sets a
 * `validityInterval` (tip + a few hours); its exact value is irrelevant to the tx
 * size — only the CBOR byte-width of the slot integer matters. Any value in the
 * 5-byte uint range (2^16 .. 2^32) encodes identically to a real mainnet slot, so
 * the mock's TTL entry has the same size as the one the node will validate.
 */
const PLACEHOLDER_TTL = 200_000_000;

/**
 * Cardano fee service.
 *
 * ## How Cardano fees work
 *
 * The fee is calculated as:
 *   fee = minFeeA × txSizeInBytes + minFeeB
 *
 * Where `minFeeA` and `minFeeB` are protocol parameters (currently ~44 and ~155381).
 * Staking transactions have a predictable, near-fixed structure (same certificate
 * count and output count for every user), so a single-pass estimate with a small
 * buffer is accurate and simpler than iterating.
 *
 * ## Fee placeholder
 *
 * The fee field is part of the CBOR-encoded tx body, so its byte width affects
 * the tx size and therefore the fee itself. Using 0n as a placeholder would
 * encode as 1 CBOR byte while real fees encode as 5 bytes — causing a slight
 * underestimate. Instead we use `minFeeB` (the protocol's base fee constant,
 * currently ~155,381 lovelaces) which is always close to the real fee and
 * encodes with the same CBOR width. This is derived from protocol params so it
 * stays correct if the Cardano protocol ever adjusts `minFeeB`.
 */
export function createFeeService(
  rpcClient: BlockfrostRpcClientContract,
  logger: Logger = new NoopLogger()
): FeeServiceContract {
  function estimateTxSize(
    transaction: Transaction,
    paymentAddress: string,
    selected: SelectedUtxos,
    params: BlockfrostProtocolParams,
    feePlaceholder: bigint,
    stakeKeyHashHex: string,
    isStakeKeyRegistered: boolean,
    rewardsOnChain: bigint
  ): number {
    const { requiredLovelaces, minUtxo } = computeSelectionTarget(
      transaction,
      feePlaceholder,
      params,
      isStakeKeyRegistered,
      paymentAddress
    );

    const certificates = buildCertificates(transaction, stakeKeyHashHex, isStakeKeyRegistered);
    // Mirror the signed tx exactly: both ClaimRewards and Undelegate sweep the full
    // on-chain reward balance, so the mock carries the same withdrawals map (and
    // therefore the same CBOR size) as the tx `sign()` submits.
    const withdrawals = buildWithdrawals(transaction, stakeKeyHashHex, rewardsOnChain);

    // Clamp to minUtxo: the mock change output must satisfy the minimum-ADA rule
    // so the serialised size (and therefore the fee estimate) is accurate.
    const rawChange = selected.totalLovelaces - requiredLovelaces;
    const txParams: TxBodyParams = {
      inputs: selected.inputs,
      outputAddress: paymentAddress,
      outputLovelaces: rawChange < minUtxo ? minUtxo : rawChange,
      fee: feePlaceholder,
      // The signed tx always sets a TTL; include one so the mock size matches.
      ttl: PLACEHOLDER_TTL,
      certificates: certificates.length > 0 ? certificates : undefined,
      withdrawals: withdrawals.size > 0 ? withdrawals : undefined,
    };

    const mockCborHex = buildMockTransaction(txParams, STAKING_WITNESS_COUNT);
    return mockCborHex.length / 2;
  }

  function calculateFee(txSizeBytes: number, params: BlockfrostProtocolParams): bigint {
    return BigInt(params.min_fee_a) * BigInt(txSizeBytes) + BigInt(params.min_fee_b);
  }

  return {
    async estimateFee(transaction: Transaction): Promise<Fee> {
      logger.debug("FeeService: estimating fee", {
        type: transaction.type,
        chain: transaction.chain.id,
      });

      if (!transaction.account) {
        throw new ValidationError(
          "INVALID_ADDRESS",
          "transaction.account (payment address, addr1...) is required for Cardano fee estimation."
        );
      }

      const paymentAddress = transaction.account;
      checkIfPaymentAddressIsValid(paymentAddress);

      // The stake credential lives in the base address; use it (not a placeholder)
      // to fetch the reward account so the estimate sees the SAME registration
      // status and reward balance the signing path will act on.
      const { stakeKeyHashHex } = getBaseAddressCredentials(paymentAddress);
      const rewardAccount = buildRewardAccount(stakeKeyHashHex);

      // Fetch UTXO page 1 and the reward account in parallel; the paged selector
      // reuses the UTXO page and only pulls further pages if page 1 doesn't cover
      // the (bounded) staking target.
      const [protocolParams, seedPage, existingAccount] = await Promise.all([
        rpcClient.getProtocolParams(),
        rpcClient.getUtxos(paymentAddress),
        rpcClient.getAccountOrNull(rewardAccount),
      ]);

      // Use the real on-chain registration status so the estimate's certificate
      // set and selection target match the signed tx (no worst-case guessing that
      // could diverge from the actual tx and under- or over-shoot the fee).
      const isStakeKeyRegistered = existingAccount?.active === true;
      // Reward balance swept by ClaimRewards/Undelegate; 0 for the other types.
      const rewardsOnChain =
        transaction.type === "Undelegate" || transaction.type === "ClaimRewards"
          ? parseLovelaceString(existingAccount?.withdrawable_amount ?? "0", "withdrawable_amount")
          : 0n;

      const feePlaceholder = BigInt(protocolParams.min_fee_b);
      const { target } = computeSelectionTarget(
        transaction,
        feePlaceholder,
        protocolParams,
        isStakeKeyRegistered,
        paymentAddress
      );
      const selected = await selectUtxosPaged(target, {
        fetchPage: (page, count) => rpcClient.getUtxos(paymentAddress, page, count),
        seedPage,
        logger,
      });

      const txSizeBytes = estimateTxSize(
        transaction,
        paymentAddress,
        selected,
        protocolParams,
        feePlaceholder,
        stakeKeyHashHex,
        isStakeKeyRegistered,
        rewardsOnChain
      );
      const baseFee = calculateFee(txSizeBytes, protocolParams);
      const fee = baseFee + (baseFee * FEE_BUFFER_PERCENT) / 100n;

      logger.debug("FeeService: fee estimated", {
        txSizeBytes,
        baseFee: baseFee.toString(),
        fee: fee.toString(),
      });

      return { type: "UtxoFee", txSizeBytes, total: fee } satisfies Fee;
    },
  };
}
