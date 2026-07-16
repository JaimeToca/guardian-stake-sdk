import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ValidationError } from "@guardian-sdk/sdk";
import {
  createStakingService,
  mapWithConcurrency,
} from "../../src/tron-chain/services/staking-service";
import type { TronRpcClientContract } from "../../src/tron-chain/rpc/tron-rpc-client-contract";

const witnesses = [
  { address: "TSR", voteCount: 1_000_000_000n, url: "https://sr.example", isSr: true },
];
const params = {
  getWitness127PayPerBlock: 16,
  getWitnessPayPerBlock: 16,
  getUnfreezeDelayDays: 14,
};

function rpc(over: Partial<TronRpcClientContract> = {}): TronRpcClientContract {
  return {
    getAccount: vi.fn(),
    getAccountResources: vi.fn().mockResolvedValue({ freeBandwidth: 0n, stakedBandwidth: 0n }),
    getReward: vi.fn().mockResolvedValue(0n),
    listWitnesses: vi.fn().mockResolvedValue(witnesses),
    getChainParameters: vi.fn().mockResolvedValue(params),
    getBrokerage: vi.fn().mockResolvedValue(20),
    broadcast: vi.fn(),
    ...over,
  };
}
const tronWeb = { address: { fromHex: (a: string) => a } } as any;

describe("getDelegations", () => {
  it("freeze-only -> one Frozen delegation carrying the unstakeable amount", async () => {
    const svc = createStakingService(
      rpc({
        getAccount: vi.fn().mockResolvedValue({
          balance: 0n,
          frozen: [{ resource: "BANDWIDTH", amount: 100_000_000n }],
          unfreezing: [],
          votes: [],
        }),
      }),
      () => tronWeb
    );
    const { delegations } = await svc.getDelegations("TWallet");
    expect(delegations).toHaveLength(1);
    expect(delegations[0].status).toBe("Frozen");
    expect(delegations[0].amount).toBe(100_000_000n);
    expect(delegations[0].validator.name).toMatch(/vote/i);
  });

  it("voted -> Active delegation with the real SR", async () => {
    const svc = createStakingService(
      rpc({
        getAccount: vi.fn().mockResolvedValue({
          balance: 0n,
          frozen: [{ resource: "BANDWIDTH", amount: 100_000_000n }],
          unfreezing: [],
          votes: [{ srAddress: "TSR", votes: 100n }],
        }),
      }),
      () => tronWeb
    );
    const { delegations } = await svc.getDelegations("TWallet");
    const active = delegations.filter((d) => d.status === "Active");
    expect(active).toHaveLength(1);
    expect(active[0].amount).toBe(100_000_000n);
    expect(active[0].validator.operatorAddress).toBe("TSR");
  });

  it("partial unfreeze leaves votes lingering above frozen -> Active is capped to totalFrozen, no Frozen remainder", async () => {
    const future = Date.now() + 1_000_000;
    const svc = createStakingService(
      rpc({
        getAccount: vi.fn().mockResolvedValue({
          balance: 0n,
          frozen: [{ resource: "BANDWIDTH", amount: 60_000_000n }],
          unfreezing: [{ resource: "BANDWIDTH", amount: 40_000_000n, expireTime: future }],
          votes: [{ srAddress: "TSR", votes: 100n }], // 100 * SUN_PER_TRX = 100_000_000n voted
        }),
      }),
      () => tronWeb
    );
    const { delegations } = await svc.getDelegations("TWallet");

    const active = delegations.filter((d) => d.status === "Active");
    const activeTotal = active.reduce((s, d) => s + d.amount, 0n);
    expect(activeTotal).toBe(60_000_000n);

    expect(delegations.find((d) => d.status === "Frozen")).toBeUndefined();

    const pending = delegations.find((d) => d.status === "Pending");
    expect(pending?.amount).toBe(40_000_000n);
  });

  it("multiple votes with uneven scaling -> Active amounts sum exactly to effectiveVoted (no dust loss)", async () => {
    const svc = createStakingService(
      rpc({
        getAccount: vi.fn().mockResolvedValue({
          balance: 0n,
          frozen: [{ resource: "BANDWIDTH", amount: 100_000_000n }],
          unfreezing: [],
          votes: [
            { srAddress: "TSR", votes: 100n },
            { srAddress: "TSR2", votes: 101n },
            { srAddress: "TSR3", votes: 103n },
          ], // total voted = 304 * SUN_PER_TRX = 304_000_000n, totalFrozen = 100_000_000n
        }),
      }),
      () => tronWeb
    );
    const { delegations } = await svc.getDelegations("TWallet");

    const active = delegations.filter((d) => d.status === "Active");
    expect(active).toHaveLength(3);
    const activeTotal = active.reduce((s, d) => s + d.amount, 0n);
    expect(activeTotal).toBe(100_000_000n);

    expect(delegations.find((d) => d.status === "Frozen")).toBeUndefined();
  });

  it("unbonding -> Pending, matured -> Claimable", async () => {
    const future = Date.now() + 1_000_000;
    const past = Date.now() - 1_000_000;
    const svc = createStakingService(
      rpc({
        getAccount: vi.fn().mockResolvedValue({
          balance: 0n,
          frozen: [],
          votes: [],
          unfreezing: [
            { resource: "BANDWIDTH", amount: 40_000_000n, expireTime: future },
            { resource: "ENERGY", amount: 10_000_000n, expireTime: past },
          ],
        }),
      }),
      () => tronWeb
    );
    const { delegations } = await svc.getDelegations("TWallet");
    expect(delegations.find((d) => d.status === "Pending")?.amount).toBe(40_000_000n);
    expect(delegations.find((d) => d.status === "Claimable")?.amount).toBe(10_000_000n);
  });

  it("Pending/Claimable placeholder validator reflects the unfreeze resource (ENERGY vs BANDWIDTH)", async () => {
    const future = Date.now() + 1_000_000;
    const past = Date.now() - 1_000_000;
    const svc = createStakingService(
      rpc({
        getAccount: vi.fn().mockResolvedValue({
          balance: 0n,
          frozen: [],
          votes: [],
          unfreezing: [
            { resource: "ENERGY", amount: 40_000_000n, expireTime: future },
            { resource: "BANDWIDTH", amount: 10_000_000n, expireTime: past },
          ],
        }),
      }),
      () => tronWeb
    );
    const { delegations } = await svc.getDelegations("TWallet");
    const pending = delegations.find((d) => d.status === "Pending");
    const claimable = delegations.find((d) => d.status === "Claimable");
    // An ENERGY unfreeze must not be mislabeled as BANDWIDTH.
    expect(pending?.validator.id).toBe("tron-frozen-energy");
    expect(claimable?.validator.id).toBe("tron-frozen-bandwidth");
    // Distinct ids per resource keep concurrent unfreezes from colliding.
    expect(pending?.id).toBe("TWallet:unfreeze-ENERGY-" + future);
    expect(claimable?.id).toBe("TWallet:unfreeze-BANDWIDTH-" + past);
  });
});

