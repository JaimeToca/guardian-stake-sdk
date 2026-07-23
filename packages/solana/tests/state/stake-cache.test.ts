import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStakePositionCache } from "../../src/solana-chain/state/stake-cache";
import type { StakePosition } from "../../src/solana-chain/state/stake-account";

const sample: StakePosition[] = [
  {
    stakeAccount: "StakeAcct111111111111111111111111111111111",
    seedIndex: 0,
    staker: "Auth1111111111111111111111111111111111111",
    withdrawer: "Auth1111111111111111111111111111111111111",
    voter: undefined,
    lamports: 1_000n,
    rentExemptReserve: 0n,
    delegatedStake: 0n,
    activationEpoch: 0n,
    deactivationEpoch: 0n,
    creditsObserved: 0n,
    effective: 0n,
    activating: 0n,
    deactivating: 0n,
    status: "inactive",
  },
];

describe("createStakePositionCache", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("stores and retrieves positions by authority", () => {
    const cache = createStakePositionCache(30_000);
    expect(cache.get("auth")).toBeUndefined();
    cache.set("auth", sample);
    expect(cache.get("auth")).toEqual(sample);
    expect(cache.has("auth")).toBe(true);
  });

  it("deletes and clears", () => {
    const cache = createStakePositionCache();
    cache.set("a", sample);
    cache.set("b", sample);
    expect(cache.delete("a")).toBe(true);
    expect(cache.get("a")).toBeUndefined();
    cache.clear();
    expect(cache.get("b")).toBeUndefined();
  });

  it("respects TTL", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const cache = createStakePositionCache(1_000);
    cache.set("auth", sample);
    expect(cache.get("auth")).toEqual(sample);
    vi.spyOn(Date, "now").mockReturnValue(now + 1_001);
    expect(cache.get("auth")).toBeUndefined();
  });
});
