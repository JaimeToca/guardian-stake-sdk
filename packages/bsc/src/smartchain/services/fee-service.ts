import type { PublicClient } from "viem";
import { STAKING_CONTRACT } from "../abi/multicall-stake-abi";
import type { FeeServiceContract, Fee, Transaction, Logger } from "@guardian-sdk/sdk";
import type { BscSignServiceContract } from "../sign-types";
import { ValidationError, NoopLogger } from "@guardian-sdk/sdk";
import { parseEvmAddress } from "../validations";

/**
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
export function createFeeService(
  client: PublicClient,
  signService: BscSignServiceContract,
  logger: Logger = new NoopLogger()
): FeeServiceContract {
  return {
    async estimateFee(transaction: Transaction): Promise<Fee> {
      logger.debug("FeeService: estimating fee", {
        type: transaction.type,
        chain: transaction.chain.id,
      });

      if (transaction.account === undefined) {
        throw new ValidationError("INVALID_ADDRESS", "Account address is required to estimate fee");
      }

      const account = parseEvmAddress(transaction.account);
      const callData = await signService.buildCallData(transaction);

      const [gasPrice, gasLimit] = await Promise.all([
        client.getGasPrice(),
        client.estimateGas({
          account,
          to: STAKING_CONTRACT,
          value: callData.amount,
          data: callData.data,
        }),
      ]);

      const increasedLimit = (gasLimit * 115n) / 100n;

      logger.debug("FeeService: fee estimated", {
        gasPrice: gasPrice.toString(),
        gasLimit: increasedLimit.toString(),
        total: (gasPrice * increasedLimit).toString(),
      });

      return {
        type: "GasFee",
        gasPrice,
        gasLimit: increasedLimit,
        total: gasPrice * increasedLimit,
      } as Fee;
    },
  };
}
