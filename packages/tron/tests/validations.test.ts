import { describe, it, expect } from "vitest";
import {
  availableTronPower,
  assertVote,
  assertFreeze,
  assertUnfreeze,
  assertResource,
} from "../src/tron-chain/validations";
import type { TronAccount, TronWitness } from "../src/tron-chain/rpc/tron-rpc-types";
import { ValidationError } from "@guardian-sdk/sdk";

const account: TronAccount = {
  balance: 10_000_000n,
  frozen: [{ resource: "BANDWIDTH", amount: 100_000_000n }],
  unfreezing: [],
  votes: [{ srAddress: "TSR", votes: 60n }],
};
const witnesses: TronWitness[] = [{ address: "TSR", voteCount: 1000n, url: "", isSr: true }];

describe("validations", () => {
  it("availableTronPower = frozen - votes*SUN", () => {
    expect(availableTronPower(account)).toBe(40_000_000n); // 100 TRX frozen - 60 voted
  });
  it("assertVote rejects over-voting past available Tron Power", () => {
    expect(() => assertVote(account, witnesses, "TSR", 50_000_000n)).toThrow();
  });
  it("assertVote accepts a valid vote within available power", () => {
    expect(() => assertVote(account, witnesses, "TSR", 40_000_000n)).not.toThrow();
  });
  it("assertVote rejects non-whole-TRX amounts", () => {
    expect(() => assertVote(account, witnesses, "TSR", 1_500_000n)).toThrow();
  });
  it("assertVote rejects an unknown SR", () => {
    expect(() => assertVote(account, witnesses, "TUNKNOWN", 10_000_000n)).toThrow();
  });
  it("assertFreeze rejects below 1 TRX and above balance", () => {
    expect(() => assertFreeze(10_000_000n, 500_000n)).toThrow();
    expect(() => assertFreeze(10_000_000n, 20_000_000n)).toThrow();
  });
  it("assertFreeze accepts a valid freeze amount", () => {
    expect(() => assertFreeze(10_000_000n, 5_000_000n)).not.toThrow();
  });
  it("assertUnfreeze rejects amount above frozen for that resource", () => {
    expect(() => assertUnfreeze(account, "BANDWIDTH", 200_000_000n)).toThrow();
    expect(() => assertUnfreeze(account, "ENERGY", 1_000_000n)).toThrow();
  });
  it("assertUnfreeze accepts a valid unfreeze amount", () => {
    expect(() => assertUnfreeze(account, "BANDWIDTH", 50_000_000n)).not.toThrow();
  });
  it("assertResource accepts BANDWIDTH and ENERGY", () => {
    expect(() => assertResource("BANDWIDTH")).not.toThrow();
    expect(() => assertResource("ENERGY")).not.toThrow();
  });
  it("assertResource rejects missing/invalid resource with INVALID_RESOURCE", () => {
    expect(() => assertResource(undefined)).toThrow(ValidationError);
    expect(() => assertResource("")).toThrow(ValidationError);
    expect(() => assertResource("STAKED")).toThrow(ValidationError);
    try {
      assertResource(undefined);
      throw new Error("expected assertResource to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).code).toBe("INVALID_RESOURCE");
    }
  });
});
