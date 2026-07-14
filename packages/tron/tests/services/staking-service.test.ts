import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
          unfreezing: [{ amount: 40_000_000n, expireTime: future }],
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
            { amount: 40_000_000n, expireTime: future },
            { amount: 10_000_000n, expireTime: past },
          ],
        }),
      }),
      () => tronWeb
    );
    const { delegations } = await svc.getDelegations("TWallet");
    expect(delegations.find((d) => d.status === "Pending")?.amount).toBe(40_000_000n);
    expect(delegations.find((d) => d.status === "Claimable")?.amount).toBe(10_000_000n);
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

  it("calls getBrokerage exactly once per distinct SR on a cold load", async () => {
    const many = [
      { address: "TSR1", voteCount: 1_000_000_000n, url: "https://sr1.example", isSr: true },
      { address: "TSR2", voteCount: 2_000_000_000n, url: "https://sr2.example", isSr: true },
      { address: "TSR3", voteCount: 3_000_000_000n, url: "https://sr3.example", isSr: false },
    ];
    const client = rpc({ listWitnesses: vi.fn().mockResolvedValue(many) });
    const svc = createStakingService(client, () => tronWeb);

    await svc.getValidators();

    expect(client.getBrokerage).toHaveBeenCalledTimes(many.length);
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
