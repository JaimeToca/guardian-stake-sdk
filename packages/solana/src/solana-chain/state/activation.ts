import { DEFAULT_WARMUP_COOLDOWN_RATE, U64_MAX } from "./constants";

/** Derived activation status for a stake position. */
export type StakePositionStatus = "active" | "activating" | "deactivating" | "inactive";

/** Cluster-wide stake history entry for one epoch (StakeHistory sysvar). */
export interface StakeHistoryEntry {
  effective: bigint;
  activating: bigint;
  deactivating: bigint;
}

/** Epoch → cluster stake history. Missing epochs are treated as pruned. */
export type StakeHistoryMap = ReadonlyMap<bigint, StakeHistoryEntry>;

/** Delegation fields used by activation math. */
export interface DelegationInput {
  stake: bigint;
  activationEpoch: bigint;
  deactivationEpoch: bigint;
}

/** Result of `computeStakeActivation`. */
export interface StakeActivation {
  effective: bigint;
  activating: bigint;
  deactivating: bigint;
  status: StakePositionStatus;
}

/**
 * Port of Solana `Delegation::stake_activating_and_deactivating`.
 *
 * @param rate Warmup/cooldown rate for every epoch in the walk (mainnet post-feature: 0.09).
 *             Callers that need the historical 0.25→0.09 switch should pass a pre-resolved rate
 *             for the epochs under consideration, or invoke this per-epoch with a fixed rate.
 */
export function computeStakeActivation(
  delegation: DelegationInput,
  targetEpoch: bigint,
  history: StakeHistoryMap,
  rate: number = DEFAULT_WARMUP_COOLDOWN_RATE
): StakeActivation {
  const { effective, activating } = stakeAndActivating(delegation, targetEpoch, history, rate);

  if (targetEpoch < delegation.deactivationEpoch) {
    return withStatus({
      effective,
      activating,
      deactivating: 0n,
    });
  }

  if (targetEpoch === delegation.deactivationEpoch) {
    // Can only deactivate what's activated.
    return withStatus({
      effective,
      activating: 0n,
      deactivating: effective,
    });
  }

  // target_epoch > deactivation_epoch
  const entryAtDeactivation = history.get(delegation.deactivationEpoch);
  if (entryAtDeactivation === undefined) {
    // History pruned → assume fully deactivated.
    return withStatus({ effective: 0n, activating: 0n, deactivating: 0n });
  }

  let prevEpoch = delegation.deactivationEpoch;
  let prevCluster = entryAtDeactivation;
  let currentEffective = effective;

  for (;;) {
    const currentEpoch = prevEpoch + 1n;
    if (prevCluster.deactivating === 0n) {
      break;
    }

    const weight = Number(currentEffective) / Number(prevCluster.deactivating);
    const newlyNotEffectiveCluster = Number(prevCluster.effective) * rate;
    const newlyNotEffective = BigInt(Math.max(1, Math.trunc(weight * newlyNotEffectiveCluster)));

    currentEffective =
      currentEffective > newlyNotEffective ? currentEffective - newlyNotEffective : 0n;

    if (currentEffective === 0n) {
      break;
    }
    if (currentEpoch >= targetEpoch) {
      break;
    }

    const next = history.get(currentEpoch);
    if (next === undefined) {
      break;
    }
    prevEpoch = currentEpoch;
    prevCluster = next;
  }

  return withStatus({
    effective: currentEffective,
    activating: 0n,
    deactivating: currentEffective,
  });
}

/** Returned tuple is (effective, activating). */
function stakeAndActivating(
  delegation: DelegationInput,
  targetEpoch: bigint,
  history: StakeHistoryMap,
  rate: number
): { effective: bigint; activating: bigint } {
  const delegatedStake = delegation.stake;

  if (delegation.activationEpoch === U64_MAX) {
    // Bootstrap: fully effective immediately.
    return { effective: delegatedStake, activating: 0n };
  }

  if (delegation.activationEpoch === delegation.deactivationEpoch) {
    // Delegated + deactivated same epoch → zero stake.
    return { effective: 0n, activating: 0n };
  }

  if (targetEpoch === delegation.activationEpoch) {
    return { effective: 0n, activating: delegatedStake };
  }

  if (targetEpoch < delegation.activationEpoch) {
    return { effective: 0n, activating: 0n };
  }

  const entryAtActivation = history.get(delegation.activationEpoch);
  if (entryAtActivation === undefined) {
    // No history or dropped out → assume fully effective.
    return { effective: delegatedStake, activating: 0n };
  }

  let prevEpoch = delegation.activationEpoch;
  let prevCluster = entryAtActivation;
  let currentEffective = 0n;

  for (;;) {
    const currentEpoch = prevEpoch + 1n;
    if (prevCluster.activating === 0n) {
      break;
    }

    const remainingActivating = delegatedStake - currentEffective;
    const weight = Number(remainingActivating) / Number(prevCluster.activating);
    const newlyEffectiveCluster = Number(prevCluster.effective) * rate;
    const newlyEffective = BigInt(Math.max(1, Math.trunc(weight * newlyEffectiveCluster)));

    currentEffective += newlyEffective;
    if (currentEffective >= delegatedStake) {
      currentEffective = delegatedStake;
      break;
    }

    if (currentEpoch >= targetEpoch || currentEpoch >= delegation.deactivationEpoch) {
      break;
    }

    const next = history.get(currentEpoch);
    if (next === undefined) {
      break;
    }
    prevEpoch = currentEpoch;
    prevCluster = next;
  }

  return {
    effective: currentEffective,
    activating: delegatedStake - currentEffective,
  };
}

function withStatus(parts: {
  effective: bigint;
  activating: bigint;
  deactivating: bigint;
}): StakeActivation {
  return {
    ...parts,
    status: deriveStatus(parts),
  };
}

/** Map effective/activating/deactivating amounts to a single status label. */
export function deriveStatus(parts: {
  effective: bigint;
  activating: bigint;
  deactivating: bigint;
}): StakePositionStatus {
  if (parts.deactivating > 0n) return "deactivating";
  if (parts.activating > 0n) return "activating";
  if (parts.effective > 0n) return "active";
  return "inactive";
}

/** Build a Map history helper for tests and callers. */
export function stakeHistoryFromEntries(
  entries: ReadonlyArray<{ epoch: bigint; entry: StakeHistoryEntry }>
): Map<bigint, StakeHistoryEntry> {
  const map = new Map<bigint, StakeHistoryEntry>();
  for (const { epoch, entry } of entries) {
    map.set(epoch, entry);
  }
  return map;
}
