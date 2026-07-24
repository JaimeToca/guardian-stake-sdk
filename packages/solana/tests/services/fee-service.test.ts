import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { address } from "@solana/kit";
import { getStakeStateAccountEncoder, stakeStateV2 } from "@solana-program/stake";
import type { GuardianChain, Transaction } from "@guardian-sdk/sdk";
import { ValidationError } from "@guardian-sdk/sdk";
import { createFeeService, priorityFeeLamports } from "../../src/solana-chain/services/fee-service";
import type { SolanaRpcClientContract } from "../../src/solana-chain/rpc/solana-rpc-client-contract";
import type {
  SolanaClaimDelegateTransaction,
  SolanaUndelegateTransaction,
} from "../../src/solana-chain/tx/solana-types";
import { STAKE_PROGRAM_ADDRESS } from "../../src/solana-chain/state/constants";
import { deriveStakeAddress } from "../../src/solana-chain/state/seed";
import { solanaMainnet } from "../../src/chain";

const chain = solanaMainnet as GuardianChain;
const AUTHORITY = "So11111111111111111111111111111111111111112";
const VOTE = "CertusDeBmqN8ZawdkxK5kFGMwBXdudvWHYwtNgNhvLu";
const BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";
const RENT = 2_282_880n;

const stakeFixtureData = new Uint8Array(
  readFileSync(join(__dirname, "../fixtures/stake-account-stake.bin"))
);

function encodeDeactivatedStake(): Uint8Array {
  const staker = address(AUTHORITY);
  const voter = address("Vote111111111111111111111111111111111111111");
  const zero = address("11111111111111111111111111111111");
  const state = stakeStateV2("Stake", [
    {
      rentExemptReserve: RENT,
      authorized: { staker, withdrawer: staker },
      lockup: { unixTimestamp: 0n, epoch: 0n, custodian: zero },
    },
    {
      delegation: {
        voterPubkey: voter,
        stake: 1_000_000_000n,
        activationEpoch: 100n,
        deactivationEpoch: 110n,
        reserved: Array(8).fill(0),
      },
      creditsObserved: 42n,
    },
    { bits: 0 },
  ]);
  return new Uint8Array(getStakeStateAccountEncoder().encode({ state }));
}

function mockRpc(overrides: Partial<SolanaRpcClientContract> = {}): SolanaRpcClientContract {
  return {
    getBalance: vi.fn().mockResolvedValue(10_000_000_000n),
    getLatestBlockhash: vi.fn().mockResolvedValue({
      blockhash: BLOCKHASH,
      lastValidBlockHeight: 123n,
    }),
    getEpochInfo: vi.fn(),
    getVoteAccounts: vi.fn(),
    getMultipleAccounts: vi.fn().mockResolvedValue([null]),
    getMinimumBalanceForRentExemption: vi.fn().mockResolvedValue(RENT),
    getStakeMinimumDelegation: vi.fn().mockResolvedValue(1n),
    getFeeForMessage: vi.fn().mockResolvedValue(5_000n),
    getProgramAccountsStakeByStaker: vi.fn(),
    sendTransaction: vi.fn(),
    getStakeHistory: vi.fn(),
    getClock: vi.fn().mockResolvedValue({ epoch: 200n, unixTimestamp: 1_700_000_000n }),
    getClockEpoch: vi.fn().mockResolvedValue(200n),
    getInflationRate: vi.fn(),
    getSupply: vi.fn(),
    ...overrides,
  };
}

describe("priorityFeeLamports", () => {
  it("computes ceil(CU × price / 1e6)", () => {
    // Exact division
    expect(priorityFeeLamports(200_000n, 1_000n)).toBe(200n);
    expect(priorityFeeLamports(50_000n, 0n)).toBe(0n);
    expect(priorityFeeLamports(0n, 1_000n)).toBe(0n);
    // Remainder rounds up (Solana charges ceil, not floor)
    expect(priorityFeeLamports(1n, 1n)).toBe(1n);
    expect(priorityFeeLamports(1_000_001n, 1n)).toBe(2n);
    expect(priorityFeeLamports(3n, 500_000n)).toBe(2n); // 1_500_000 / 1e6 → 2
  });
});

