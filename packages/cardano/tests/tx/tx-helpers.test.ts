import { describe, it, expect, beforeAll } from "vitest";
import { ready } from "@cardano-sdk/crypto";
import {
  buildCertificates,
  buildWithdrawals,
  computeRequiredLovelaces,
  rewardAccountWithdrawal,
} from "../../src/cardano-chain/tx/tx-helpers";
import { cardanoMainnet } from "../../src/chain";

const POOL_ID = "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy";
const STAKE_HASH = "00".repeat(28); // 28-byte placeholder stake key hash
const KEY_DEPOSIT = 2_000_000n;
const FEE = 200_000n;

const tx = (type: string, extra: Record<string, unknown> = {}) =>
  ({ type, chain: cardanoMainnet, account: "addr1...", ...extra }) as any;

beforeAll(async () => {
  await ready();
});

describe("buildCertificates", () => {
  it("Delegate (unregistered) → StakeRegistration + StakeDelegation", () => {
    const certs = buildCertificates(tx("Delegate", { validator: POOL_ID }), STAKE_HASH, false);
    expect(certs.map((c) => c.type)).toEqual(["StakeRegistration", "StakeDelegation"]);
  });

  it("Delegate (registered) → StakeDelegation only", () => {
    const certs = buildCertificates(tx("Delegate", { validator: POOL_ID }), STAKE_HASH, true);
    expect(certs.map((c) => c.type)).toEqual(["StakeDelegation"]);
  });

  it("Redelegate (unregistered) → registers first (StakeRegistration + StakeDelegation)", () => {
    const certs = buildCertificates(tx("Redelegate", { toValidator: POOL_ID }), STAKE_HASH, false);
    expect(certs.map((c) => c.type)).toEqual(["StakeRegistration", "StakeDelegation"]);
  });

  it("Redelegate (registered) → StakeDelegation only", () => {
    const certs = buildCertificates(tx("Redelegate", { toValidator: POOL_ID }), STAKE_HASH, true);
    expect(certs.map((c) => c.type)).toEqual(["StakeDelegation"]);
  });

  it("Undelegate → StakeDeregistration", () => {
    const certs = buildCertificates(tx("Undelegate"), STAKE_HASH, true);
    expect(certs.map((c) => c.type)).toEqual(["StakeDeregistration"]);
  });

  it("ClaimRewards → no certificates", () => {
    const certs = buildCertificates(tx("ClaimRewards", { amount: 1n }), STAKE_HASH, true);
    expect(certs).toEqual([]);
  });
});

describe("rewardAccountWithdrawal (full-drain rule)", () => {
  it("ClaimRewards withdraws the FULL on-chain balance, not the requested amount", () => {
    // Partial withdrawals are invalid on Cardano — a claim of 0.5 ADA against a
    // 1 ADA balance must still drain the whole 1 ADA.
    const amount = rewardAccountWithdrawal(tx("ClaimRewards", { amount: 500_000n }), 1_000_000n);
    expect(amount).toBe(1_000_000n);
  });

  it("Undelegate sweeps the full on-chain balance", () => {
    expect(rewardAccountWithdrawal(tx("Undelegate"), 750_000n)).toBe(750_000n);
  });

  it("Delegate moves no rewards", () => {
    expect(rewardAccountWithdrawal(tx("Delegate", { validator: POOL_ID }), 999n)).toBe(0n);
  });
});

describe("buildWithdrawals", () => {
  it("ClaimRewards → map holds the full on-chain balance", () => {
    const map = buildWithdrawals(tx("ClaimRewards", { amount: 500_000n }), STAKE_HASH, 1_000_000n);
    expect([...map.values()]).toEqual([1_000_000n]);
  });

  it("returns an empty map when there are no rewards to move", () => {
    expect(buildWithdrawals(tx("ClaimRewards", { amount: 1n }), STAKE_HASH, 0n).size).toBe(0);
    expect(buildWithdrawals(tx("Delegate", { validator: POOL_ID }), STAKE_HASH, 5n).size).toBe(0);
  });
});

describe("computeRequiredLovelaces", () => {
  it("Delegate (unregistered) requires fee + key deposit", () => {
    expect(computeRequiredLovelaces(tx("Delegate"), FEE, KEY_DEPOSIT, false)).toBe(
      FEE + KEY_DEPOSIT
    );
  });

  it("Redelegate (unregistered) requires fee + key deposit", () => {
    expect(computeRequiredLovelaces(tx("Redelegate"), FEE, KEY_DEPOSIT, false)).toBe(
      FEE + KEY_DEPOSIT
    );
  });

  it("Redelegate (registered) requires only the fee", () => {
    expect(computeRequiredLovelaces(tx("Redelegate"), FEE, KEY_DEPOSIT, true)).toBe(FEE);
  });

  it("Undelegate and ClaimRewards require only the fee", () => {
    expect(computeRequiredLovelaces(tx("Undelegate"), FEE, KEY_DEPOSIT, true)).toBe(FEE);
    expect(computeRequiredLovelaces(tx("ClaimRewards"), FEE, KEY_DEPOSIT, true)).toBe(FEE);
  });
});
