import type { Fee, FeeServiceContract, Logger, Transaction } from "@guardian-sdk/sdk";
import { NoopLogger, ValidationError } from "@guardian-sdk/sdk";
import type { BlockfrostRpcClientContract } from "../rpc/blockfrost-rpc-client-contract";
import type { BlockfrostProtocolParams, BlockfrostUtxo } from "../rpc/blockfrost-rpc-types";
import { selectUtxos, DEFAULT_COINS_PER_UTXO_SIZE } from "../tx/coin-selection";
import { buildMockTransaction, type TxBodyParams } from "../tx/tx-builder";
import {
  buildCertificates,
  buildWithdrawals,
  computeMinOutputLovelace,
  computeRequiredLovelaces,
} from "../tx/tx-helpers";
import { checkIfPaymentAddressIsValid } from "../validations";

/**
 * Stake key hash placeholder used for fee estimation.
 * Any 28-byte value works — all mainnet stake addresses serialise to the same CBOR byte length.
 */
const PLACEHOLDER_STAKE_KEY_HASH = "00".repeat(28);

/**
 * Safety buffer applied on top of the calculated fee (10%).
 * Covers minor UTXO count variations without requiring iteration.
 */
const FEE_BUFFER_PERCENT = 10n;

/** Number of witnesses for a typical staking tx (payment key + staking key). */
const STAKING_WITNESS_COUNT = 2;

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
    utxos: BlockfrostUtxo[],
    params: BlockfrostProtocolParams,
    feePlaceholder: bigint
  ): number {
    const keyDeposit = BigInt(params.key_deposit);
    const coinsPerUtxoByte = BigInt(params.coins_per_utxo_size ?? DEFAULT_COINS_PER_UTXO_SIZE);
    const minUtxo = computeMinOutputLovelace(paymentAddress, coinsPerUtxoByte);

    // Worst-case assumptions: stake key unregistered (registration cert included).
    const certificates = buildCertificates(transaction, PLACEHOLDER_STAKE_KEY_HASH, false);
    const withdrawals = buildWithdrawals(transaction, PLACEHOLDER_STAKE_KEY_HASH);
    const required = computeRequiredLovelaces(transaction, feePlaceholder, keyDeposit, false);

    const { inputs, totalLovelaces } = selectUtxos(utxos, required + minUtxo);

    // Clamp to minUtxo: the mock change output must satisfy the minimum-ADA rule
    // so the serialised size (and therefore the fee estimate) is accurate.
    const rawChange = totalLovelaces - required;
    const txParams: TxBodyParams = {
      inputs,
      outputAddress: paymentAddress,
      outputLovelaces: rawChange < minUtxo ? minUtxo : rawChange,
      fee: feePlaceholder,
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

      checkIfPaymentAddressIsValid(transaction.account);

      const [protocolParams, utxos] = await Promise.all([
        rpcClient.getProtocolParams(),
        rpcClient.getUtxos(transaction.account),
      ]);

      const txSizeBytes = estimateTxSize(
        transaction,
        transaction.account,
        utxos,
        protocolParams,
        BigInt(protocolParams.min_fee_b)
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
