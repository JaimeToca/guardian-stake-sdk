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
