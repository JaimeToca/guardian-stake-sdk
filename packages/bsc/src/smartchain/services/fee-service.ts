import type { PublicClient } from "viem";
import { STAKING_CONTRACT } from "../abi/multicall-stake-abi";
import type { FeeServiceContract, SignServiceContract, Fee, Transaction, Logger } from "@guardian/sdk";
import { FeeType, ValidationError, ValidationErrorCode, NoopLogger } from "@guardian/sdk";
import { parseEvmAddress } from "../validations";

/**
 * Service class responsible for estimating transaction fees on the BNB chain.
 */
export class FeeService implements FeeServiceContract {
  constructor(
    private readonly client: PublicClient,
    private readonly signService: SignServiceContract,
    private readonly logger: Logger = new NoopLogger()
  ) {}

  async estimateFee(transaction: Transaction): Promise<Fee> {
    this.logger.debug("FeeService: estimating fee", {
      type: transaction.type,
      chain: transaction.chain.id,
    });

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

    this.logger.debug("FeeService: fee estimated", {
      gasPrice: gasPrice.toString(),
      gasLimit: increasedLimit.toString(),
      total: (gasPrice * increasedLimit).toString(),
    });

    return {
      type: FeeType.GasFee,
      gasPrice: gasPrice,
      gasLimit: increasedLimit,
      total: gasPrice * increasedLimit,
    } as Fee;
  }
}
