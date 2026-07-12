import type { Balance, Logger } from "@guardian-sdk/sdk";
import { NoopLogger } from "@guardian-sdk/sdk";
import type { TronRpcClientContract } from "../rpc/tron-rpc-client-contract";

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
