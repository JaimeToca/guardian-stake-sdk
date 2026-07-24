import { describe, it, expect } from "vitest";
import {
  computeStakeActivation,
  stakeHistoryFromEntries,
  type DelegationInput,
  type StakeHistoryEntry,
} from "../../src/solana-chain/state/activation";
import { DEFAULT_WARMUP_COOLDOWN_RATE, U64_MAX } from "../../src/solana-chain/state/constants";

const RATE = DEFAULT_WARMUP_COOLDOWN_RATE; // 0.09

function entry(
  effective: bigint | number,
  activating: bigint | number = 0,
  deactivating: bigint | number = 0
): StakeHistoryEntry {
  return {
    effective: BigInt(effective),
    activating: BigInt(activating),
    deactivating: BigInt(deactivating),
  };
}

describe("computeStakeActivation", () => {
  it("bootstrap activation_epoch == u64::MAX → fully effective", () => {
    const d: DelegationInput = {
      stake: 5_000_000_000n,
      activationEpoch: U64_MAX,
      deactivationEpoch: U64_MAX,
    };
    const result = computeStakeActivation(d, 100n, new Map(), RATE);
    expect(result).toEqual({
      effective: 5_000_000_000n,
      activating: 0n,
      deactivating: 0n,
      status: "active",
    });
  });

  it("target_epoch == activation_epoch → all activating", () => {
    const d: DelegationInput = {
      stake: 1_000n,
      activationEpoch: 50n,
      deactivationEpoch: U64_MAX,
    };
    const result = computeStakeActivation(d, 50n, new Map(), RATE);
    expect(result).toEqual({
      effective: 0n,
      activating: 1_000n,
      deactivating: 0n,
      status: "activating",
    });
  });

  it("same-epoch activate + deactivate → zero", () => {
    const d: DelegationInput = {
      stake: 1_000n,
      activationEpoch: 10n,
      deactivationEpoch: 10n,
    };
    // Regardless of target epoch
    for (const epoch of [9n, 10n, 11n, 100n]) {
      const result = computeStakeActivation(d, epoch, new Map(), RATE);
      expect(result, `epoch ${epoch}`).toEqual({
        effective: 0n,
        activating: 0n,
        deactivating: 0n,
        status: "inactive",
      });
    }
  });

  it("not deactivating after warm-up complete (history missing) → active", () => {
    // No history at activation_epoch → treated as fully effective (dropped out of history).
    const d: DelegationInput = {
      stake: 2_000n,
      activationEpoch: 10n,
      deactivationEpoch: U64_MAX,
    };
    const result = computeStakeActivation(d, 20n, new Map(), RATE);
    expect(result).toEqual({
      effective: 2_000n,
      activating: 0n,
      deactivating: 0n,
      status: "active",
    });
  });

  it("not deactivating after warm-up complete (activating drained in history) → active", () => {
    const d: DelegationInput = {
      stake: 1_000n,
      activationEpoch: 10n,
      deactivationEpoch: U64_MAX,
    };
    // Cluster activating was large; one epoch of uncapped growth finishes this stake.
    // weight = 1000/1000 = 1; newly = max(1, trunc(1 * 1_000_000 * 0.09)) = 90_000 → caps at 1000.
    const history = stakeHistoryFromEntries([{ epoch: 10n, entry: entry(1_000_000n, 1_000n, 0n) }]);
    const result = computeStakeActivation(d, 11n, history, RATE);
    expect(result).toEqual({
      effective: 1_000n,
      activating: 0n,
      deactivating: 0n,
      status: "active",
    });
  });

  it("mid-cooldown with synthetic StakeHistory entries", () => {
    // Fully active stake of 1000, deactivation starts at epoch 20.
    // At deactivation epoch, cluster has effective=10_000, deactivating=1000 (this stake alone).
    // rate 0.09 → newly_not_effective = max(1, trunc(1.0 * 10000 * 0.09)) = 900
    // After one boundary (target 21): current_effective = 1000 - 900 = 100, deactivating = 100
    const d: DelegationInput = {
      stake: 1_000n,
      activationEpoch: 1n,
      deactivationEpoch: 20n,
    };
    // History missing at activation → fully effective before cooldown; only need deactivation epoch entry.
    const history = stakeHistoryFromEntries([{ epoch: 20n, entry: entry(10_000n, 0n, 1_000n) }]);

    // At deactivation epoch: all effective begins cooldown
    const atDeact = computeStakeActivation(d, 20n, history, RATE);
    expect(atDeact).toEqual({
      effective: 1_000n,
      activating: 0n,
      deactivating: 1_000n,
      status: "deactivating",
    });

    // One epoch into cooldown
    const mid = computeStakeActivation(d, 21n, history, RATE);
    expect(mid).toEqual({
      effective: 100n,
      activating: 0n,
      deactivating: 100n,
      status: "deactivating",
    });
  });

  it("cooldown completes when remaining effective goes to zero", () => {
    const d: DelegationInput = {
      stake: 1_000n,
      activationEpoch: 1n,
      deactivationEpoch: 20n,
    };
    // High rate / large cluster effective → finishes in one step after deactivation epoch
    const history = stakeHistoryFromEntries([{ epoch: 20n, entry: entry(1_000_000n, 0n, 1_000n) }]);
    // newly = max(1, trunc(1 * 1_000_000 * 0.09)) = 90_000 → saturates to 0
    const done = computeStakeActivation(d, 21n, history, RATE);
    expect(done).toEqual({
      effective: 0n,
      activating: 0n,
      deactivating: 0n,
      status: "inactive",
    });
  });

  it("history pruned at deactivation_epoch → fully inactive", () => {
    const d: DelegationInput = {
      stake: 1_000n,
      activationEpoch: 1n,
      deactivationEpoch: 20n,
    };
    const result = computeStakeActivation(d, 30n, new Map(), RATE);
    expect(result).toEqual({
      effective: 0n,
      activating: 0n,
      deactivating: 0n,
      status: "inactive",
    });
  });

  it("capped multi-epoch warmup (partial activation)", () => {
    // Cluster effective is tiny relative to activating → slow warmup.
    // remaining=1000, cluster activating=1000, cluster effective=100, rate=0.09
    // newly = max(1, trunc(1.0 * 100 * 0.09)) = max(1, 9) = 9
    // After 1 epoch: effective=9, activating=991
    const d: DelegationInput = {
      stake: 1_000n,
      activationEpoch: 5n,
      deactivationEpoch: U64_MAX,
    };
    const history = stakeHistoryFromEntries([{ epoch: 5n, entry: entry(100n, 1_000n, 0n) }]);
    const result = computeStakeActivation(d, 6n, history, RATE);
    expect(result).toEqual({
      effective: 9n,
      activating: 991n,
      deactivating: 0n,
      status: "activating",
    });
  });

  it("target_epoch before activation → inactive", () => {
    const d: DelegationInput = {
      stake: 1_000n,
      activationEpoch: 50n,
      deactivationEpoch: U64_MAX,
    };
    const result = computeStakeActivation(d, 49n, new Map(), RATE);
    expect(result.status).toBe("inactive");
    expect(result.effective).toBe(0n);
    expect(result.activating).toBe(0n);
  });

  describe("M-SOLANA-4: cluster-wide totals > Number.MAX_SAFE_INTEGER", () => {
    const ABOVE_MAX_SAFE_INTEGER = 2n ** 60n; // ~1.15e18, far past 2^53 (~9.007e15)

    it("warmup: per-position effective stays within [0, stake] with a >2^53 cluster history", () => {
      const stake = 5_000_000_000n; // 5 SOL, ordinary position size
      const d: DelegationInput = {
        stake,
        activationEpoch: 10n,
        deactivationEpoch: U64_MAX,
      };
      const history = stakeHistoryFromEntries([
        {
          epoch: 10n,
          entry: {
            effective: ABOVE_MAX_SAFE_INTEGER,
            activating: ABOVE_MAX_SAFE_INTEGER,
            deactivating: 0n,
          },
        },
      ]);
      const result = computeStakeActivation(d, 11n, history, RATE);
      expect(result.effective).toBeGreaterThanOrEqual(0n);
      expect(result.effective).toBeLessThanOrEqual(stake);
      expect(result.activating).toBeGreaterThanOrEqual(0n);
      expect(result.activating).toBeLessThanOrEqual(stake);
    });

    it("cooldown: per-position effective stays within [0, stake] with a >2^53 cluster history", () => {
      const stake = 5_000_000_000n;
      const d: DelegationInput = {
        stake,
        activationEpoch: 1n,
        deactivationEpoch: 20n,
      };
      const history = stakeHistoryFromEntries([
        {
          epoch: 20n,
          entry: {
            effective: ABOVE_MAX_SAFE_INTEGER,
            activating: 0n,
            deactivating: ABOVE_MAX_SAFE_INTEGER,
          },
        },
      ]);
      const result = computeStakeActivation(d, 21n, history, RATE);
      expect(result.effective).toBeGreaterThanOrEqual(0n);
      expect(result.effective).toBeLessThanOrEqual(stake);
      expect(result.deactivating).toBeGreaterThanOrEqual(0n);
      expect(result.deactivating).toBeLessThanOrEqual(stake);
    });

    it("cooldown: multi-epoch walk with skewed >2^53 cluster totals never escapes [0, stake]", () => {
      const stake = 1_234_567_890n;
      const d: DelegationInput = {
        stake,
        activationEpoch: 1n,
        deactivationEpoch: 20n,
      };
      const history = stakeHistoryFromEntries([
        {
          epoch: 20n,
          entry: {
            effective: ABOVE_MAX_SAFE_INTEGER,
            activating: 0n,
            deactivating: ABOVE_MAX_SAFE_INTEGER * 3n,
          },
        },
        {
          epoch: 21n,
          entry: {
            effective: ABOVE_MAX_SAFE_INTEGER,
            activating: 0n,
            deactivating: ABOVE_MAX_SAFE_INTEGER + 1n,
          },
        },
      ]);
      for (const targetEpoch of [20n, 21n, 22n, 23n]) {
        const result = computeStakeActivation(d, targetEpoch, history, RATE);
        expect(result.effective, `epoch ${targetEpoch}`).toBeGreaterThanOrEqual(0n);
        expect(result.effective, `epoch ${targetEpoch}`).toBeLessThanOrEqual(stake);
      }
    });
  });
});
