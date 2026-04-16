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
 * Cardano fee service.
 *
 * ## How Cardano fees work
 *
 * The fee is calculated as:
 *   fee = minFeeA × txSizeInBytes + minFeeB
 *
 * Where `minFeeA` and `minFeeB` are protocol parameters (currently ~44 and ~155381).
 * The fee depends on the size of the serialised transaction, which in turn depends
 * on the fee itself (it's included in the tx body). We resolve this with a mock
 * transaction (zero-filled witnesses) that gives an accurate byte count.
 */
export class FeeService implements FeeServiceContract {
  /** Number of witnesses for a typical staking tx (payment key + staking key). */
  private static readonly STAKING_WITNESS_COUNT = 2;

  constructor(
    private readonly rpcClient: BlockfrostRpcClientContract,
    private readonly logger: Logger = new NoopLogger()
  ) {}

  async estimateFee(transaction: Transaction): Promise<Fee> {
    this.logger.debug("FeeService: estimating fee", {
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
      this.rpcClient.getProtocolParams(),
      this.rpcClient.getUtxos(transaction.account),
    ]);

    const txSizeBytes = this.estimateTxSize(
      transaction,
      transaction.account,
      utxos,
      protocolParams
    );
    const fee = this.calculateFee(txSizeBytes, protocolParams);

    this.logger.debug("FeeService: fee estimated", { txSizeBytes, fee: fee.toString() });

    return { type: "UtxoFee", txSizeBytes, total: fee } satisfies Fee;
  }

  private estimateTxSize(
    transaction: Transaction,
    paymentAddress: string,
    utxos: BlockfrostUtxo[],
    params: BlockfrostProtocolParams
  ): number {
    const keyDeposit = BigInt(params.key_deposit);
    const coinsPerUtxoByte = BigInt(params.coins_per_utxo_size ?? DEFAULT_COINS_PER_UTXO_SIZE);
    const minUtxo = computeMinOutputLovelace(paymentAddress, coinsPerUtxoByte);

    // Fee estimation uses worst-case: stake key always assumed unregistered.
    const certificates = buildCertificates(transaction, PLACEHOLDER_STAKE_KEY_HASH, false);
    const withdrawals = buildWithdrawals(transaction, PLACEHOLDER_STAKE_KEY_HASH);
    const required = computeRequiredLovelaces(transaction, 0n, keyDeposit, false);

    const { inputs, totalLovelaces, inputAssets } = selectUtxos(utxos, required + minUtxo);

    // Clamp to minUtxo: the mock change output must satisfy the minimum-ADA rule
    // so the serialised size (and therefore the fee estimate) is accurate.
    const rawChange = totalLovelaces - required;
    const txParams: TxBodyParams = {
      inputs,
      outputAddress: paymentAddress,
      outputLovelaces: rawChange < minUtxo ? minUtxo : rawChange,
      outputAssets: inputAssets,
      fee: 0n,
      certificates: certificates.length > 0 ? certificates : undefined,
      withdrawals: withdrawals.size > 0 ? withdrawals : undefined,
    };

    const mockCborHex = buildMockTransaction(txParams, FeeService.STAKING_WITNESS_COUNT);
    return mockCborHex.length / 2;
  }

  private calculateFee(txSizeBytes: number, params: BlockfrostProtocolParams): bigint {
    return BigInt(params.min_fee_a) * BigInt(txSizeBytes) + BigInt(params.min_fee_b);
  }
}
