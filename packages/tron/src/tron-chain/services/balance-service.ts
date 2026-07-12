import type { Balance, Logger } from "@guardian-sdk/sdk";
import { NoopLogger } from "@guardian-sdk/sdk";
import type { TronRpcClientContract } from "../rpc/tron-rpc-client-contract";

/**
 * Tron balances, all in SUN (1 TRX = 1_000_000 SUN). `getBalances` reads `getAccount` +
 * `getReward` and returns five non-overlapping types:
 *
 * - `Available` — liquid, spendable TRX (`account.balance`).
 * - `Staked`    — frozen principal still staked (Σ `frozenV2`), across both resources.
 * - `Pending`   — principal that has begun unfreezing but is still inside the ~14-day
 *                 bond (`unfreezing[].expireTime` in the future); not yet withdrawable.
 * - `Claimable` — principal whose unfreeze has matured (`expireTime` passed); withdrawable
 *                 now via a ClaimDelegate (WithdrawExpireUnfreeze) transaction.
 * - `Rewards`   — unclaimed voting rewards (`getReward`); only accrue once Tron Power is voted,
 *                 withdrawn independently via a ClaimRewards (WithdrawBalance) transaction.
 *
 * `Staked` and the `Pending`/`Claimable` split are mutually exclusive: once an amount starts
 * unfreezing it leaves `Staked`, so nothing is double-counted.
 */
export function createBalanceService(
  rpc: TronRpcClientContract,
  logger: Logger = new NoopLogger()
) {
  return {
    async getBalances(address: string): Promise<Balance[]> {
      logger.debug("BalanceService: fetching balances");
      const [account, rewards] = await Promise.all([
        rpc.getAccount(address),
        rpc.getReward(address),
      ]);
      const now = Date.now();
      const staked = account.frozen.reduce((s, f) => s + f.amount, 0n);
      const pending = account.unfreezing
        .filter((u) => u.expireTime > now)
        .reduce((s, u) => s + u.amount, 0n);
      const claimable = account.unfreezing
        .filter((u) => u.expireTime <= now)
        .reduce((s, u) => s + u.amount, 0n);
      logger.debug("BalanceService: balances fetched", {
        staked: staked.toString(),
        pending: pending.toString(),
        claimable: claimable.toString(),
      });
      return [
        { type: "Available", amount: account.balance },
        { type: "Staked", amount: staked },
        { type: "Pending", amount: pending },
        { type: "Claimable", amount: claimable },
        { type: "Rewards", amount: rewards },
      ];
    },
  };
}