describe("concurrent witness cache loads", () => {
  it("two concurrent getValidators() calls trigger listWitnesses only once", async () => {
    const client = rpc({
      getAccount: vi.fn().mockResolvedValue({
        balance: 0n,
        frozen: [],
        unfreezing: [],
        votes: [],
      }),
    });
    const svc = createStakingService(client, () => tronWeb);

    const [a, b] = await Promise.all([svc.getValidators(), svc.getValidators()]);

    expect(client.listWitnesses).toHaveBeenCalledTimes(1);
    expect(a.data).toEqual(b.data);
  });

  it("two concurrent getDelegations() calls trigger listWitnesses only once", async () => {
    const client = rpc({
      getAccount: vi.fn().mockResolvedValue({
        balance: 0n,
        frozen: [{ resource: "BANDWIDTH", amount: 100_000_000n }],
        unfreezing: [],
        votes: [{ srAddress: "TSR", votes: 100n }],
      }),
    });
    const svc = createStakingService(client, () => tronWeb);

    await Promise.all([svc.getDelegations("TWallet"), svc.getDelegations("TWallet")]);

    expect(client.listWitnesses).toHaveBeenCalledTimes(1);
  });
});

describe("chain-parameters caching", () => {
  it("getDelegations fetches chain parameters only once (shared with the witness load)", async () => {
    const client = rpc({
      getAccount: vi.fn().mockResolvedValue({
        balance: 0n,
        frozen: [{ resource: "BANDWIDTH", amount: 100_000_000n }],
        unfreezing: [],
        votes: [{ srAddress: "TSR", votes: 100n }],
      }),
    });
    const svc = createStakingService(client, () => tronWeb);

    await svc.getDelegations("TWallet");

    expect(client.getChainParameters).toHaveBeenCalledTimes(1);
  });
});

describe("per-SR brokerage caching", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a second getValidators() after the 15-min witness TTL (but within the 30-min brokerage TTL) does not re-fetch brokerage", async () => {
    const client = rpc();
    const svc = createStakingService(client, () => tronWeb);

    await svc.getValidators();
    expect(client.getBrokerage).toHaveBeenCalledTimes(1);
    expect(client.listWitnesses).toHaveBeenCalledTimes(1);

    // Advance past the 15-minute witness cache TTL but within the 30-minute brokerage TTL.
    vi.setSystemTime(Date.now() + 16 * 60 * 1000);

    await svc.getValidators();

    // Witness list is re-fetched (cache expired)...
    expect(client.listWitnesses).toHaveBeenCalledTimes(2);
    // ...but brokerage is still cached, so no additional call.
    expect(client.getBrokerage).toHaveBeenCalledTimes(1);
  });

  it("re-fetches brokerage once the 30-min brokerage TTL has elapsed", async () => {
    const client = rpc();
    const svc = createStakingService(client, () => tronWeb);

    await svc.getValidators();
    expect(client.getBrokerage).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 31 * 60 * 1000);

    await svc.getValidators();

    expect(client.getBrokerage).toHaveBeenCalledTimes(2);
  });
});

