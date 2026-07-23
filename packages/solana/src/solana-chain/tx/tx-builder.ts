import type {
  DelegateTransaction,
  OperatorAddress,
  SolanaFee,
  Transaction,
  Validator,
} from "@guardian-sdk/sdk";
import { SigningError, ValidationError } from "@guardian-sdk/sdk";
import {
  address,
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageComputeUnitLimit,
  setTransactionMessageComputeUnitPrice,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import {
  getDeactivateInstruction,
  getDelegateStakeInstruction,
  getInitializeCheckedInstruction,
  getWithdrawInstruction,
} from "@solana-program/stake";
import { getCreateAccountWithSeedInstruction } from "@solana-program/system";
import type { SolanaRpcClientContract } from "../rpc/solana-rpc-client-contract";
import {
  DEFAULT_SEED_SCAN_MAX,
  STAKE_ACCOUNT_SPACE,
  STAKE_CONFIG_ADDRESS,
  STAKE_PROGRAM_ADDRESS,
  U64_MAX,
} from "../state/constants";
import { decodeStakeAccount, isLockupInForce } from "../state/stake-account";
import { deriveStakeAddress, seedString } from "../state/seed";
import type { SolanaAccountInfo } from "../rpc/solana-rpc-types";
import type {
  BuildTxDeps,
  BuildTxResult,
  SolanaClaimDelegateTransaction,
  SolanaUndelegateTransaction,
} from "./solana-types";
import {
  assertAuthorityAddress,
  assertDelegate,
  assertStakeAccount,
  assertSupportedTransactionType,
} from "./validations";

/** Small base-fee cushion for Delegate funding preflight (lamports). */
const DELEGATE_FEE_CUSHION_LAMPORTS = 10_000n;

const voteAddressOf = (v: Validator | OperatorAddress): string =>
  typeof v === "string" ? v : v.operatorAddress;

/**
 * Find the lowest seed index whose derived stake address has no on-chain account.
 */
export async function findNextFreeSeed(
  rpc: SolanaRpcClientContract,
  authorityAddress: string,
  seedScanMax: number = DEFAULT_SEED_SCAN_MAX
): Promise<{ index: number; seed: string; stakeAddress: string }> {
  if (!Number.isInteger(seedScanMax) || seedScanMax < 0) {
    throw new ValidationError("INVALID_AMOUNT", "seedScanMax must be a non-negative integer.");
  }

  const addresses: string[] = [];
  for (let i = 0; i <= seedScanMax; i++) {
    addresses.push(await deriveStakeAddress(authorityAddress, seedString(i)));
  }

  const accounts = await rpc.getMultipleAccounts(addresses);
  for (let i = 0; i < accounts.length; i++) {
    if (accounts[i] === null) {
      return {
        index: i,
        seed: seedString(i),
        stakeAddress: addresses[i]!,
      };
    }
  }

  throw new ValidationError(
    "UNSUPPORTED_OPERATION",
    `No free stake seed found within 0..${seedScanMax}. Increase seedScanMax or close unused stake accounts.`
  );
}

function assertSolanaFee(fee: SolanaFee | { type: string }): asserts fee is SolanaFee {
  if (fee.type !== "SolanaFee") {
    throw new SigningError(
      "INVALID_FEE_TYPE",
      `Solana buildUnsignedTx requires a SolanaFee, got "${fee.type}".`
    );
  }
}

function buildMessage(args: {
  authority: Address;
  recentBlockhash: string;
  lastValidBlockHeight: bigint;
  instructions: Instruction[];
  computeUnits: bigint;
  computeUnitPrice: bigint;
}): BuildTxResult {
  const {
    authority,
    recentBlockhash,
    lastValidBlockHeight,
    instructions,
    computeUnits,
    computeUnitPrice,
  } = args;

  const lifetime = {
    blockhash: blockhash(recentBlockhash),
    lastValidBlockHeight,
  };

  let cuLimit: number | undefined;
  if (computeUnits > 0n) {
    const cu = Number(computeUnits);
    if (!Number.isSafeInteger(cu) || cu <= 0) {
      throw new ValidationError(
        "INVALID_FEE",
        "SolanaFee.computeUnits must fit a positive safe integer."
      );
    }
    cuLimit = cu;
  }

  // Kit brands size/limit generics on each setter; keep the chain in a single pipe.
  const compiled = compileTransaction(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayer(authority, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
      (m) => (cuLimit !== undefined ? setTransactionMessageComputeUnitLimit(cuLimit, m) : m),
      (m) =>
        computeUnitPrice > 0n ? setTransactionMessageComputeUnitPrice(computeUnitPrice, m) : m,
      (m) => appendTransactionMessageInstructions(instructions, m)
    )
  );

  return {
    messageBytes: new Uint8Array(compiled.messageBytes),
    wireTransactionBase64: getBase64EncodedWireTransaction(compiled),
    feePayer: authority,
    recentBlockhash,
  };
}

async function buildDelegate(
  deps: BuildTxDeps,
  tx: DelegateTransaction,
  fee: SolanaFee
): Promise<BuildTxResult> {
  assertDelegate(tx);
  assertAuthorityAddress(deps.authorityAddress);

  const authorityStr = deps.authorityAddress;
  if (tx.account && tx.account !== authorityStr) {
    throw new ValidationError(
      "INVALID_ADDRESS",
      "transaction.account must match the fee-payer authority for Solana staking."
    );
  }

  const authority = address(authorityStr);
  const signer: TransactionSigner = createNoopSigner(authority);
  const vote = address(voteAddressOf(tx.validator!));

  const [minDelegation, rentExempt, latest, balance] = await Promise.all([
    deps.rpc.getStakeMinimumDelegation(),
    deps.rpc.getMinimumBalanceForRentExemption(STAKE_ACCOUNT_SPACE),
    deps.rpc.getLatestBlockhash(),
    deps.rpc.getBalance(authorityStr),
  ]);

  if (tx.amount < minDelegation) {
    throw new ValidationError(
      "INVALID_AMOUNT",
      `Delegate amount ${tx.amount} is below stake minimum delegation ${minDelegation}.`
    );
  }

  const seedScanMax = deps.config?.seedScanMax ?? DEFAULT_SEED_SCAN_MAX;
  const { seed, stakeAddress } = await findNextFreeSeed(deps.rpc, authorityStr, seedScanMax);
  const stake = address(stakeAddress);
  const lamports = tx.amount + rentExempt;

  const feeCushion = fee.total > 0n ? fee.total : DELEGATE_FEE_CUSHION_LAMPORTS;
  const required = lamports + feeCushion;
  if (balance < required) {
    throw new ValidationError(
      "INVALID_AMOUNT",
      `Insufficient balance to fund stake: need ~${required} lamports (amount + rent + fee cushion), have ${balance}.`
    );
  }

  const createIx = getCreateAccountWithSeedInstruction({
    payer: signer,
    newAccount: stake,
    base: authority,
    seed,
    amount: lamports,
    space: BigInt(STAKE_ACCOUNT_SPACE),
    programAddress: STAKE_PROGRAM_ADDRESS,
  });

  const initIx = getInitializeCheckedInstruction({
    stake,
    stakeAuthority: authority,
    withdrawAuthority: signer,
  });

  const delegateIx = getDelegateStakeInstruction({
    stake,
    vote,
    unused: STAKE_CONFIG_ADDRESS,
    stakeAuthority: signer,
  });

  const computeUnitPrice =
    deps.computeUnitPrice ?? fee.computeUnitPrice ?? deps.config?.defaultComputeUnitPrice ?? 0n;

  return buildMessage({
    authority,
    recentBlockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    instructions: [createIx, initIx, delegateIx],
    computeUnits: fee.computeUnits,
    computeUnitPrice,
  });
}

/**
 * State gates for Undelegate / ClaimDelegate:
 * - account exists and is owned by the stake program
 * - decoded staker/withdrawer matches the signing authority when decode succeeds
 * - Undelegate: reject if not delegated Stake, or already deactivating/inactive
 * - Claim: reject never-deactivated Stake (deactivationEpoch === U64_MAX); residual cooldown
 *   history walk is out of scope for v1 — residual cooldown is enforced on-chain
 * - Claim: reject when Meta.lockup is in force (no custodian co-sign in v1)
 */
async function loadAndAssertStakeAccount(
  rpc: SolanaRpcClientContract,
  stakeAccount: string,
  authorityAddress: string,
  role: "staker" | "withdrawer",
  opts: {
    rejectActiveStake?: boolean;
    rejectLockup?: boolean;
    /** Reject accounts that are not an active (never-deactivated) Stake delegation. */
    rejectNotDelegatedActive?: boolean;
  } = {}
): Promise<SolanaAccountInfo> {
  const accounts = await rpc.getMultipleAccounts([stakeAccount]);
  const account = accounts[0];
  if (!account) {
    throw new ValidationError("INVALID_ADDRESS", `Stake account not found: "${stakeAccount}".`);
  }
  if (account.owner !== STAKE_PROGRAM_ADDRESS) {
    throw new ValidationError(
      "INVALID_ADDRESS",
      `Account "${stakeAccount}" is not owned by the stake program (owner=${account.owner}).`
    );
  }

  const view = decodeStakeAccount(account.data);
  if (view) {
    const expected = role === "staker" ? view.staker : view.withdrawer;
    if (expected !== undefined && expected !== authorityAddress) {
      throw new ValidationError(
        "INVALID_ADDRESS",
        `Authority does not match stake account ${role} (expected ${expected}, got ${authorityAddress}).`
      );
    }
    if (opts.rejectActiveStake && view.kind === "Stake" && view.deactivationEpoch === U64_MAX) {
      throw new ValidationError(
        "UNSUPPORTED_OPERATION",
        `Stake account "${stakeAccount}" is still active (never deactivated). Undelegate and wait for cooldown before ClaimDelegate.`
      );
    }
    if (opts.rejectNotDelegatedActive) {
      if (view.kind !== "Stake") {
        throw new ValidationError(
          "UNSUPPORTED_OPERATION",
          `Stake account "${stakeAccount}" is not a delegated Stake state (${view.kind}); nothing to deactivate.`
        );
      }
      if (view.deactivationEpoch !== U64_MAX) {
        throw new ValidationError(
          "UNSUPPORTED_OPERATION",
          `Stake account "${stakeAccount}" is already deactivating or inactive (deactivationEpoch=${view.deactivationEpoch}); Deactivate is a no-op / rejected.`
        );
      }
    }
    if (opts.rejectLockup && view.lockup) {
      const clock = await rpc.getClock();
      if (isLockupInForce(view.lockup, clock)) {
        throw new ValidationError(
          "UNSUPPORTED_OPERATION",
          `Stake account "${stakeAccount}" has lockup in force until unixTimestamp=${view.lockup.unixTimestamp} / epoch=${view.lockup.epoch}. Custodian co-sign is not supported in v1.`
        );
      }
    }
  }

  return account;
}

async function buildUndelegate(
  deps: BuildTxDeps,
  tx: SolanaUndelegateTransaction,
  fee: SolanaFee
): Promise<BuildTxResult> {
  assertStakeAccount(tx);
  assertAuthorityAddress(deps.authorityAddress);

  const authority = address(deps.authorityAddress);
  const signer = createNoopSigner(authority);
  const stake = address(tx.stakeAccount);

  const [, latest] = await Promise.all([
    loadAndAssertStakeAccount(deps.rpc, tx.stakeAccount, deps.authorityAddress, "staker", {
      rejectNotDelegatedActive: true,
    }),
    deps.rpc.getLatestBlockhash(),
  ]);

  const deactivateIx = getDeactivateInstruction({
    stake,
    stakeAuthority: signer,
  });

  const computeUnitPrice =
    deps.computeUnitPrice ?? fee.computeUnitPrice ?? deps.config?.defaultComputeUnitPrice ?? 0n;

  return buildMessage({
    authority,
    recentBlockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    instructions: [deactivateIx],
    computeUnits: fee.computeUnits,
    computeUnitPrice,
  });
}

async function buildClaimDelegate(
  deps: BuildTxDeps,
  tx: SolanaClaimDelegateTransaction,
  fee: SolanaFee
): Promise<BuildTxResult> {
  assertStakeAccount(tx);
  assertAuthorityAddress(deps.authorityAddress);

  const authority = address(deps.authorityAddress);
  const signer = createNoopSigner(authority);
  const stake = address(tx.stakeAccount);

  const [account, latest] = await Promise.all([
    loadAndAssertStakeAccount(deps.rpc, tx.stakeAccount, deps.authorityAddress, "withdrawer", {
      rejectActiveStake: true,
      rejectLockup: true,
    }),
    deps.rpc.getLatestBlockhash(),
  ]);

  if (account.lamports <= 0n) {
    throw new ValidationError(
      "INVALID_AMOUNT",
      `Stake account "${tx.stakeAccount}" has no lamports to withdraw.`
    );
  }

  const withdrawIx = getWithdrawInstruction({
    stake,
    recipient: authority,
    withdrawAuthority: signer,
    args: account.lamports,
  });

  const computeUnitPrice =
    deps.computeUnitPrice ?? fee.computeUnitPrice ?? deps.config?.defaultComputeUnitPrice ?? 0n;

  return buildMessage({
    authority,
    recentBlockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    instructions: [withdrawIx],
    computeUnits: fee.computeUnits,
    computeUnitPrice,
  });
}

/**
 * Build an unsigned Solana staking transaction message for the given SDK Transaction.
 *
 * - **Delegate:** next free seed → CreateAccountWithSeed + InitializeChecked + DelegateStake
 * - **Undelegate:** Deactivate on `stakeAccount`
 * - **ClaimDelegate:** Withdraw full lamports from `stakeAccount` to authority
 */
export async function buildUnsignedTx(
  deps: BuildTxDeps,
  tx: Transaction,
  fee: SolanaFee
): Promise<BuildTxResult> {
  assertSolanaFee(fee);
  assertSupportedTransactionType(tx);

  switch (tx.type) {
    case "Delegate":
      return buildDelegate(deps, tx, fee);
    case "Undelegate":
      return buildUndelegate(deps, tx as SolanaUndelegateTransaction, fee);
    case "ClaimDelegate":
      return buildClaimDelegate(deps, tx as SolanaClaimDelegateTransaction, fee);
    default:
      throw new SigningError(
        "UNSUPPORTED_TRANSACTION_TYPE",
        `Solana does not support transaction type "${(tx as Transaction).type}".`
      );
  }
}
