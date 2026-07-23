import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import {
  address,
  decompileTransactionMessage,
  getCompiledTransactionMessageDecoder,
} from "@solana/kit";
import { getStakeStateAccountEncoder, stakeStateV2 } from "@solana-program/stake";
import type { GuardianChain, SolanaFee, Transaction } from "@guardian-sdk/sdk";
import { SigningError } from "@guardian-sdk/sdk";
import { buildUnsignedTx, findNextFreeSeed } from "../../src/solana-chain/tx/tx-builder";
import type { SolanaRpcClientContract } from "../../src/solana-chain/rpc/solana-rpc-client-contract";
import type {
  SolanaClaimDelegateTransaction,
  SolanaUndelegateTransaction,
} from "../../src/solana-chain/tx/solana-types";
import {
  STAKE_ACCOUNT_SPACE,
  STAKE_PROGRAM_ADDRESS,
  SYSTEM_PROGRAM_ADDRESS,
  U64_MAX,
} from "../../src/solana-chain/state/constants";
import { deriveStakeAddress, seedString } from "../../src/solana-chain/state/seed";
import { solanaMainnet } from "../../src/chain";

const chain = solanaMainnet as GuardianChain;
const AUTHORITY = "So11111111111111111111111111111111111111112";
const VOTE = "CertusDeBmqN8ZawdkxK5kFGMwBXdudvWHYwtNgNhvLu";
const BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";
const RENT = 2_282_880n;
const MIN_DELEGATION = 1n;

const stakeFixtureData = new Uint8Array(
  readFileSync(join(__dirname, "../fixtures/stake-account-stake.bin"))
);

function encodeStakeAccount(deactivationEpoch: bigint): Uint8Array {
  const staker = address(AUTHORITY);
  const voter = address("Vote111111111111111111111111111111111111111");
  const zero = address("11111111111111111111111111111111");
  const state = stakeStateV2("Stake", [
    {
      rentExemptReserve: 2_282_880n,
      authorized: { staker, withdrawer: staker },
      lockup: { unixTimestamp: 0n, epoch: 0n, custodian: zero },
    },
    {
      delegation: {
        voterPubkey: voter,
        stake: 1_000_000_000n,
        activationEpoch: 100n,
        deactivationEpoch,
        reserved: Array(8).fill(0),
      },
      creditsObserved: 42n,
    },
    { bits: 0 },
  ]);
  return new Uint8Array(getStakeStateAccountEncoder().encode({ state }));
}

const fee: SolanaFee = {
  type: "SolanaFee",
  computeUnits: 200_000n,
  computeUnitPrice: 0n,
  total: 5000n,
};

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
    getStakeMinimumDelegation: vi.fn().mockResolvedValue(MIN_DELEGATION),
    getFeeForMessage: vi.fn(),
    getProgramAccountsStakeByStaker: vi.fn(),
    sendTransaction: vi.fn(),
    getStakeHistory: vi.fn(),
    getClockEpoch: vi.fn(),
    ...overrides,
  };
}

function programIdsFromResult(messageBytes: Uint8Array): string[] {
  const compiled = getCompiledTransactionMessageDecoder().decode(messageBytes);
  const decompiled = decompileTransactionMessage(compiled);
  return decompiled.instructions.map((ix) => ix.programAddress);
}

describe("findNextFreeSeed", () => {
  it("returns the first missing derived address", async () => {
    const occupied0 = {
      address: deriveStakeAddress(AUTHORITY, "0"),
      lamports: 1n,
      data: new Uint8Array(STAKE_ACCOUNT_SPACE),
      owner: STAKE_PROGRAM_ADDRESS,
    };
    const rpc = mockRpc({
      getMultipleAccounts: vi.fn().mockResolvedValue([occupied0, null, null]),
    });
    // Only probe 0..2 for the mock array length
    const result = await findNextFreeSeed(rpc, AUTHORITY, 2);
    expect(result.index).toBe(1);
    expect(result.seed).toBe("1");
    expect(result.stakeAddress).toBe(deriveStakeAddress(AUTHORITY, seedString(1)));
  });

  it("throws when every seed slot is occupied", async () => {
    const rpc = mockRpc({
      getMultipleAccounts: vi.fn().mockResolvedValue([
        {
          address: "a",
          lamports: 1n,
          data: new Uint8Array(),
          owner: STAKE_PROGRAM_ADDRESS,
        },
        {
          address: "b",
          lamports: 1n,
          data: new Uint8Array(),
          owner: STAKE_PROGRAM_ADDRESS,
        },
      ]),
    });
    await expect(findNextFreeSeed(rpc, AUTHORITY, 1)).rejects.toMatchObject({
      code: "UNSUPPORTED_OPERATION",
    });
  });
});

