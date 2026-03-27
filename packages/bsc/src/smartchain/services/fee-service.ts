import type { PublicClient } from "viem";
import { STAKING_CONTRACT } from "../abi/multicall-stake-abi";
import type { FeeServiceContract, SignServiceContract, Fee, Transaction } from "@guardian/sdk";
import { FeeType, ValidationError, ValidationErrorCode } from "@guardian/sdk";
import { parseEvmAddress } from "../validations";

/**
 * Service class responsible for estimating transaction fees on the BNB chain.
 */
export class FeeService implements FeeServiceContract {
  constructor(
    private readonly client: PublicClient,
    private readonly signService: SignServiceContract
  ) {}

  async estimateFee(transaction: Transaction): Promise<Fee> {
    const account =
      transaction.account !== undefined ? parseEvmAddress(transaction.account) : undefined;

    if (account === undefined) {
      throw new ValidationError(
        ValidationErrorCode.INVALID_ADDRESS,
        "Account address is required to estimate fee"
      );
    }

    const callDataResult = this.signService.buildCallData(transaction);

    const gasPricePromise = this.client.getGasPrice();
    const gasLimitPromise = this.client.estimateGas({
      account: account,
      to: STAKING_CONTRACT,
      value: callDataResult.amount,
      nonce: 0,
      data: callDataResult.data,
    });

    const [gasPrice, gasLimit] = await Promise.all([gasPricePromise, gasLimitPromise]);

    const increasedLimit = (gasLimit * BigInt(100 + 15)) / 100n;

    return {
      type: FeeType.GasFee,
      gasPrice: gasPrice,
      gasLimit: increasedLimit,
      total: gasPrice * increasedLimit,
    } as Fee;
  }
}
