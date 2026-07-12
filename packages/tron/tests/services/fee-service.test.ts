import { describe, it, expect, vi } from "vitest";
import type { Mock } from "vitest";
import { createFeeService } from "../../src/tron-chain/services/fee-service";
import type { TronRpcClientContract } from "../../src/tron-chain/rpc/tron-rpc-client-contract";
import type { TronAccount } from "../../src/tron-chain/rpc/tron-rpc-types";
import type { TronStakingServiceContract } from "../../src/tron-chain/services/staking-service-contract";
import type { Transaction, Validator } from "@guardian-sdk/sdk";

const SR: Validator = {
  id: "TSR",
  status: "Active",
  name: "SR One",
  description: "",
  image: undefined,
  apy: 5,
  delegators: undefined,
  operatorAddress: "TSR",
  creditAddress: "",
};

function makeRpc(account: TronAccount): TronRpcClientContract {
  return {
    getAccount: vi.fn().mockResolvedValue(account),
    getReward: vi.fn().mockResolvedValue(0n),
    listWitnesses: vi.fn().mockResolvedValue([]),
    getChainParameters: vi.fn().mockResolvedValue({ getTransactionFee: 1000 }),
    getBrokerage: vi.fn().mockResolvedValue(20),
    broadcast: vi.fn().mockResolvedValue("txid"),
  };
}

function makeStaking(): TronStakingServiceContract {
  return {
    getValidators: vi.fn(),
    getDelegations: vi.fn(),
    getWitnessMap: vi.fn().mockResolvedValue(new Map([["TSR", SR]])),
  } as unknown as TronStakingServiceContract;
}

const baseAccount: TronAccount = {
  balance: 100_000_000n,
  frozen: [{ resource: "BANDWIDTH", amount: 100_000_000n }],
  unfreezing: [],
  votes: [{ srAddress: "TSR", votes: 60n }],
};

describe("createFeeService — balance-aware validation", () => {
  it("Delegate: freeze above available balance throws", async () => {
    const rpc = makeRpc(baseAccount);
    const fee = createFeeService(rpc, makeStaking());
    const tx: Transaction = {
      type: "Delegate",
      chain: {} as Transaction["chain"],
      amount: 200_000_000n,
      account: "TOwner",
      isMaxAmount: false,
    };
    await expect(fee.estimateFee(tx)).rejects.toThrow();
  });

  it("Delegate: freeze below 1 TRX throws", async () => {
    const rpc = makeRpc(baseAccount);
    const fee = createFeeService(rpc, makeStaking());
    const tx: Transaction = {
      type: "Delegate",
      chain: {} as Transaction["chain"],
      amount: 500_000n,
      account: "TOwner",
      isMaxAmount: false,
    };
    await expect(fee.estimateFee(tx)).rejects.toThrow();
  });

  it("Delegate: valid freeze returns a ResourceFee", async () => {
    const rpc = makeRpc(baseAccount);
    const fee = createFeeService(rpc, makeStaking());
    const tx: Transaction = {
      type: "Delegate",
      chain: {} as Transaction["chain"],
      amount: 50_000_000n,
      account: "TOwner",
      isMaxAmount: false,
    };
    const result = await fee.estimateFee(tx);
    expect(result.type).toBe("ResourceFee");
  });

  it("Undelegate: unfreeze more than frozen for that resource throws", async () => {
    const rpc = makeRpc(baseAccount);
    const fee = createFeeService(rpc, makeStaking());
    const tx: Transaction & { resource: "BANDWIDTH" | "ENERGY" } = {
      type: "Undelegate",
      chain: {} as Transaction["chain"],
      amount: 999_000_000n,
      account: "TOwner",
      isMaxAmount: false,
      resource: "BANDWIDTH",
    };
    await expect(fee.estimateFee(tx)).rejects.toThrow();
  });

  it("Undelegate: valid unfreeze returns a ResourceFee", async () => {
    const rpc = makeRpc(baseAccount);
    const fee = createFeeService(rpc, makeStaking());
    const tx: Transaction & { resource: "BANDWIDTH" | "ENERGY" } = {
      type: "Undelegate",
      chain: {} as Transaction["chain"],
      amount: 10_000_000n,
      account: "TOwner",
      isMaxAmount: false,
      resource: "BANDWIDTH",
    };
    const result = await fee.estimateFee(tx);
    expect(result.type).toBe("ResourceFee");
  });

  it("Vote: past available Tron Power throws", async () => {
    const rpc = makeRpc(baseAccount);
    const fee = createFeeService(rpc, makeStaking());
    const tx: Transaction = {
      type: "Vote",
      chain: {} as Transaction["chain"],
      amount: 50_000_000n,
      account: "TOwner",
      validator: "TSR",
    };
    await expect(fee.estimateFee(tx)).rejects.toThrow();
  });

  it("Vote: to an unknown SR throws", async () => {
    const rpc = makeRpc(baseAccount);
    const fee = createFeeService(rpc, makeStaking());
    const tx: Transaction = {
      type: "Vote",
      chain: {} as Transaction["chain"],
      amount: 10_000_000n,
      account: "TOwner",
      validator: "TUNKNOWN",
    };
    await expect(fee.estimateFee(tx)).rejects.toThrow();
  });

  it("Vote: valid vote returns a ResourceFee", async () => {
    const rpc = makeRpc(baseAccount);
    const fee = createFeeService(rpc, makeStaking());
    const tx: Transaction = {
      type: "Vote",
      chain: {} as Transaction["chain"],
      amount: 10_000_000n,
      account: "TOwner",
      validator: "TSR",
    };
    const result = await fee.estimateFee(tx);
    expect(result.type).toBe("ResourceFee");
  });

  it("Vote: accepts a Validator object for tx.validator", async () => {
    const rpc = makeRpc(baseAccount);
    const fee = createFeeService(rpc, makeStaking());
    const tx: Transaction = {
      type: "Vote",
      chain: {} as Transaction["chain"],
      amount: 10_000_000n,
      account: "TOwner",
      validator: SR,
    };
    const result = await fee.estimateFee(tx);
    expect(result.type).toBe("ResourceFee");
  });

  it("ClaimRewards: returns a ResourceFee without needing account/witnesses", async () => {
    const rpc = makeRpc(baseAccount);
    const getAccount = rpc.getAccount as Mock;
    const staking = makeStaking();
    const getWitnessMap = staking.getWitnessMap as unknown as Mock;
    const fee = createFeeService(rpc, staking);
    const tx: Transaction = {
      type: "ClaimRewards",
      chain: {} as Transaction["chain"],
      amount: 0n,
      account: "TOwner",
      validator: "TSR",
    };
    const result = await fee.estimateFee(tx);
    expect(result.type).toBe("ResourceFee");
    expect(getAccount).not.toHaveBeenCalled();
    expect(getWitnessMap).not.toHaveBeenCalled();
  });

  it("Delegate: missing account throws", async () => {
    const rpc = makeRpc(baseAccount);
    const fee = createFeeService(rpc, makeStaking());
    const tx: Transaction = {
      type: "Delegate",
      chain: {} as Transaction["chain"],
      amount: 10_000_000n,
      isMaxAmount: false,
    };
    await expect(fee.estimateFee(tx)).rejects.toThrow();
  });
});