describe("buildUnsignedTx", () => {
  it("Delegate: 3 stake/system ixs + optional CU limit; funds amount+rent", async () => {
    const rpc = mockRpc({
      getMultipleAccounts: vi.fn().mockResolvedValue([null]),
    });
    const tx = {
      type: "Delegate",
      chain,
      amount: 1_000_000_000n,
      isMaxAmount: false,
      account: AUTHORITY,
      validator: VOTE,
    } as Transaction;

    const result = await buildUnsignedTx(
      { rpc, authorityAddress: AUTHORITY, config: { seedScanMax: 0 } },
      tx,
      fee
    );

    expect(result.feePayer).toBe(AUTHORITY);
    expect(result.recentBlockhash).toBe(BLOCKHASH);
    expect(result.messageBytes.byteLength).toBeGreaterThan(0);
    expect(result.wireTransactionBase64.length).toBeGreaterThan(0);

    const programs = programIdsFromResult(result.messageBytes);
    // compute unit limit prepended when computeUnits > 0
    expect(programs).toContain(SYSTEM_PROGRAM_ADDRESS);
    expect(programs.filter((p) => p === STAKE_PROGRAM_ADDRESS).length).toBe(2);
    expect(rpc.getMinimumBalanceForRentExemption).toHaveBeenCalledWith(STAKE_ACCOUNT_SPACE);
    expect(rpc.getStakeMinimumDelegation).toHaveBeenCalled();
  });

  it("Delegate: rejects isMaxAmount", async () => {
    const rpc = mockRpc();
    const tx = {
      type: "Delegate",
      chain,
      amount: 1_000_000_000n,
      isMaxAmount: true,
      account: AUTHORITY,
      validator: VOTE,
    } as Transaction;
    await expect(
      buildUnsignedTx({ rpc, authorityAddress: AUTHORITY }, tx, fee)
    ).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
  });

  it("Delegate: rejects amount below min delegation", async () => {
    const rpc = mockRpc({
      getStakeMinimumDelegation: vi.fn().mockResolvedValue(2_000_000_000n),
      getMultipleAccounts: vi.fn().mockResolvedValue([null]),
    });
    const tx = {
      type: "Delegate",
      chain,
      amount: 1_000_000_000n,
      isMaxAmount: false,
      account: AUTHORITY,
      validator: VOTE,
    } as Transaction;
    await expect(
      buildUnsignedTx({ rpc, authorityAddress: AUTHORITY, config: { seedScanMax: 0 } }, tx, fee)
    ).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
  });

  it("Undelegate: single Deactivate on stake program", async () => {
    const stakeAccount = deriveStakeAddress(AUTHORITY, "0");
    const rpc = mockRpc({
      getMultipleAccounts: vi.fn().mockResolvedValue([
        {
          address: stakeAccount,
          lamports: 1_000_000_000n + RENT,
          data: stakeFixtureData,
          owner: STAKE_PROGRAM_ADDRESS,
        },
      ]),
    });
    const tx: SolanaUndelegateTransaction = {
      type: "Undelegate",
      chain,
      amount: 0n,
      isMaxAmount: false,
      stakeAccount,
    };
    const result = await buildUnsignedTx({ rpc, authorityAddress: AUTHORITY }, tx, {
      ...fee,
      computeUnits: 0n,
    });
    const programs = programIdsFromResult(result.messageBytes);
    expect(programs).toEqual([STAKE_PROGRAM_ADDRESS]);
  });

  it("Undelegate: requires stakeAccount", async () => {
    const rpc = mockRpc();
    const tx = {
      type: "Undelegate",
      chain,
      amount: 0n,
      isMaxAmount: false,
    } as Transaction;
    await expect(
      buildUnsignedTx({ rpc, authorityAddress: AUTHORITY }, tx, fee)
    ).rejects.toMatchObject({ code: "INVALID_ADDRESS" });
  });

  it("Undelegate: rejects non-stake-program owner", async () => {
    const stakeAccount = deriveStakeAddress(AUTHORITY, "0");
    const rpc = mockRpc({
      getMultipleAccounts: vi.fn().mockResolvedValue([
        {
          address: stakeAccount,
          lamports: 1n,
          data: stakeFixtureData,
          owner: SYSTEM_PROGRAM_ADDRESS,
        },
      ]),
    });
    const tx: SolanaUndelegateTransaction = {
      type: "Undelegate",
      chain,
      amount: 0n,
      isMaxAmount: false,
      stakeAccount,
    };
    await expect(
      buildUnsignedTx({ rpc, authorityAddress: AUTHORITY }, tx, fee)
    ).rejects.toMatchObject({ code: "INVALID_ADDRESS" });
  });

  it("ClaimDelegate: Withdraw full lamports to authority", async () => {
    const stakeAccount = deriveStakeAddress(AUTHORITY, "0");
    const lamports = 3_000_000_000n;
    const rpc = mockRpc({
      getMultipleAccounts: vi.fn().mockResolvedValue([
        {
          address: stakeAccount,
          lamports,
          data: encodeStakeAccount(110n), // deactivated
          owner: STAKE_PROGRAM_ADDRESS,
        },
      ]),
    });
    const tx: SolanaClaimDelegateTransaction = {
      type: "ClaimDelegate",
      chain,
      amount: 0n,
      stakeAccount,
    };
    const result = await buildUnsignedTx({ rpc, authorityAddress: AUTHORITY }, tx, {
      ...fee,
      computeUnits: 0n,
    });
    const programs = programIdsFromResult(result.messageBytes);
    expect(programs).toEqual([STAKE_PROGRAM_ADDRESS]);
    expect(result.feePayer).toBe(AUTHORITY);
  });

  it("ClaimDelegate: rejects still-active stake (never deactivated)", async () => {
    const stakeAccount = deriveStakeAddress(AUTHORITY, "0");
    const rpc = mockRpc({
      getMultipleAccounts: vi.fn().mockResolvedValue([
        {
          address: stakeAccount,
          lamports: 1_000_000_000n + RENT,
          data: encodeStakeAccount(U64_MAX),
          owner: STAKE_PROGRAM_ADDRESS,
        },
      ]),
    });
    const tx: SolanaClaimDelegateTransaction = {
      type: "ClaimDelegate",
      chain,
      amount: 0n,
      stakeAccount,
    };
    await expect(
      buildUnsignedTx({ rpc, authorityAddress: AUTHORITY }, tx, fee)
    ).rejects.toMatchObject({ code: "UNSUPPORTED_OPERATION" });
  });

  it("ClaimDelegate: rejects missing stake account on chain", async () => {
    const stakeAccount = deriveStakeAddress(AUTHORITY, "0");
    const rpc = mockRpc({
      getMultipleAccounts: vi.fn().mockResolvedValue([null]),
    });
    const tx: SolanaClaimDelegateTransaction = {
      type: "ClaimDelegate",
      chain,
      amount: 0n,
      stakeAccount,
    };
    await expect(
      buildUnsignedTx({ rpc, authorityAddress: AUTHORITY }, tx, fee)
    ).rejects.toMatchObject({ code: "INVALID_ADDRESS" });
  });

  it.each(["Redelegate", "ClaimRewards", "Vote"] as const)(
    "rejects unsupported type %s",
    async (type) => {
      const rpc = mockRpc();
      const tx = {
        type,
        chain,
        amount: 0n,
        ...(type === "Redelegate"
          ? { isMaxAmount: false, fromValidator: VOTE, toValidator: VOTE }
          : type === "Vote"
            ? { validator: VOTE }
            : {}),
      } as Transaction;
      await expect(
        buildUnsignedTx({ rpc, authorityAddress: AUTHORITY }, tx, fee)
      ).rejects.toBeInstanceOf(SigningError);
      await expect(
        buildUnsignedTx({ rpc, authorityAddress: AUTHORITY }, tx, fee)
      ).rejects.toMatchObject({ code: "UNSUPPORTED_TRANSACTION_TYPE" });
    }
  );

  it("rejects non-SolanaFee", async () => {
    const stakeAccount = deriveStakeAddress(AUTHORITY, "0");
    const rpc = mockRpc({
      getMultipleAccounts: vi.fn().mockResolvedValue([
        {
          address: stakeAccount,
          lamports: 1n,
          data: stakeFixtureData,
          owner: STAKE_PROGRAM_ADDRESS,
        },
      ]),
    });
    const tx = {
      type: "Undelegate",
      chain,
      amount: 0n,
      isMaxAmount: false,
      stakeAccount,
    } as Transaction;
    await expect(
      buildUnsignedTx({ rpc, authorityAddress: AUTHORITY }, tx, {
        type: "GasFee",
        gasPrice: 1n,
        gasLimit: 1n,
        total: 1n,
      } as never)
    ).rejects.toMatchObject({ code: "INVALID_FEE_TYPE" });
  });
});