describe("scoped APR fetching", () => {
  function manyWitnesses(count: number): Array<{
    address: string;
    voteCount: bigint;
    url: string;
    isSr: boolean;
  }> {
    return Array.from({ length: count }, (_, i) => ({
      address: `TSR${i}`,
      voteCount: BigInt(i + 1) * 1_000_000_000n,
      url: `https://sr${i}.example`,
      isSr: true,
    }));
  }

  it("getValidators({page:1,pageSize:5}) on a 20-witness list calls getBrokerage at most 5 times and returns real apy", async () => {
    const witnessList = manyWitnesses(20);
    const client = rpc({ listWitnesses: vi.fn().mockResolvedValue(witnessList) });
    const svc = createStakingService(client, () => tronWeb);

    const page = await svc.getValidators({ page: 1, pageSize: 5 });

    expect(client.getBrokerage).toHaveBeenCalledTimes(5);
    expect(page.data).toHaveLength(5);
    expect(page.pagination.total).toBe(20);
    expect(page.pagination.totalPages).toBe(4);
    for (const v of page.data) {
      expect(v.apy).toBeGreaterThan(0);
    }
  });

  it("cold load itself (before any getValidators/getDelegations call) does NOT call getBrokerage", async () => {
    const witnessList = manyWitnesses(20);
    const client = rpc({ listWitnesses: vi.fn().mockResolvedValue(witnessList) });
    createStakingService(client, () => tronWeb);

    // Constructing the service must not eagerly load anything.
    expect(client.listWitnesses).not.toHaveBeenCalled();
    expect(client.getBrokerage).not.toHaveBeenCalled();
  });

  it("getDelegations enriches only the distinct voted SRs (<=3 brokerage calls for 3 distinct votes) out of 20 witnesses", async () => {
    const witnessList = manyWitnesses(20);
    const client = rpc({
      listWitnesses: vi.fn().mockResolvedValue(witnessList),
      getAccount: vi.fn().mockResolvedValue({
        balance: 0n,
        frozen: [{ resource: "BANDWIDTH", amount: 600_000_000n }],
        unfreezing: [],
        votes: [
          { srAddress: "TSR0", votes: 100n },
          { srAddress: "TSR1", votes: 200n },
          { srAddress: "TSR2", votes: 300n },
        ],
      }),
    });
    const svc = createStakingService(client, () => tronWeb);

    const { delegations } = await svc.getDelegations("TWallet");

    expect(client.getBrokerage).toHaveBeenCalledTimes(3);
    const active = delegations.filter((d) => d.status === "Active");
    expect(active).toHaveLength(3);
    expect(active.map((d) => d.validator.operatorAddress).sort()).toEqual(["TSR0", "TSR1", "TSR2"]);
    for (const d of active) {
      expect(d.validator.apy).toBeGreaterThan(0);
    }
  });

  it("getDelegations dedupes repeated votes for the same SR (1 brokerage call, not N)", async () => {
    const witnessList = manyWitnesses(5);
    const client = rpc({
      listWitnesses: vi.fn().mockResolvedValue(witnessList),
      getAccount: vi.fn().mockResolvedValue({
        balance: 0n,
        frozen: [{ resource: "BANDWIDTH", amount: 900_000_000n }],
        unfreezing: [],
        votes: [
          { srAddress: "TSR0", votes: 100n },
          { srAddress: "TSR0", votes: 200n },
        ],
      }),
    });
    const svc = createStakingService(client, () => tronWeb);

    await svc.getDelegations("TWallet");

    expect(client.getBrokerage).toHaveBeenCalledTimes(1);
  });

  it("stakingSummary.maxApy is a finite number >= 0 computed with the default brokerage — no extra getBrokerage calls", async () => {
    const witnessList = manyWitnesses(20);
    const client = rpc({
      listWitnesses: vi.fn().mockResolvedValue(witnessList),
      getAccount: vi.fn().mockResolvedValue({
        balance: 0n,
        frozen: [{ resource: "BANDWIDTH", amount: 100_000_000n }],
        unfreezing: [],
        votes: [{ srAddress: "TSR0", votes: 100n }],
      }),
    });
    const svc = createStakingService(client, () => tronWeb);

    const { stakingSummary } = await svc.getDelegations("TWallet");

    expect(Number.isFinite(stakingSummary.maxApy)).toBe(true);
    expect(stakingSummary.maxApy).toBeGreaterThanOrEqual(0);
    expect(stakingSummary.totalValidators).toBe(20);
    // Only the 1 distinct voted SR should have triggered brokerage enrichment.
    expect(client.getBrokerage).toHaveBeenCalledTimes(1);
  });
});

