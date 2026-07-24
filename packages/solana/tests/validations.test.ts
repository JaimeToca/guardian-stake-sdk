import { describe, it, expect } from "vitest";
import type { GuardianChain } from "@guardian-sdk/sdk";
import { SigningError, ValidationError } from "@guardian-sdk/sdk";
import {
  assertAuthorityAddress,
  assertDelegate,
  assertStakeAccount,
  assertSupportedTransactionType,
} from "../src/solana-chain/tx/validations";
import type {
  SolanaClaimDelegateTransaction,
  SolanaUndelegateTransaction,
} from "../src/solana-chain/tx/solana-types";
import { solanaMainnet } from "../src/chain";

const chain = solanaMainnet as GuardianChain;
const AUTHORITY = "So11111111111111111111111111111111111111112";
const STAKE = "3xqN5C8yRt8dBZ9mHxzzfym5nvKtfgQQffFcpuAYBkvB";
const VOTE = "CertusDeBmqN8ZawdkxK5kFGMwBXdudvWHYwtNgNhvLu";

describe("assertDelegate", () => {
  it("accepts a valid explicit-amount delegate", () => {
    expect(() =>
      assertDelegate({
        type: "Delegate",
        chain,
        amount: 1_000_000_000n,
        isMaxAmount: false,
        account: AUTHORITY,
        validator: VOTE,
      })
    ).not.toThrow();
  });

  it("rejects isMaxAmount: true", () => {
    expect(() =>
      assertDelegate({
        type: "Delegate",
        chain,
        amount: 1_000_000_000n,
        isMaxAmount: true,
        account: AUTHORITY,
        validator: VOTE,
      })
    ).toThrow(ValidationError);
    try {
      assertDelegate({
        type: "Delegate",
        chain,
        amount: 1_000_000_000n,
        isMaxAmount: true,
        account: AUTHORITY,
        validator: VOTE,
      });
    } catch (err) {
      expect(err).toMatchObject({ code: "INVALID_AMOUNT" });
    }
  });

  it("rejects amount <= 0", () => {
    try {
      assertDelegate({
        type: "Delegate",
        chain,
        amount: 0n,
        isMaxAmount: false,
        account: AUTHORITY,
        validator: VOTE,
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect(err).toMatchObject({ code: "INVALID_AMOUNT" });
    }
  });

  it("rejects missing account", () => {
    try {
      assertDelegate({
        type: "Delegate",
        chain,
        amount: 1_000_000_000n,
        isMaxAmount: false,
        validator: VOTE,
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect(err).toMatchObject({ code: "INVALID_ADDRESS" });
    }
  });

  it("rejects missing validator", () => {
    try {
      assertDelegate({
        type: "Delegate",
        chain,
        amount: 1_000_000_000n,
        isMaxAmount: false,
        account: AUTHORITY,
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect(err).toMatchObject({ code: "INVALID_VALIDATOR" });
    }
  });
});

describe("assertStakeAccount", () => {
  it("accepts a valid base58 stake account on Undelegate", () => {
    const tx: SolanaUndelegateTransaction = {
      type: "Undelegate",
      chain,
      amount: 0n,
      isMaxAmount: false,
      stakeAccount: STAKE,
    };
    expect(() => assertStakeAccount(tx)).not.toThrow();
  });

  it("accepts a valid base58 stake account on ClaimDelegate", () => {
    const tx: SolanaClaimDelegateTransaction = {
      type: "ClaimDelegate",
      chain,
      amount: 0n,
      stakeAccount: STAKE,
    };
    expect(() => assertStakeAccount(tx)).not.toThrow();
  });

  it("rejects missing stakeAccount", () => {
    try {
      assertStakeAccount({
        type: "Undelegate",
        chain,
        amount: 0n,
        isMaxAmount: false,
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect(err).toMatchObject({ code: "INVALID_ADDRESS" });
    }
  });

  it("rejects empty stakeAccount", () => {
    try {
      assertStakeAccount({
        type: "ClaimDelegate",
        chain,
        amount: 0n,
        stakeAccount: "  ",
      } as SolanaClaimDelegateTransaction);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect(err).toMatchObject({ code: "INVALID_ADDRESS" });
    }
  });

  it("rejects invalid base58 stakeAccount", () => {
    try {
      assertStakeAccount({
        type: "Undelegate",
        chain,
        amount: 0n,
        isMaxAmount: false,
        stakeAccount: "not-a-valid-address!!!",
      } as SolanaUndelegateTransaction);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect(err).toMatchObject({ code: "INVALID_ADDRESS" });
    }
  });
});

describe("assertSupportedTransactionType", () => {
  it.each(["Redelegate", "ClaimRewards", "Vote"] as const)(
    "rejects %s with UNSUPPORTED_TRANSACTION_TYPE",
    (type) => {
      try {
        assertSupportedTransactionType({
          type,
          chain,
          amount: 0n,
          ...(type === "Redelegate"
            ? { isMaxAmount: false, fromValidator: VOTE, toValidator: VOTE }
            : type === "Vote"
              ? { validator: VOTE }
              : {}),
        } as never);
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(SigningError);
        expect(err).toMatchObject({ code: "UNSUPPORTED_TRANSACTION_TYPE" });
      }
    }
  );

  it.each(["Delegate", "Undelegate", "ClaimDelegate"] as const)("allows %s", (type) => {
    expect(() =>
      assertSupportedTransactionType({
        type,
        chain,
        amount: 1n,
        ...(type === "Delegate" || type === "Undelegate" ? { isMaxAmount: false } : {}),
      } as never)
    ).not.toThrow();
  });
});

describe("assertAuthorityAddress", () => {
  it("accepts a valid address", () => {
    expect(() => assertAuthorityAddress(AUTHORITY)).not.toThrow();
  });

  it("rejects empty / invalid", () => {
    expect(() => assertAuthorityAddress("")).toThrow(ValidationError);
    expect(() => assertAuthorityAddress("bad")).toThrow(ValidationError);
  });
});
