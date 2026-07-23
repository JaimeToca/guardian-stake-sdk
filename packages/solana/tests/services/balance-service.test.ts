import { describe, it, expect, vi, beforeEach } from "vitest";
import { getStakeStateAccountEncoder, stakeStateV2 } from "@solana-program/stake";
import { address } from "@solana/kit";
import type { SolanaRpcClientContract } from "../../src/solana-chain/rpc/solana-rpc-client-contract";
import type { SolanaAccountInfo } from "../../src/solana-chain/rpc/solana-rpc-types";
import { createBalanceService } from "../../src/solana-chain/services/balance-service";
import { createStakingService } from "../../src/solana-chain/services/staking-service";
import { createStakePositionCache } from "../../src/solana-chain/state/stake-cache";
import { STAKE_PROGRAM_ADDRESS, U64_MAX } from "../../src/solana-chain/state/constants";
import { deriveStakeAddress, seedString } from "../../src/solana-chain/state/seed";

const AUTHORITY = "So11111111111111111111111111111111111111112";
const VOTE = "CertusDeBmqN8ZawdkxK5kFGMwBXdudvWHYwtNgNhvLu";
const ZERO = "11111111111111111111111111111111";

const encoder = getStakeStateAccountEncoder();

function encodeStake(args: {
  voter: string;
  stake: bigint;
  activationEpoch: bigint;
  deactivationEpoch?: bigint;
}): Uint8Array {
  const staker = address(AUTHORITY);
  const voter = address(args.voter);
  const zero = address(ZERO);
  const state = stakeStateV2("Stake", [
    {
      rentExemptReserve: 2_282_880n,
      authorized: { staker, withdrawer: staker },
      lockup: { unixTimestamp: 0n, epoch: 0n, custodian: zero },
    },
    {
      delegation: {
        voterPubkey: voter,
        stake: args.stake,
        activationEpoch: args.activationEpoch,
        deactivationEpoch: args.deactivationEpoch ?? U64_MAX,
        reserved: Array(8).fill(0),
      },
      creditsObserved: 1n,
    },
    { bits: 0 },
  ]);
  return new Uint8Array(encoder.encode({ state }));
}

function encodeInitialized(): Uint8Array {
  const s = address(AUTHORITY);
  const zero = address(ZERO);
  const state = stakeStateV2("Initialized", [
    {
      rentExemptReserve: 2_282_880n,
      authorized: { staker: s, withdrawer: s },
      lockup: { unixTimestamp: 0n, epoch: 0n, custodian: zero },
    },
  ]);
  return new Uint8Array(encoder.encode({ state }));
}

async function stakeAccount(
  seedIndex: number,
  data: Uint8Array,
  lamports: bigint
): Promise<SolanaAccountInfo> {
  return {
    address: await deriveStakeAddress(AUTHORITY, seedString(seedIndex)),
    lamports,
    data,
    owner: STAKE_PROGRAM_ADDRESS,
  };
}

async function multiPositionMap(): Promise<Map<string, SolanaAccountInfo | null>> {
  const active = await stakeAccount(
    0,
    encodeStake({ voter: VOTE, stake: 1_000_000_000n, activationEpoch: 10n }),
    1_002_282_880n
  );
  const deactivating = await stakeAccount(
    1,
    encodeStake({
      voter: VOTE,
      stake: 500_000_000n,
      activationEpoch: 10n,
      deactivationEpoch: 200n,
    }),
    502_282_880n
  );
  const claimable = await stakeAccount(2, encodeInitialized(), 2_282_880n);
  return new Map([
    [active.address, active],
    [deactivating.address, deactivating],
    [claimable.address, claimable],
  ]);
}

