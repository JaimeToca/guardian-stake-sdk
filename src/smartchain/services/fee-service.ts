import { Hex, PublicClient } from "viem";
import { FeeServiceContract } from "./fee-service-contract";
import { Fee } from "./fee-types";
import { Transaction } from "./transaction-types";
import { STAKING_CONTRACT } from "../abi/stake-abi";
import { parseAccount } from "viem/utils";
import { SignServiceContract } from "./sign-service-contract";

export class FeeService implements FeeServiceContract {
  constructor(
    private readonly client: PublicClient,
    private readonly signService: SignServiceContract
  ) {}

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
      gasPrice: gasPrice,
      gasLimit: increasedLimit,
      total: gasPrice * gasLimit,
    } as Fee;
  }
}
