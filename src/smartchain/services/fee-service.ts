import { Hex, PublicClient } from "viem";
import { STAKING_CONTRACT } from "../abi/multicall-stake-abi";
import { parseAccount } from "viem/utils";
import { FeeServiceContract, SignServiceContract, Fee, FeeType, Transaction } from "../../common";

/**
 * Service class responsible for estimating transaction fees on the BNB chain.
 * It interacts with a PublicClient (Viem) to get gas prices and estimate gas limits,
 * and uses a SignService to build transaction call data.
 */
export class FeeService implements FeeServiceContract {
   /**
   * Constructs an instance of FeeService.
   * @param client The PublicClient instance used for interacting
   * with the blockchain (e.g., getting gas price, estimating gas).
   * @param signService The SignServiceContract instance used for building transaction call data.
   */
  constructor(
    private readonly client: PublicClient,
    private readonly signService: SignServiceContract
  ) {}

  /**
   * Estimates the gas price, gas limit, and total fee for a given transaction.
   * This method performs two asynchronous calls concurrently: one to get the current gas price
   * and another to estimate the gas required for the transaction.
   *
   * @param transaction The transaction object containing details needed to estimate the fee (e.g., amount, recipient, type).
   * @returns A Promise that resolves to a `Fee` object, containing `gasPrice`, `gasLimit`, and `total` fee.
   */
  async estimateFee(transaction: Transaction): Promise<Fee> {
    const transactionAccount = transaction.account;
    const account = transactionAccount
      ? parseAccount(transactionAccount)
      : undefined;
    const callDataResult = this.signService.buildCallData(transaction);

    const gasPricePromise = this.client.getGasPrice();
    const gasLimitPromise = this.client.estimateGas({
      account: account,
      to: STAKING_CONTRACT,
      value: callDataResult.amount,
      nonce: 0,
      data: callDataResult.data,
    });

    const [gasPrice, gasLimit] = await Promise.all([
      gasPricePromise,
      gasLimitPromise,
    ]);

    const increasedLimit = (gasLimit * BigInt(100 + 15)) / 100n; // increase by 15% for safety

    return {
      type: FeeType.GasFee,
      gasPrice: gasPrice,
      gasLimit: increasedLimit,
      total: gasPrice * increasedLimit,
    } as Fee;
  }
}
