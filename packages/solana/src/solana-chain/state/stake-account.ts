import { getStakeStateAccountDecoder, type StakeStateV2 } from "@solana-program/stake";
import { U64_MAX } from "./constants";
import { deriveStatus, type StakeActivation, type StakePositionStatus } from "./activation";

export type { StakePositionStatus };

/**
 * Fully resolved stake position for an authority (seed-scan / GPA discovery output).
 */
export interface StakePosition {
  stakeAccount: string;
  seedIndex: number | undefined;
  staker: string;
  withdrawer: string;
  voter: string | undefined;
  lamports: bigint;
  rentExemptReserve: bigint;
  delegatedStake: bigint;
  activationEpoch: bigint;
  deactivationEpoch: bigint;
  creditsObserved: bigint;
  effective: bigint;
  activating: bigint;
  deactivating: bigint;
  status: StakePositionStatus;
}

/** Decoded stake account data without activation or account meta. */
export interface StakeAccountView {
  kind: StakeStateV2["__kind"];
  staker: string | undefined;
  withdrawer: string | undefined;
  voter: string | undefined;
  rentExemptReserve: bigint;
  delegatedStake: bigint;
  activationEpoch: bigint;
  deactivationEpoch: bigint;
  creditsObserved: bigint;
}

const decoder = getStakeStateAccountDecoder();

/**
 * Decode stake account data via `@solana-program/stake` codecs.
 * Returns `null` if the buffer cannot be decoded as a StakeStateV2 account.
 */
export function decodeStakeAccount(data: Uint8Array): StakeAccountView | null {
  if (data.length === 0) {
    return null;
  }

  try {
    const { state } = decoder.decode(data);
    return mapState(state);
  } catch {
    return null;
  }
}

function mapState(state: StakeStateV2): StakeAccountView {
  switch (state.__kind) {
    case "Uninitialized":
    case "RewardsPool":
      return {
        kind: state.__kind,
        staker: undefined,
        withdrawer: undefined,
        voter: undefined,
        rentExemptReserve: 0n,
        delegatedStake: 0n,
        activationEpoch: 0n,
        deactivationEpoch: U64_MAX,
        creditsObserved: 0n,
      };
    case "Initialized": {
      const [meta] = state.fields;
      return {
        kind: "Initialized",
        staker: meta.authorized.staker,
        withdrawer: meta.authorized.withdrawer,
        voter: undefined,
        rentExemptReserve: meta.rentExemptReserve,
        delegatedStake: 0n,
        activationEpoch: 0n,
        deactivationEpoch: U64_MAX,
        creditsObserved: 0n,
      };
    }
    case "Stake": {
      const [meta, stake] = state.fields;
      return {
        kind: "Stake",
        staker: meta.authorized.staker,
        withdrawer: meta.authorized.withdrawer,
        voter: stake.delegation.voterPubkey,
        rentExemptReserve: meta.rentExemptReserve,
        delegatedStake: stake.delegation.stake,
        activationEpoch: stake.delegation.activationEpoch,
        deactivationEpoch: stake.delegation.deactivationEpoch,
        creditsObserved: stake.creditsObserved,
      };
    }
  }
}

/**
 * Combine a decoded account, lamports/address meta, and activation into a {@link StakePosition}.
 */
export function toStakePosition(args: {
  stakeAccount: string;
  seedIndex?: number;
  lamports: bigint;
  view: StakeAccountView;
  activation?: StakeActivation;
}): StakePosition {
  const activation =
    args.activation ??
    ({
      effective: 0n,
      activating: 0n,
      deactivating: 0n,
      status: "inactive" as const,
    } satisfies StakeActivation);

  // Initialized / non-delegated accounts are inactive regardless of activation input.
  const status =
    args.view.kind === "Stake"
      ? activation.status
      : deriveStatus({
          effective: 0n,
          activating: 0n,
          deactivating: 0n,
        });

  return {
    stakeAccount: args.stakeAccount,
    seedIndex: args.seedIndex,
    staker: args.view.staker ?? "",
    withdrawer: args.view.withdrawer ?? "",
    voter: args.view.voter,
    lamports: args.lamports,
    rentExemptReserve: args.view.rentExemptReserve,
    delegatedStake: args.view.delegatedStake,
    activationEpoch: args.view.activationEpoch,
    deactivationEpoch: args.view.deactivationEpoch,
    creditsObserved: args.view.creditsObserved,
    effective: args.view.kind === "Stake" ? activation.effective : 0n,
    activating: args.view.kind === "Stake" ? activation.activating : 0n,
    deactivating: args.view.kind === "Stake" ? activation.deactivating : 0n,
    status,
  };
}
