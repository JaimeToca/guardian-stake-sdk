import { describe, it, expect } from "vitest";
import {
  availableTronPower,
  assertVote,
  assertFreeze,
  assertUnfreeze,
} from "../src/tron-chain/validations";
import type { TronAccount, TronWitness } from "../src/tron-chain/rpc/tron-rpc-types";

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
  it("assertVote rejects an unknown SR", () => {
    expect(() => assertVote(account, witnesses, "TUNKNOWN", 10_000_000n)).toThrow();
  });
  it("assertFreeze rejects below 1 TRX and above balance", () => {
    expect(() => assertFreeze(10_000_000n, 500_000n)).toThrow();
    expect(() => assertFreeze(10_000_000n, 20_000_000n)).toThrow();
  });
  it("assertUnfreeze rejects amount above frozen for that resource", () => {
    expect(() => assertUnfreeze(account, "BANDWIDTH", 200_000_000n)).toThrow();
    expect(() => assertUnfreeze(account, "ENERGY", 1_000_000n)).toThrow();
  });
});
