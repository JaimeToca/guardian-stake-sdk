import type { Fee, Transaction } from "@guardian-sdk/sdk";
import { ValidationError } from "@guardian-sdk/sdk";
import type { TronRpcClientContract } from "../rpc/tron-rpc-client-contract";
import type { TronWitness } from "../rpc/tron-rpc-types";
import type { TronUndelegateTransaction } from "../tx/tron-types";
import type { TronStakingServiceContract } from "./staking-service-contract";
import { assertFreeze, assertUnfreeze, assertVote } from "../validations";

function requireAccount(tx: Transaction): string {
  if (!tx.account)
    throw new ValidationError(
      "INVALID_ADDRESS",
      "account is required to estimate/validate a Tron staking transaction"
    );
  return tx.account;
}

/**
 * Tron staking ops consume bandwidth (∝ tx size); energy ≈ 0. When free/available bandwidth
 * doesn't cover it, the shortfall is burned as TRX. This returns a conservative ResourceFee;
 * pure staking ops are typically free when the account holds staked bandwidth.
 */
export function createFeeService(rpc: TronRpcClientContract, staking: TronStakingServiceContract) {
  const APPROX_STAKING_TX_BANDWIDTH = 300n; // bytes; freeze/vote/withdraw are small, fixed-shape txs
  return {
    async estimateFee(tx: Transaction): Promise<Fee> {
      const params = await rpc.getChainParameters();
      const bandwidthPrice = BigInt(params.getTransactionFee ?? 1000); // SUN per bandwidth point

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

      return {
        type: "ResourceFee",
        bandwidth: APPROX_STAKING_TX_BANDWIDTH,
        energy: 0n,
        total: APPROX_STAKING_TX_BANDWIDTH * bandwidthPrice, // worst-case TRX burn if no free bandwidth
      };
    },
  };
}
