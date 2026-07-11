import type { Balance } from "@guardian-sdk/sdk";
import type { TronRpcClientContract } from "../rpc/tron-rpc-client-contract";

export function createBalanceService(rpc: TronRpcClientContract) {
  return {
    async getBalances(address: string): Promise<Balance[]> {
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
