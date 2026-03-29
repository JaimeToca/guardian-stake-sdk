import type { PublicClient } from "viem";
import { STAKING_CONTRACT } from "../abi/multicall-stake-abi";
import type { FeeServiceContract, SignServiceContract, Fee, Transaction, Logger } from "@guardian/sdk";
import { FeeType, ValidationError, ValidationErrorCode, NoopLogger } from "@guardian/sdk";
import { parseEvmAddress } from "../validations";

/**
 * Service class responsible for estimating transaction fees on the BNB chain.
 *
 * ## How BSC fees work
 *
 * BSC uses a legacy (pre-EIP-1559) gas model. The total fee paid is simply:
 *   fee = gasPrice × gasUsed
 *
 * The gas price is set by the network and enforced as a **fixed floor** — validators
 * will not include transactions below the minimum gas price (currently 1 Gwei on mainnet,
 * 0.1 Gwei observed in practice on some RPCs). There is no mempool-level priority fee
 * mechanism that would let you speed up a transaction by offering more.
 *
 * ## Why EIP-1559 cannot be used on BSC
 *
 * EIP-1559 introduced `maxFeePerGas` and `maxPriorityFeePerGas` (type-2 transactions).
 * While BSC nodes parse type-2 transactions, the staking contract at address
 * 0x0000000000000000000000000000000000002002 (StakeHub) is a system contract that runs
 * inside the consensus layer. System contract calls are validated differently and do not
 * support the EIP-1559 fee market — submitting a type-2 tx to StakeHub will be rejected.
 * All staking transactions must be sent as legacy type-0 transactions with a plain
 * `gasPrice` field.
 *
 * ## Gas price cannot be bumped
 *
 * Unlike Ethereum mainnet, BSC does not allow replacing a pending transaction with a
 * higher gas price (RBF / replace-by-fee). Once a staking transaction is submitted, you
 * cannot accelerate it by rebroadcasting with a higher `gasPrice`. The only option if a
 * transaction is stuck is to wait for it to expire from the mempool.
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