describe("createFeeService", () => {
  it("Delegate: SolanaFee total is base fee + priority fee when CU price > 0", async () => {
    // getFeeForMessage returns only the base signature fee; the prioritization fee
    // ceil(computeUnits * computeUnitPrice / 1e6) is added on top.
    const rpc = mockRpc({
      getMultipleAccounts: vi.fn().mockResolvedValue([null]),
      getFeeForMessage: vi.fn().mockResolvedValue(5_000n),
    });
    const feeSvc = createFeeService(rpc, { defaultComputeUnitPrice: 1_000n, seedScanMax: 0 });
    const tx = {
      type: "Delegate",
      chain,
      amount: 1_000_000_000n,
      isMaxAmount: false,
      account: AUTHORITY,
      validator: VOTE,
    } as Transaction;

    const fee = await feeSvc.estimateFee(tx);
    expect(fee.type).toBe("SolanaFee");
    expect(fee.computeUnits).toBe(200_000n);
    expect(fee.computeUnitPrice).toBe(1_000n);
    // 5_000 base + ceil(200_000 * 1_000 / 1_000_000) = 5_000 + 200
    expect(fee.total).toBe(5_200n);
    expect(rpc.getFeeForMessage).toHaveBeenCalledOnce();
  });

  it("Delegate: applies the default 100k CU price when none is supplied", async () => {
    // No defaultComputeUnitPrice → DEFAULT_COMPUTE_UNIT_PRICE (100_000 microlamports/CU).
    const rpc = mockRpc({
      getMultipleAccounts: vi.fn().mockResolvedValue([null]),
      getFeeForMessage: vi.fn().mockResolvedValue(5_000n),
    });
    const feeSvc = createFeeService(rpc, { seedScanMax: 0 });
    const tx = {
      type: "Delegate",
      chain,
      amount: 1_000_000_000n,
      isMaxAmount: false,
      account: AUTHORITY,
      validator: VOTE,
    } as Transaction;

    const fee = await feeSvc.estimateFee(tx);
    expect(fee.type).toBe("SolanaFee");
    expect(fee.computeUnitPrice).toBe(100_000n);
    // 5_000 base + ceil(200_000 * 100_000 / 1_000_000) = 5_000 + 20_000
    expect(fee.total).toBe(25_000n);
  });

  it("Delegate: quotes a fee for an unfunded wallet (no balance gate on estimate)", async () => {
    // Balance far below amount + rent — sign() would reject, but estimateFee must not.
    const rpc = mockRpc({
      getBalance: vi.fn().mockResolvedValue(0n),
      getMultipleAccounts: vi.fn().mockResolvedValue([null]),
      getFeeForMessage: vi.fn().mockResolvedValue(5_000n),
    });
    // Explicit 0n opts out of the priority fee, isolating the balance-gate assertion.
    const feeSvc = createFeeService(rpc, { seedScanMax: 0, defaultComputeUnitPrice: 0n });
    const tx = {
      type: "Delegate",
      chain,
      amount: 1_000_000_000n,
      isMaxAmount: false,
      account: AUTHORITY,
      validator: VOTE,
    } as Transaction;

    const fee = await feeSvc.estimateFee(tx);
    expect(fee.type).toBe("SolanaFee");
    expect(fee.total).toBe(5_000n);
  });

  it("Undelegate: uses static CU budget 50_000", async () => {
    const stakeAccount = await deriveStakeAddress(AUTHORITY, "0");
    const rpc = mockRpc({
      getMultipleAccounts: vi.fn().mockResolvedValue([
        {
          address: stakeAccount,
          lamports: 1_000_000_000n + RENT,
          data: stakeFixtureData,
          owner: STAKE_PROGRAM_ADDRESS,
        },
      ]),
      getFeeForMessage: vi.fn().mockResolvedValue(5_000n),
    });
    const feeSvc = createFeeService(rpc, { defaultComputeUnitPrice: 0n });
    const tx: SolanaUndelegateTransaction = {
      type: "Undelegate",
      chain,
      amount: 0n,
      isMaxAmount: false,
      stakeAccount,
      account: AUTHORITY,
    };

    const fee = await feeSvc.estimateFee(tx);
    expect(fee.computeUnits).toBe(50_000n);
    expect(fee.total).toBe(5_000n);
  });

  it("ClaimDelegate: fee for withdraw message", async () => {
    const stakeAccount = await deriveStakeAddress(AUTHORITY, "0");
    const rpc = mockRpc({
      getMultipleAccounts: vi.fn().mockResolvedValue([
        {
          address: stakeAccount,
          lamports: 3_000_000_000n,
          data: encodeDeactivatedStake(),
          owner: STAKE_PROGRAM_ADDRESS,
        },
      ]),
      getFeeForMessage: vi.fn().mockResolvedValue(5_000n),
    });
    const feeSvc = createFeeService(rpc);
    const tx: SolanaClaimDelegateTransaction = {
      type: "ClaimDelegate",
      chain,
      amount: 0n,
      stakeAccount,
      account: AUTHORITY,
    };

    const fee = await feeSvc.estimateFee(tx);
    expect(fee.type).toBe("SolanaFee");
    expect(fee.computeUnits).toBe(50_000n);
    expect(fee.computeUnitPrice).toBe(100_000n);
    // 5_000 base + ceil(50_000 * 100_000 / 1_000_000) = 5_000 + 5_000
    expect(fee.total).toBe(10_000n);
  });

  it("requires transaction.account", async () => {
    const rpc = mockRpc();
    const feeSvc = createFeeService(rpc);
    const tx = {
      type: "Delegate",
      chain,
      amount: 1_000_000_000n,
      isMaxAmount: false,
      validator: VOTE,
    } as Transaction;

    await expect(feeSvc.estimateFee(tx)).rejects.toBeInstanceOf(ValidationError);
    await expect(feeSvc.estimateFee(tx)).rejects.toMatchObject({ code: "INVALID_ADDRESS" });
  });

  it("throws when getFeeForMessage returns null", async () => {
    const stakeAccount = await deriveStakeAddress(AUTHORITY, "0");
    const rpc = mockRpc({
      getMultipleAccounts: vi.fn().mockResolvedValue([
        {
          address: stakeAccount,
          lamports: 1n,
          data: stakeFixtureData,
          owner: STAKE_PROGRAM_ADDRESS,
        },
      ]),
      getFeeForMessage: vi.fn().mockResolvedValue(null),
    });
    const feeSvc = createFeeService(rpc);
    const tx: SolanaUndelegateTransaction = {
      type: "Undelegate",
      chain,
      amount: 0n,
      isMaxAmount: false,
      stakeAccount,
      account: AUTHORITY,
    };

    await expect(feeSvc.estimateFee(tx)).rejects.toMatchObject({ code: "INVALID_FEE" });
  });

  it("rejects unsupported transaction types", async () => {
    const rpc = mockRpc();
    const feeSvc = createFeeService(rpc);
    const tx = {
      type: "Vote",
      chain,
      amount: 0n,
      account: AUTHORITY,
      validator: VOTE,
    } as Transaction;

    await expect(feeSvc.estimateFee(tx)).rejects.toMatchObject({
      code: "UNSUPPORTED_TRANSACTION_TYPE",
    });
  });
});
