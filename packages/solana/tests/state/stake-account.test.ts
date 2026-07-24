import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getStakeStateAccountEncoder, stakeStateV2 } from "@solana-program/stake";
import { address } from "@solana/kit";
import {
  decodeStakeAccount,
  isLockupInForce,
  toStakePosition,
} from "../../src/solana-chain/state/stake-account";
import { U64_MAX } from "../../src/solana-chain/state/constants";
import { computeStakeActivation } from "../../src/solana-chain/state/activation";

const fixturesDir = join(__dirname, "../fixtures");

describe("decodeStakeAccount", () => {
  it("decodes Stake state from fixture", () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "stake-account-stake.bin")));
    const view = decodeStakeAccount(data);
    expect(view).not.toBeNull();
    expect(view!.kind).toBe("Stake");
    expect(view!.staker).toBe("So11111111111111111111111111111111111111112");
    expect(view!.withdrawer).toBe("So11111111111111111111111111111111111111112");
    expect(view!.voter).toBe("Vote111111111111111111111111111111111111111");
    expect(view!.rentExemptReserve).toBe(2_282_880n);
    expect(view!.delegatedStake).toBe(1_000_000_000n);
    expect(view!.activationEpoch).toBe(100n);
    expect(view!.deactivationEpoch).toBe(U64_MAX);
    expect(view!.creditsObserved).toBe(42n);
  });

  it("decodes Initialized state from fixture", () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "stake-account-initialized.bin")));
    const view = decodeStakeAccount(data);
    expect(view).not.toBeNull();
    expect(view!.kind).toBe("Initialized");
    expect(view!.staker).toBe("So11111111111111111111111111111111111111112");
    expect(view!.voter).toBeUndefined();
    expect(view!.delegatedStake).toBe(0n);
  });

  it("decodes Uninitialized state from fixture", () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "stake-account-uninitialized.bin")));
    const view = decodeStakeAccount(data);
    expect(view).not.toBeNull();
    expect(view!.kind).toBe("Uninitialized");
    expect(view!.staker).toBeUndefined();
  });

  it("returns null for empty buffer", () => {
    expect(decodeStakeAccount(new Uint8Array())).toBeNull();
  });

  it("round-trips via getStakeStateAccountEncoder", () => {
    const staker = address("So11111111111111111111111111111111111111112");
    const voter = address("Vote111111111111111111111111111111111111111");
    const zero = address("11111111111111111111111111111111");
    const state = stakeStateV2("Stake", [
      {
        rentExemptReserve: 2_282_880n,
        authorized: { staker, withdrawer: staker },
        lockup: { unixTimestamp: 1_800_000_000n, epoch: 300n, custodian: zero },
      },
      {
        delegation: {
          voterPubkey: voter,
          stake: 5_000_000_000n,
          activationEpoch: 7n,
          deactivationEpoch: U64_MAX,
          reserved: Array(8).fill(0),
        },
        creditsObserved: 99n,
      },
      { bits: 0 },
    ]);
    const bytes = getStakeStateAccountEncoder().encode({ state });
    const view = decodeStakeAccount(new Uint8Array(bytes));
    expect(view!.kind).toBe("Stake");
    expect(view!.delegatedStake).toBe(5_000_000_000n);
    expect(view!.activationEpoch).toBe(7n);
    expect(view!.creditsObserved).toBe(99n);
    expect(view!.lockup).toEqual({
      unixTimestamp: 1_800_000_000n,
      epoch: 300n,
      custodian: "11111111111111111111111111111111",
    });
  });

  it("exposes zero lockup on fixture Stake accounts", () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "stake-account-stake.bin")));
    const view = decodeStakeAccount(data)!;
    expect(view.lockup).toBeDefined();
    expect(view.lockup!.unixTimestamp).toBe(0n);
    expect(view.lockup!.epoch).toBe(0n);
  });
});

describe("isLockupInForce", () => {
  const lockup = {
    unixTimestamp: 0n,
    epoch: 0n,
    custodian: "11111111111111111111111111111111",
  };

  it("is false when both lockup fields are zero / past", () => {
    expect(isLockupInForce(lockup, { epoch: 200n, unixTimestamp: 1_700_000_000n })).toBe(false);
  });

  it("is true when unixTimestamp is still in the future", () => {
    expect(
      isLockupInForce(
        { ...lockup, unixTimestamp: 9_999_999_999n },
        { epoch: 200n, unixTimestamp: 1_700_000_000n }
      )
    ).toBe(true);
  });

  it("is true when lockup epoch is after current epoch", () => {
    expect(
      isLockupInForce({ ...lockup, epoch: 500n }, { epoch: 200n, unixTimestamp: 1_700_000_000n })
    ).toBe(true);
  });
});

describe("toStakePosition", () => {
  it("merges activation into a Stake view", () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "stake-account-stake.bin")));
    const view = decodeStakeAccount(data)!;
    const activation = computeStakeActivation(
      {
        stake: view.delegatedStake,
        activationEpoch: view.activationEpoch,
        deactivationEpoch: view.deactivationEpoch,
      },
      200n,
      new Map(),
      0.09
    );
    const position = toStakePosition({
      stakeAccount: "StakeAcct111111111111111111111111111111111",
      seedIndex: 0,
      lamports: 1_002_282_880n,
      view,
      activation,
    });
    expect(position.status).toBe("active");
    expect(position.effective).toBe(1_000_000_000n);
    expect(position.seedIndex).toBe(0);
    expect(position.staker).toBe(view.staker);
  });

  it("marks Initialized accounts inactive", () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "stake-account-initialized.bin")));
    const view = decodeStakeAccount(data)!;
    const position = toStakePosition({
      stakeAccount: "InitAcct1111111111111111111111111111111111",
      lamports: 2_282_880n,
      view,
    });
    expect(position.status).toBe("inactive");
    expect(position.effective).toBe(0n);
    expect(position.voter).toBeUndefined();
  });
});
