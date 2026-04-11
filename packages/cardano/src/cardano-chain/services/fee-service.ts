import type { Fee, FeeServiceContract, Logger, Transaction } from "@guardian-sdk/sdk";
import { NoopLogger, ValidationError } from "@guardian-sdk/sdk";
import type { BlockfrostRpcClientContract } from "../rpc/blockfrost-rpc-client-contract";
import type { BlockfrostProtocolParams, BlockfrostUtxo } from "../rpc/blockfrost-rpc-types";
import { selectUtxos, DEFAULT_COINS_PER_UTXO_SIZE, UTXO_OUTPUT_SIZE_BYTES } from "../tx/coin-selection";
import { buildMockTransaction, type CardanoCertificate, type TxBodyParams } from "../tx/tx-builder";
import { buildRewardAccount, checkIfPaymentAddressIsValid, parsePoolId } from "../validations";

/**
 * A placeholder stake address used for Claim fee estimation.
 * Any valid mainnet stake address works — the key hash doesn't matter because
 * all mainnet stake addresses encode to the same CBOR byte length.
 * Derived from an all-zeros 28-byte stake key hash.
 */
const PLACEHOLDER_REWARD_ACCOUNT = buildRewardAccount("00".repeat(28));

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
    const minUtxo = BigInt(params.coins_per_utxo_size ?? DEFAULT_COINS_PER_UTXO_SIZE) * UTXO_OUTPUT_SIZE_BYTES;
    const certificates = this.buildCertificates(transaction);
    const withdrawals =
      transaction.type === "Claim"
        ? new Map([[PLACEHOLDER_REWARD_ACCOUNT, transaction.amount]])
        : undefined;

    const required = this.computeRequiredLovelaces(transaction, 0n, keyDeposit);
    const { inputs, totalLovelaces } = selectUtxos(utxos, required + minUtxo);

    const params_: TxBodyParams = {
      inputs,
      outputAddress: paymentAddress,
      outputLovelaces: totalLovelaces - required,
      fee: 0n,
      certificates: certificates.length > 0 ? certificates : undefined,
      withdrawals,
    };

    const mockCborHex = buildMockTransaction(params_, FeeService.STAKING_WITNESS_COUNT);
    return mockCborHex.length / 2;
  }

  private calculateFee(txSizeBytes: number, params: BlockfrostProtocolParams): bigint {
    return BigInt(params.min_fee_a) * BigInt(txSizeBytes) + BigInt(params.min_fee_b);
  }

  private computeRequiredLovelaces(
    transaction: Transaction,
    fee: bigint,
    keyDeposit: bigint
  ): bigint {
    switch (transaction.type) {
      case "Delegate":
        return fee + keyDeposit;
      case "Undelegate":
        return fee;
      case "Claim":
        return fee;
      case "Redelegate":
        return fee;
    }
  }

  private buildCertificates(transaction: Transaction): CardanoCertificate[] {
    const placeholderHash = "00".repeat(28);

    if (transaction.type === "Delegate" || transaction.type === "Redelegate") {
      const validator =
        transaction.type === "Delegate" ? transaction.validator : transaction.toValidator;
      const poolId = typeof validator === "string" ? validator : validator.operatorAddress;
      const poolKeyHashHex = parsePoolId(poolId);

      const certs: CardanoCertificate[] = [];
      if (transaction.type === "Delegate") {
        certs.push({ type: "StakeRegistration", stakeKeyHashHex: placeholderHash });
      }
      certs.push({ type: "StakeDelegation", stakeKeyHashHex: placeholderHash, poolKeyHashHex });
      return certs;
    }

    if (transaction.type === "Undelegate") {
      return [{ type: "StakeDeregistration", stakeKeyHashHex: placeholderHash }];
    }

    return [];
  }
}
