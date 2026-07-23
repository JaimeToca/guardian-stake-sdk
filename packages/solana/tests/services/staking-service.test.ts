import { describe, it, expect, vi, beforeEach } from "vitest";
import { getStakeStateAccountEncoder, stakeStateV2 } from "@solana-program/stake";
import { address } from "@solana/kit";
import { ValidationError } from "@guardian-sdk/sdk";
import type { SolanaRpcClientContract } from "../../src/solana-chain/rpc/solana-rpc-client-contract";
import type { SolanaAccountInfo } from "../../src/solana-chain/rpc/solana-rpc-types";
import {
  createStakingService,
  mapPositionStatus,
  positionAmount,
} from "../../src/solana-chain/services/staking-service";
import { createStakePositionCache } from "../../src/solana-chain/state/stake-cache";
import { STAKE_PROGRAM_ADDRESS, U64_MAX } from "../../src/solana-chain/state/constants";
import { deriveStakeAddress, seedString } from "../../src/solana-chain/state/seed";
import type { StakePosition } from "../../src/solana-chain/state/stake-account";

const AUTHORITY = "So11111111111111111111111111111111111111112";
const VOTE_A = "CertusDeBmqN8ZawdkxK5kFGMwBXdudvWHYwtNgNhvLu";
const VOTE_B = "Vote111111111111111111111111111111111111111";
const ZERO = "11111111111111111111111111111111";

const encoder = getStakeStateAccountEncoder();

