import type { PublicClient } from "viem";
import { STAKING_CONTRACT } from "../abi/multicall-stake-abi";
import type { FeeServiceContract, Fee, Transaction, Logger } from "@guardian-sdk/sdk";
import type { BscSignServiceContract } from "../sign-types";
import { ValidationError, NoopLogger } from "@guardian-sdk/sdk";
import { parseEvmAddress } from "../validations";

/**
 * Sanity bounds for RPC-reported `gasPrice`/`gasLimit` (M-BSC-1).
 *
 * A hostile or buggy RPC can return a `gasPrice` far above any real network
 * price (fund loss via excess fee) or a `gasLimit` of zero / absurdly large
 * (out-of-gas failure or a nonsensical fee total). These bounds reject those
 * outliers and floor `gasPrice` at a sane network minimum; normal mainnet
 * responses (single-digit-to-low-double-digit Gwei, tens/hundreds of
 * thousands of gas) never come close to either edge.
 */
// 0.01 Gwei — below the lowest gas price ever observed on real BSC RPCs
// (mainnet documents a 1 Gwei floor; some RPCs have been seen reporting as
// low as ~0.05-0.1 Gwei). This floor only catches a `0`/near-zero outlier,
// it does not enforce the "official" 1 Gwei minimum, so real low-but-nonzero
// RPC readings pass through unclamped.
const MIN_GAS_PRICE_WEI = 10_000_000n;
// 100 Gwei ceiling — BSC mainnet gas price has stayed near 1-5 Gwei for years;
// 100 Gwei is generously above any observed value while still catching a
// broken/hostile RPC reporting orders of magnitude too high.
const MAX_GAS_PRICE_WEI = 100_000_000_000n;
// BSC's own block gas limit is ~140M; 100M is a generous ceiling for a single
// staking-contract call (which typically costs well under 500k gas).
const MAX_GAS_LIMIT = 100_000_000n;

function assertSaneGasPrice(gasPrice: bigint): bigint {
  if (gasPrice > MAX_GAS_PRICE_WEI) {
    throw new ValidationError(
      "INVALID_FEE",
      `RPC-reported gasPrice exceeds the sanity ceiling (max ${MAX_GAS_PRICE_WEI} wei).`
    );
  }
  return gasPrice < MIN_GAS_PRICE_WEI ? MIN_GAS_PRICE_WEI : gasPrice;
}

function assertSaneGasLimit(gasLimit: bigint): void {
  if (gasLimit <= 0n) {
    throw new ValidationError("INVALID_FEE", "RPC-reported gasLimit must be greater than zero.");
  }
  if (gasLimit > MAX_GAS_LIMIT) {
    throw new ValidationError(
      "INVALID_FEE",
      `RPC-reported gasLimit exceeds the sanity ceiling (max ${MAX_GAS_LIMIT}).`
    );
  }
}

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

      const [rawGasPrice, rawGasLimit] = await Promise.all([
        client.getGasPrice(),
        client.estimateGas({
          account,
          to: STAKING_CONTRACT,
          value: callData.amount,
          data: callData.data,
        }),
      ]);

      assertSaneGasLimit(rawGasLimit);
      const gasPrice = assertSaneGasPrice(rawGasPrice);

      const increasedLimit = (rawGasLimit * 115n) / 100n;
      assertSaneGasLimit(increasedLimit);

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