describe("brokerage cache: only cache successes (Fix 1)", () => {
  it("a failed getBrokerage falls back to 20 and is NOT cached — the next call retries and caches the real value", async () => {
    const getBrokerage = vi
      .fn()
      .mockRejectedValueOnce(new Error("rpc down"))
      .mockResolvedValueOnce(35);
    const client = rpc({ getBrokerage });
    const svc = createStakingService(client, () => tronWeb);

    const first = await svc.getValidators();
    expect(getBrokerage).toHaveBeenCalledTimes(1);
    // Fallback DEFAULT_BROKERAGE_PERCENT (20) used on error -> apy computed with 20% brokerage.
    expect(first.data[0].apy).toBeGreaterThan(0);

    // Second call must re-invoke getBrokerage since the failed fetch was never cached.
    const second = await svc.getValidators();
    expect(getBrokerage).toHaveBeenCalledTimes(2);
    // Real value (35) is now cached, so a third call does not re-fetch.
    const third = await svc.getValidators();
    expect(getBrokerage).toHaveBeenCalledTimes(2);
    expect(second.data[0].apy).toBe(third.data[0].apy);
  });
});

describe("per-SR brokerage in-flight dedup (Fix 2)", () => {
  it("concurrent enrichment of the SAME SR (getValidators + getDelegations) shares one getBrokerage call", async () => {
    let resolveBrokerage: ((value: number) => void) | undefined;
    const getBrokerage = vi.fn().mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          resolveBrokerage = resolve;
        })
    );
    const client = rpc({
      getBrokerage,
      getAccount: vi.fn().mockResolvedValue({
        balance: 0n,
        frozen: [{ resource: "BANDWIDTH", amount: 100_000_000n }],
        unfreezing: [],
        votes: [{ srAddress: "TSR", votes: 100n }],
      }),
    });
    const svc = createStakingService(client, () => tronWeb);

    const validatorsPromise = svc.getValidators();
    const delegationsPromise = svc.getDelegations("TWallet");

    // Let both operations reach the getBrokerage call before resolving it.
    await vi.waitFor(() => {
      expect(getBrokerage).toHaveBeenCalled();
    });
    expect(getBrokerage).toHaveBeenCalledTimes(1);
    resolveBrokerage?.(20);

    await Promise.all([validatorsPromise, delegationsPromise]);
    expect(getBrokerage).toHaveBeenCalledTimes(1);
  });
});

describe("getValidators page-param validation (Fix 3)", () => {
  it("throws ValidationError for page: 0", async () => {
    const svc = createStakingService(rpc(), () => tronWeb);
    await expect(svc.getValidators({ page: 0 })).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for pageSize: 0", async () => {
    const svc = createStakingService(rpc(), () => tronWeb);
    await expect(svc.getValidators({ pageSize: 0 })).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for page: -1", async () => {
    const svc = createStakingService(rpc(), () => tronWeb);
    await expect(svc.getValidators({ page: -1 })).rejects.toThrow(ValidationError);
  });

  it("a valid {page:1,pageSize:5} still works", async () => {
    const witnessList = Array.from({ length: 10 }, (_, i) => ({
      address: `TSR${i}`,
      voteCount: BigInt(i + 1) * 1_000_000_000n,
      url: `https://sr${i}.example`,
      isSr: true,
    }));
    const svc = createStakingService(
      rpc({ listWitnesses: vi.fn().mockResolvedValue(witnessList) }),
      () => tronWeb
    );
    const page = await svc.getValidators({ page: 1, pageSize: 5 });
    expect(page.data).toHaveLength(5);
  });
});

describe("mapWithConcurrency", () => {
  it("returns results in input order", async () => {
    const items = [5, 1, 4, 2, 3];
    const results = await mapWithConcurrency(items, 2, async (n) => {
      await new Promise((r) => setTimeout(r, n));
      return n * 10;
    });
    expect(results).toEqual([50, 10, 40, 20, 30]);
  });

  it("never runs more than `limit` tasks concurrently", async () => {
    vi.useRealTimers();
    const items = Array.from({ length: 20 }, (_, i) => i);
    let running = 0;
    let maxRunning = 0;
    const limit = 8;

    await mapWithConcurrency(items, limit, async (n) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return n;
    });

    expect(maxRunning).toBeLessThanOrEqual(limit);
  });

  it("propagates results correctly for an empty array", async () => {
    const results = await mapWithConcurrency<number, number>([], 8, async (n) => n);
    expect(results).toEqual([]);
  });
});