function encodeStake(args: {
  staker?: string;
  withdrawer?: string;
  voter: string;
  stake: bigint;
  activationEpoch: bigint;
  deactivationEpoch?: bigint;
  rentExemptReserve?: bigint;
}): Uint8Array {
  const staker = address(args.staker ?? AUTHORITY);
  const withdrawer = address(args.withdrawer ?? AUTHORITY);
  const voter = address(args.voter);
  const zero = address(ZERO);
  const state = stakeStateV2("Stake", [
    {
      rentExemptReserve: args.rentExemptReserve ?? 2_282_880n,
      authorized: { staker, withdrawer },
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

function encodeInitialized(staker = AUTHORITY): Uint8Array {
  const s = address(staker);
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

function stakeAccount(seedIndex: number, data: Uint8Array, lamports: bigint): SolanaAccountInfo {
  return {
    address: deriveStakeAddress(AUTHORITY, seedString(seedIndex)),
    lamports,
    data,
    owner: STAKE_PROGRAM_ADDRESS,
  };
}

function voteInfo(votePubkey: string, activatedStake: bigint) {
  return {
    votePubkey,
    nodePubkey: votePubkey,
    activatedStake,
    commission: 5,
    epochVoteAccount: true,
    lastVote: 1n,
    rootSlot: 1n,
    epochCredits: [] as const,
  };
}

function mockRpc(overrides: Partial<SolanaRpcClientContract> = {}): SolanaRpcClientContract {
  return {
    getBalance: vi.fn().mockResolvedValue(5_000_000_000n),
    getLatestBlockhash: vi.fn(),
    getEpochInfo: vi.fn().mockResolvedValue({
      epoch: 200n,
      slotIndex: 100n,
      slotsInEpoch: 432_000n,
      absoluteSlot: 1_000_000n,
    }),
    getVoteAccounts: vi.fn().mockResolvedValue({
      current: [voteInfo(VOTE_A, 10_000_000_000n)],
      delinquent: [voteInfo(VOTE_B, 1_000_000_000n)],
    }),
    getMultipleAccounts: vi.fn().mockResolvedValue([]),
    getMinimumBalanceForRentExemption: vi.fn().mockResolvedValue(2_282_880n),
    getStakeMinimumDelegation: vi.fn().mockResolvedValue(1n),
    getFeeForMessage: vi.fn(),
    getProgramAccountsStakeByStaker: vi.fn().mockResolvedValue([]),
    sendTransaction: vi.fn(),
    getStakeHistory: vi.fn().mockResolvedValue([]),
    // epoch 200, no history → fully effective for activationEpoch << 200
    getClockEpoch: vi.fn().mockResolvedValue(200n),
    ...overrides,
  };
}

/** Multi-position fixture: active seed0, deactivating seed1, inactive claimable seed2. */
function multiPositionAccounts(): Map<string, SolanaAccountInfo | null> {
  const active = stakeAccount(
    0,
    encodeStake({
      voter: VOTE_A,
      stake: 1_000_000_000n,
      activationEpoch: 10n, // history missing → fully effective
    }),
    1_002_282_880n
  );
  const deactivating = stakeAccount(
    1,
    encodeStake({
      voter: VOTE_A,
      stake: 500_000_000n,
      activationEpoch: 10n,
      deactivationEpoch: 200n, // current epoch → deactivating
    }),
    502_282_880n
  );
  const claimable = stakeAccount(2, encodeInitialized(), 2_282_880n);
  return new Map([
    [active.address, active],
    [deactivating.address, deactivating],
    [claimable.address, claimable],
  ]);
}

function mockGetMultipleFromMap(
  map: Map<string, SolanaAccountInfo | null>
): SolanaRpcClientContract["getMultipleAccounts"] {
  return vi.fn(async (addresses: string[]) => addresses.map((a) => map.get(a) ?? null));
}

describe("mapPositionStatus / positionAmount", () => {
  const base: StakePosition = {
    stakeAccount: "x",
    seedIndex: 0,
    staker: AUTHORITY,
    withdrawer: AUTHORITY,
    voter: VOTE_A,
    lamports: 1_000n,
    rentExemptReserve: 0n,
    delegatedStake: 900n,
    activationEpoch: 1n,
    deactivationEpoch: U64_MAX,
    creditsObserved: 0n,
    effective: 800n,
    activating: 100n,
    deactivating: 0n,
    status: "active",
  };

  it("maps activating → Active and amounts", () => {
    expect(mapPositionStatus("activating")).toBe("Active");
    expect(mapPositionStatus("active")).toBe("Active");
    expect(mapPositionStatus("deactivating")).toBe("Pending");
    expect(mapPositionStatus("inactive")).toBe("Claimable");
    expect(positionAmount({ ...base, status: "activating" })).toBe(900n);
    expect(positionAmount({ ...base, status: "deactivating", deactivating: 500n })).toBe(500n);
    expect(positionAmount({ ...base, status: "inactive", lamports: 1_234n })).toBe(1_234n);
  });
});

describe("createStakingService", () => {
  let cache: ReturnType<typeof createStakePositionCache>;

  beforeEach(() => {
    cache = createStakePositionCache(30_000);
  });

  it("getValidators maps current/delinquent, paginates, apy 0", async () => {
    const rpc = mockRpc();
    const service = createStakingService(rpc, cache, { validatorsCacheTtlMs: 60_000 });
    const page = await service.getValidators({ page: 1, pageSize: 1 });
    expect(page.data).toHaveLength(1);
    expect(page.data[0]!.id).toBe(VOTE_A);
    expect(page.data[0]!.operatorAddress).toBe(VOTE_A);
    expect(page.data[0]!.status).toBe("Active");
    expect(page.data[0]!.apy).toBe(0);
    expect(page.data[0]!.creditAddress).toBe("");
    expect(page.pagination.total).toBe(2);
    expect(page.pagination.hasNextPage).toBe(true);

    const page2 = await service.getValidators({ page: 2, pageSize: 1 });
    expect(page2.data[0]!.id).toBe(VOTE_B);
    expect(page2.data[0]!.status).toBe("Inactive");

    // vote accounts cached — second call does not re-fetch
    expect(rpc.getVoteAccounts).toHaveBeenCalledTimes(1);
  });

  it("getValidators rejects invalid page params", async () => {
    const service = createStakingService(mockRpc(), cache);
    await expect(service.getValidators({ page: 0 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("getDelegations maps multi-position lifecycle", async () => {
    const map = multiPositionAccounts();
    const rpc = mockRpc({
      getMultipleAccounts: mockGetMultipleFromMap(map),
      getClockEpoch: vi.fn().mockResolvedValue(200n),
      getStakeHistory: vi.fn().mockResolvedValue([]),
    });
    const service = createStakingService(rpc, cache, {
      seedScanMax: 10,
      seedScanGapLimit: 5,
    });

    const { delegations, stakingSummary } = await service.getDelegations(AUTHORITY);

    expect(delegations).toHaveLength(3);

    const active = delegations.find((d) => d.delegationIndex === 0n)!;
    expect(active.status).toBe("Active");
    expect(active.amount).toBe(1_000_000_000n);
    expect(active.validator.id).toBe(VOTE_A);
    expect(active.pendingUntil).toBe(0);
    expect(active.id).toBe(deriveStakeAddress(AUTHORITY, "0"));

    const pending = delegations.find((d) => d.delegationIndex === 1n)!;
    expect(pending.status).toBe("Pending");
    expect(pending.amount).toBe(500_000_000n);
    expect(pending.pendingUntil).toBeGreaterThan(Date.now());

    const claimable = delegations.find((d) => d.delegationIndex === 2n)!;
    expect(claimable.status).toBe("Claimable");
    expect(claimable.amount).toBe(2_282_880n);
    expect(claimable.validator.id).toBe("solana-stake-inactive");
    expect(claimable.pendingUntil).toBe(0);

    expect(stakingSummary.maxApy).toBe(0);
    expect(stakingSummary.minAmountToStake).toBe(1n);
    expect(stakingSummary.activeValidators).toBe(1);
    expect(stakingSummary.totalValidators).toBe(2);
    expect(stakingSummary.totalProtocolStake).toBe(11_000_000_000);
    expect(stakingSummary.redelegateFeeRate).toBe(0);
    expect(stakingSummary.unboundPeriodInMillis).toBe(432_000 * 400);
  });

  it("cache hit skips getMultipleAccounts on second getDelegations", async () => {
    const map = multiPositionAccounts();
    const getMultipleAccounts = mockGetMultipleFromMap(map);
    const rpc = mockRpc({ getMultipleAccounts });
    const service = createStakingService(rpc, cache, { seedScanMax: 10 });

    await service.getDelegations(AUTHORITY);
    const callsAfterFirst = (getMultipleAccounts as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    await service.getDelegations(AUTHORITY);
    expect(getMultipleAccounts).toHaveBeenCalledTimes(callsAfterFirst);
    // clock/history also not re-fetched for positions (only via vote cache / min / epoch for summary)
    expect(rpc.getClockEpoch).toHaveBeenCalledTimes(1);
  });

  it("stops seed-scan after consecutive empty gap", async () => {
    const seed0 = stakeAccount(
      0,
      encodeStake({ voter: VOTE_A, stake: 1_000n, activationEpoch: 1n }),
      3_000n
    );
    const getMultipleAccounts = vi.fn(async (addresses: string[]) =>
      addresses.map((a) => (a === seed0.address ? seed0 : null))
    );
    const rpc = mockRpc({ getMultipleAccounts });
    const service = createStakingService(rpc, cache, {
      seedScanMax: 50,
      seedScanGapLimit: 3,
    });

    const { delegations } = await service.getDelegations(AUTHORITY);
    expect(delegations).toHaveLength(1);
    // First batch includes seeds 0..49 but stops after 3 consecutive empty after seed0,
    // so only one getMultipleAccounts batch (batch size 50 covers 0..49, early stop mid-batch).
    expect(getMultipleAccounts).toHaveBeenCalledTimes(1);
    // Only probed addresses up through the gap (0 + 3 empty = indices 0,1,2,3)
    const probed = (getMultipleAccounts as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string[];
    // Full batch is still requested; gap stop is sequential within the batch response.
    expect(probed.length).toBeGreaterThanOrEqual(4);
  });

  it("optional GPA merges accounts missed by seed scan", async () => {
    const gpaOnlyData = encodeStake({
      voter: VOTE_B,
      stake: 2_000_000_000n,
      activationEpoch: 1n,
    });
    // Address outside seed-scan range (seed 99) so only GPA discovers it.
    const highSeedAddr = deriveStakeAddress(AUTHORITY, seedString(99));
    const gpaAccount = {
      address: highSeedAddr,
      lamports: 2_002_282_880n,
      data: gpaOnlyData,
    };

    const rpc = mockRpc({
      getMultipleAccounts: vi.fn().mockResolvedValue([null, null, null, null, null, null]),
      getProgramAccountsStakeByStaker: vi.fn().mockResolvedValue([gpaAccount]),
    });
    const service = createStakingService(rpc, cache, {
      seedScanMax: 5,
      seedScanGapLimit: 5,
      enableGpaFallback: true,
    });

    const { delegations } = await service.getDelegations(AUTHORITY);
    expect(rpc.getProgramAccountsStakeByStaker).toHaveBeenCalledWith(AUTHORITY);
    expect(delegations.some((d) => d.id === highSeedAddr)).toBe(true);
    const found = delegations.find((d) => d.id === highSeedAddr)!;
    expect(found.status).toBe("Active");
    expect(found.amount).toBe(2_000_000_000n);
    expect(found.delegationIndex).toBe(0n); // seed unknown → 0
  });

  it("filters accounts whose staker/withdrawer do not match authority", async () => {
    const other = stakeAccount(
      0,
      encodeStake({
        staker: VOTE_A,
        withdrawer: VOTE_A,
        voter: VOTE_A,
        stake: 1_000n,
        activationEpoch: 1n,
      }),
      3_000n
    );
    const rpc = mockRpc({
      getMultipleAccounts: mockGetMultipleFromMap(new Map([[other.address, other]])),
    });
    const service = createStakingService(rpc, cache, { seedScanMax: 5, seedScanGapLimit: 5 });
    const { delegations } = await service.getDelegations(AUTHORITY);
    expect(delegations).toHaveLength(0);
  });
});
