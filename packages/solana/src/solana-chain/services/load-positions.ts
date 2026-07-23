import type { Logger } from "@guardian-sdk/sdk";
import { NoopLogger } from "@guardian-sdk/sdk";
import type { SolanaRpcClientContract } from "../rpc/solana-rpc-client-contract";
import type { SolanaAccountInfo, SolanaStakeProgramAccount } from "../rpc/solana-rpc-types";
import {
  computeStakeActivation,
  stakeHistoryFromEntries,
  type StakeHistoryMap,
} from "../state/activation";
import {
  DEFAULT_SEED_SCAN_GAP_LIMIT,
  DEFAULT_SEED_SCAN_MAX,
  DEFAULT_STAKE_CACHE_TTL_MS,
  DEFAULT_WARMUP_COOLDOWN_RATE,
  STAKE_PROGRAM_ADDRESS,
} from "../state/constants";
import { decodeStakeAccount, toStakePosition, type StakePosition } from "../state/stake-account";
import type { StakePositionCache } from "../state/stake-cache";
import { deriveStakeAddress, seedString } from "../state/seed";

/** Batch size for seed-scan `getMultipleAccounts` (RPC hard max is 100). */
const SEED_SCAN_BATCH = 50;

export interface LoadPositionsConfig {
  seedScanGapLimit?: number;
  seedScanMax?: number;
  stakeCacheTtlMs?: number;
  enableGpaFallback?: boolean;
  /** Warmup/cooldown rate for activation math (default mainnet 0.09). */
  warmupCooldownRate?: number;
}

export interface LoadPositionsDeps {
  rpc: SolanaRpcClientContract;
  cache: StakePositionCache;
  config?: LoadPositionsConfig;
  logger?: Logger;
}

/**
 * Discover stake positions for an authority via shared cache → seed-scan → optional GPA.
 * Used by both `getDelegations` and `getBalances` so they share one cache entry.
 */
export async function loadPositions(
  deps: LoadPositionsDeps,
  authority: string
): Promise<StakePosition[]> {
  const logger = deps.logger ?? new NoopLogger();
  const config = deps.config ?? {};
  const gapLimit = config.seedScanGapLimit ?? DEFAULT_SEED_SCAN_GAP_LIMIT;
  const seedMax = config.seedScanMax ?? DEFAULT_SEED_SCAN_MAX;
  const cacheTtl = config.stakeCacheTtlMs ?? DEFAULT_STAKE_CACHE_TTL_MS;
  const rate = config.warmupCooldownRate ?? DEFAULT_WARMUP_COOLDOWN_RATE;
  const enableGpa = config.enableGpaFallback === true;

  const cached = deps.cache.get(authority);
  if (cached) {
    logger.debug("loadPositions: cache hit", { authority, count: cached.length });
    return cached;
  }

  logger.debug("loadPositions: cache miss — seed-scanning", {
    authority,
    seedMax,
    gapLimit,
  });

  const byAddress = await seedScan(deps.rpc, authority, seedMax, gapLimit, logger);

  if (enableGpa) {
    await mergeGpaFallback(deps.rpc, authority, byAddress, logger);
  }

  if (byAddress.size === 0) {
    deps.cache.set(authority, [], cacheTtl);
    return [];
  }

  const [epoch, historyRows] = await Promise.all([
    deps.rpc.getClockEpoch(),
    deps.rpc.getStakeHistory(),
  ]);
  const history: StakeHistoryMap = stakeHistoryFromEntries(
    historyRows.map((row) => ({
      epoch: row.epoch,
      entry: {
        effective: row.effective,
        activating: row.activating,
        deactivating: row.deactivating,
      },
    }))
  );

  const positions: StakePosition[] = [];
  for (const { account, seedIndex } of byAddress.values()) {
    const view = decodeStakeAccount(account.data);
    if (view === null) continue;
    if (view.staker !== authority || view.withdrawer !== authority) continue;

    // Uninitialized / RewardsPool have no authority — already filtered above.
    // Zero-lamport accounts are closed / empty; omit.
    if (account.lamports === 0n) continue;

    const activation =
      view.kind === "Stake"
        ? computeStakeActivation(
            {
              stake: view.delegatedStake,
              activationEpoch: view.activationEpoch,
              deactivationEpoch: view.deactivationEpoch,
            },
            epoch,
            history,
            rate
          )
        : undefined;

    positions.push(
      toStakePosition({
        stakeAccount: account.address,
        seedIndex,
        lamports: account.lamports,
        view,
        activation,
      })
    );
  }

  // Stable order: seed index ascending, then address.
  positions.sort((a, b) => {
    const ai = a.seedIndex ?? Number.MAX_SAFE_INTEGER;
    const bi = b.seedIndex ?? Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.stakeAccount < b.stakeAccount ? -1 : a.stakeAccount > b.stakeAccount ? 1 : 0;
  });

  deps.cache.set(authority, positions, cacheTtl);
  logger.debug("loadPositions: cached positions", { authority, count: positions.length });
  return positions;
}

