import type { Fee, Logger, Transaction } from "@guardian-sdk/sdk";
import { NoopLogger, ValidationError } from "@guardian-sdk/sdk";
import type { TronRpcClientContract } from "../rpc/tron-rpc-client-contract";
import type { TronWitness } from "../rpc/tron-rpc-types";
import type { TronUndelegateTransaction } from "../tx/tron-types";
import type { TronStakingServiceContract } from "./staking-service-contract";
import { assertFreeze, assertResource, assertUnfreeze, assertVote } from "../validations";

function requireAccount(tx: Transaction): string {
  if (!tx.account)
    throw new ValidationError(
      "INVALID_ADDRESS",
      "account is required to estimate/validate a Tron staking transaction"
    );
  return tx.account;
}

/**
 * Tron staking ops consume bandwidth (∝ tx size); energy ≈ 0. When the account's free +
 * staked bandwidth covers the estimated tx size, the op is genuinely free (total: 0n).
 * Otherwise the shortfall is burned as TRX.
 */
export function createFeeService(
  rpc: TronRpcClientContract,
  staking: TronStakingServiceContract,
  logger: Logger = new NoopLogger()
) {
  const ESTIMATED_TX_BANDWIDTH = 350n; // bandwidth points ≈ bytes for a signed staking tx

  return {
    async estimateFee(tx: Transaction): Promise<Fee> {
      logger.debug("FeeService: estimating fee", { type: tx.type });
      const params = await rpc.getChainParameters();
      const bandwidthPrice = BigInt(Math.max(1, params.getTransactionFee ?? 1000)); // SUN per bandwidth point

      switch (tx.type) {
        case "Delegate": {
          const address = requireAccount(tx);
          const account = await rpc.getAccount(address);
          assertFreeze(account.balance, tx.amount);
          break;
        }
        case "Undelegate": {
          const address = requireAccount(tx);
          const account = await rpc.getAccount(address);
          const { resource } = tx as TronUndelegateTransaction;
          assertResource(resource);
          assertUnfreeze(account, resource, tx.amount);
          break;
        }
        case "Vote": {
          const address = requireAccount(tx);
          const account = await rpc.getAccount(address);
          const witnessMap = await staking.getWitnessMap();
          const srAddress =
            typeof tx.validator === "string" ? tx.validator : tx.validator.operatorAddress;
          const witnesses: TronWitness[] = Array.from(witnessMap.values()).map((v) => ({
            address: v.operatorAddress,
            voteCount: 0n,
            url: v.name,
            isSr: v.status === "Active",
          }));
          assertVote(account, witnesses, srAddress, tx.amount);
          break;
        }
        case "ClaimDelegate":
        case "ClaimRewards":
          break;
        default:
          break;
      }

      let total: bigint;
      if (tx.account) {
        const res = await rpc.getAccountResources(tx.account);
        const available = res.freeBandwidth + res.stakedBandwidth;
        total =
          available >= ESTIMATED_TX_BANDWIDTH
            ? 0n
            : (ESTIMATED_TX_BANDWIDTH - available) * bandwidthPrice;
      } else {
        // No account to check resources against (e.g. ClaimDelegate/ClaimRewards) — conservative full burn.
        total = ESTIMATED_TX_BANDWIDTH * bandwidthPrice;
      }

      logger.debug("FeeService: fee estimated", { total: total.toString() });
      return {
        type: "ResourceFee",
        bandwidth: ESTIMATED_TX_BANDWIDTH,
        energy: 0n,
        total,
      };
    },
  };
}
