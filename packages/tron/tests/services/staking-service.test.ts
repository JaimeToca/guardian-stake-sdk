import { describe, it, expect, vi } from "vitest";
import { createStakingService } from "../../src/tron-chain/services/staking-service";
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