interface ScannedAccount {
  account: SolanaAccountInfo;
  seedIndex: number | undefined;
}

async function seedScan(
  rpc: SolanaRpcClientContract,
  authority: string,
  seedMax: number,
  gapLimit: number,
  logger: Logger
): Promise<Map<string, ScannedAccount>> {
  const found = new Map<string, ScannedAccount>();
  let consecutiveEmpty = 0;

  for (let start = 0; start <= seedMax; start += SEED_SCAN_BATCH) {
    const end = Math.min(start + SEED_SCAN_BATCH - 1, seedMax);
    const indices: number[] = [];
    for (let i = start; i <= end; i++) indices.push(i);

    const addresses = indices.map((i) => deriveStakeAddress(authority, seedString(i)));
    const accounts = await rpc.getMultipleAccounts(addresses);

    let stop = false;
    for (let j = 0; j < indices.length; j++) {
      const seedIndex = indices[j]!;
      const info = accounts[j] ?? null;
      if (info === null) {
        consecutiveEmpty += 1;
        if (consecutiveEmpty >= gapLimit) {
          logger.debug("loadPositions: seed-scan gap limit reached", {
            seedIndex,
            gapLimit,
          });
          stop = true;
          break;
        }
        continue;
      }

      consecutiveEmpty = 0;

      // Only stake-program accounts are candidates.
      if (info.owner !== STAKE_PROGRAM_ADDRESS) {
        continue;
      }

      found.set(info.address, { account: info, seedIndex });
    }

    if (stop) break;
  }

  return found;
}

async function mergeGpaFallback(
  rpc: SolanaRpcClientContract,
  authority: string,
  byAddress: Map<string, ScannedAccount>,
  logger: Logger
): Promise<void> {
  let gpaAccounts: SolanaStakeProgramAccount[];
  try {
    gpaAccounts = await rpc.getProgramAccountsStakeByStaker(authority);
  } catch (err) {
    logger.error("loadPositions: GPA fallback failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  let merged = 0;
  for (const row of gpaAccounts) {
    if (byAddress.has(row.address)) continue;
    const view = decodeStakeAccount(row.data);
    if (view === null) continue;
    if (view.staker !== authority) continue;
    // v1: require withdrawer match as well.
    if (view.withdrawer !== undefined && view.withdrawer !== authority) continue;

    byAddress.set(row.address, {
      account: {
        address: row.address,
        lamports: row.lamports,
        data: row.data,
        owner: STAKE_PROGRAM_ADDRESS,
      },
      seedIndex: undefined,
    });
    merged += 1;
  }

  if (merged > 0) {
    logger.debug("loadPositions: GPA fallback merged missing accounts", {
      authority,
      merged,
    });
  }
}
