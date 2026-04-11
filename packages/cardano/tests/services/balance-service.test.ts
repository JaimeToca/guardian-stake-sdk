import { describe, it, expect, vi } from "vitest";
import { BalanceService } from "../../src/cardano-chain/services/balance-service";
import type { BlockfrostRpcClientContract } from "../../src/cardano-chain/rpc/blockfrost-rpc-client-contract";

function makeRpcClient(
  controlledAmount: string,
  withdrawableAmount: string
): BlockfrostRpcClientContract {
  return {
    getPools: vi.fn(),
    getPoolMetadata: vi.fn(),
    getAccount: vi.fn().mockResolvedValue({
      stake_address: "stake1ux3g2c9dx2nhhehyrezy4uvtyvgmndp3v4kplasjan2fcgfv7jyfa",
      active: true,
      active_epoch: 350,
      controlled_amount: controlledAmount,
      rewards_sum: "0",
      withdrawals_sum: "0",
      reserves_sum: "0",
      treasury_sum: "0",
      withdrawable_amount: withdrawableAmount,
      pool_id: "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy",
    }),
    getUtxos: vi.fn(),
    getProtocolParams: vi.fn(),
    getNetwork: vi.fn(),
    submitTx: vi.fn(),
  };
}

const STAKE_ADDRESS = "stake1ux3g2c9dx2nhhehyrezy4uvtyvgmndp3v4kplasjan2fcgfv7jyfa";

describe("BalanceService", () => {
  it("returns exactly four balance types", async () => {
    const service = new BalanceService(makeRpcClient("10000000", "2100000"));
    const balances = await service.getBalances(STAKE_ADDRESS);

    const types = balances.map((b) => b.type);
    expect(types).toContain("Available");
    expect(types).toContain("Staked");
    expect(types).toContain("Pending");
    expect(types).toContain("Claimable");
    expect(balances).toHaveLength(4);
  });

  it("Available amount equals controlled_amount from Blockfrost", async () => {
    const service = new BalanceService(makeRpcClient("9_950_000", "2_100_000"));
    const balances = await service.getBalances(STAKE_ADDRESS);

    const available = balances.find((b) => b.type === "Available");
    expect(available?.amount).toBe(BigInt("9_950_000"));
  });

  it("Staked amount equals Available (ADA is never locked in Cardano)", async () => {
    const service = new BalanceService(makeRpcClient("10000000", "0"));
    const balances = await service.getBalances(STAKE_ADDRESS);

    const available = balances.find((b) => b.type === "Available");
    const staked = balances.find((b) => b.type === "Staked");
    expect(staked?.amount).toBe(available?.amount);
    expect(staked?.amount).toBe(10_000_000n);
  });

  it("Pending amount is always 0 (no unbonding queue)", async () => {
    const service = new BalanceService(makeRpcClient("10000000", "5000000"));
    const balances = await service.getBalances(STAKE_ADDRESS);

    const pending = balances.find((b) => b.type === "Pending");
    expect(pending?.amount).toBe(0n);
  });

  it("Claimable amount equals withdrawable_amount from Blockfrost", async () => {
    const service = new BalanceService(makeRpcClient("10000000", "2100000"));
    const balances = await service.getBalances(STAKE_ADDRESS);

    const claimable = balances.find((b) => b.type === "Claimable");
    expect(claimable?.amount).toBe(2_100_000n);
  });

  it("handles zero claimable rewards", async () => {
    const service = new BalanceService(makeRpcClient("10000000", "0"));
    const balances = await service.getBalances(STAKE_ADDRESS);

    const claimable = balances.find((b) => b.type === "Claimable");
    expect(claimable?.amount).toBe(0n);
  });

  it("handles large controlled amount (bigint precision)", async () => {
    const largeAmount = "45000000000000000"; // 45 billion ADA in lovelaces
    const service = new BalanceService(makeRpcClient(largeAmount, "0"));
    const balances = await service.getBalances(STAKE_ADDRESS);

    const available = balances.find((b) => b.type === "Available");
    expect(available?.amount).toBe(BigInt(largeAmount));
  });

  it("calls rpcClient.getAccount with the provided address", async () => {
    const rpcClient = makeRpcClient("1000000", "0");
    const service = new BalanceService(rpcClient);

    await service.getBalances(STAKE_ADDRESS);

    expect(rpcClient.getAccount).toHaveBeenCalledWith(STAKE_ADDRESS);
    expect(rpcClient.getAccount).toHaveBeenCalledTimes(1);
  });

  it("passes address argument through to RPC (different addresses produce different calls)", async () => {
    const rpcClient = makeRpcClient("1000000", "0");
    const service = new BalanceService(rpcClient);
    const differentAddress = "stake1u9frlh9lvpdjl2e8nzm9c0rr4e9mhxzlf6c7u5s25t66s59fk6e6";

    await service.getBalances(differentAddress);

    expect(rpcClient.getAccount).toHaveBeenCalledWith(differentAddress);
  });
});