async function mockRpc(
  overrides: Partial<SolanaRpcClientContract> = {}
): Promise<SolanaRpcClientContract> {
  const map = await multiPositionMap();
  return {
    getBalance: vi.fn().mockResolvedValue(9_000_000_000n),
    getLatestBlockhash: vi.fn(),
    getEpochInfo: vi.fn().mockResolvedValue({
      epoch: 200n,
      slotIndex: 0n,
      slotsInEpoch: 432_000n,
      absoluteSlot: 1n,
    }),
    getVoteAccounts: vi.fn().mockResolvedValue({ current: [], delinquent: [] }),
    getMultipleAccounts: vi.fn(async (addresses: string[]) =>
      addresses.map((a) => map.get(a) ?? null)
    ),
    getMinimumBalanceForRentExemption: vi.fn().mockResolvedValue(2_282_880n),
    getStakeMinimumDelegation: vi.fn().mockResolvedValue(1n),
    getFeeForMessage: vi.fn(),
    getProgramAccountsStakeByStaker: vi.fn().mockResolvedValue([]),
    sendTransaction: vi.fn(),
    getStakeHistory: vi.fn().mockResolvedValue([]),
    getClock: vi.fn().mockResolvedValue({ epoch: 200n, unixTimestamp: 1_700_000_000n }),
    getClockEpoch: vi.fn().mockResolvedValue(200n),
    ...overrides,
  };
}

describe("createBalanceService", () => {
  let cache: ReturnType<typeof createStakePositionCache>;

  beforeEach(() => {
    cache = createStakePositionCache(30_000);
  });

  it("returns Available / Staked / Pending / Claimable without Rewards", async () => {
    const rpc = await mockRpc();
    const service = createBalanceService(rpc, cache, { seedScanMax: 10 });
    const balances = await service.getBalances(AUTHORITY);

    expect(balances.map((b) => b.type)).toEqual(["Available", "Staked", "Pending", "Claimable"]);
    expect(balances.find((b) => b.type === "Available")!.amount).toBe(9_000_000_000n);
    expect(balances.find((b) => b.type === "Staked")!.amount).toBe(1_000_000_000n);
    expect(balances.find((b) => b.type === "Pending")!.amount).toBe(500_000_000n);
    expect(balances.find((b) => b.type === "Claimable")!.amount).toBe(2_282_880n);
    expect(balances.some((b) => b.type === "Rewards")).toBe(false);
  });

  it("shares cache with staking service — second call does not re-scan", async () => {
    const rpc = await mockRpc();
    const staking = createStakingService(rpc, cache, { seedScanMax: 10 });
    const balance = createBalanceService(rpc, cache, { seedScanMax: 10 });

    await staking.getDelegations(AUTHORITY);
    const multiCalls = (rpc.getMultipleAccounts as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(multiCalls).toBeGreaterThan(0);

    const balances = await balance.getBalances(AUTHORITY);
    expect(rpc.getMultipleAccounts).toHaveBeenCalledTimes(multiCalls);
    expect(rpc.getClockEpoch).toHaveBeenCalledTimes(1);
    expect(balances.find((b) => b.type === "Staked")!.amount).toBe(1_000_000_000n);
  });

  it("balance-first still populates cache for subsequent getDelegations", async () => {
    const rpc = await mockRpc();
    const staking = createStakingService(rpc, cache, { seedScanMax: 10 });
    const balance = createBalanceService(rpc, cache, { seedScanMax: 10 });

    await balance.getBalances(AUTHORITY);
    const multiCalls = (rpc.getMultipleAccounts as ReturnType<typeof vi.fn>).mock.calls.length;

    const { delegations } = await staking.getDelegations(AUTHORITY);
    expect(rpc.getMultipleAccounts).toHaveBeenCalledTimes(multiCalls);
    expect(delegations).toHaveLength(3);
  });

  it("empty wallet: zeros for stake categories", async () => {
    const rpc = await mockRpc({
      getBalance: vi.fn().mockResolvedValue(1_000n),
      getMultipleAccounts: vi.fn().mockResolvedValue([null, null, null, null, null, null]),
    });
    const service = createBalanceService(rpc, cache, {
      seedScanMax: 5,
      seedScanGapLimit: 5,
    });
    const balances = await service.getBalances(AUTHORITY);
    expect(balances).toEqual([
      { type: "Available", amount: 1_000n },
      { type: "Staked", amount: 0n },
      { type: "Pending", amount: 0n },
      { type: "Claimable", amount: 0n },
    ]);
  });
});
