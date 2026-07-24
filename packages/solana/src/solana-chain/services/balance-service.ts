import type { Balance, Logger } from "@guardian-sdk/sdk";
import { NoopLogger } from "@guardian-sdk/sdk";
import type { SolanaRpcClientContract } from "../rpc/solana-rpc-client-contract";
import type { StakePositionCache } from "../state/stake-cache";
import { loadPositions, type LoadPositionsConfig } from "./load-positions";
import { mapPositionStatus, positionAmount } from "./staking-service";

export type SolanaBalanceServiceConfig = LoadPositionsConfig;

/**
 * Solana balances in lamports (1 SOL = 1_000_000_000).
 *
 * - `Available` — wallet liquid balance (`getBalance`)
 * - `Staked`    — Σ Active/activating position amounts
 * - `Pending`   — Σ deactivating position amounts
 * - `Claimable` — Σ fully inactive withdrawable lamports
 *
 * No `Rewards` entry — native stake rewards auto-compound into the stake account.
 * `getBalances` shares the stake-position cache with `getDelegations`.
 */
export function createBalanceService(
  rpc: SolanaRpcClientContract,
  cache: StakePositionCache,
  config: SolanaBalanceServiceConfig = {},
  logger: Logger = new NoopLogger()
) {
  return {
    async getBalances(address: string): Promise<Balance[]> {
      logger.debug("BalanceService: fetching balances", { address });

      const [available, positions] = await Promise.all([
        rpc.getBalance(address),
        loadPositions({ rpc, cache, config, logger }, address),
      ]);

      let staked = 0n;
      let pending = 0n;
      let claimable = 0n;

      for (const position of positions) {
        const status = mapPositionStatus(position.status);
        const amount = positionAmount(position);
        if (amount === 0n) continue;
        switch (status) {
          case "Active":
            staked += amount;
            break;
          case "Pending":
            pending += amount;
            break;
          case "Claimable":
            claimable += amount;
            break;
        }
      }

      logger.debug("BalanceService: balances fetched", {
        available: available.toString(),
        staked: staked.toString(),
        pending: pending.toString(),
        claimable: claimable.toString(),
      });

      return [
        { type: "Available", amount: available },
        { type: "Staked", amount: staked },
        { type: "Pending", amount: pending },
        { type: "Claimable", amount: claimable },
      ];
    },
  };
}

export type SolanaBalanceService = ReturnType<typeof createBalanceService>;
