import type { Logger, SolanaFee, Transaction } from "@guardian-sdk/sdk";
import { NoopLogger, ValidationError } from "@guardian-sdk/sdk";
import type { SolanaRpcClientContract } from "../rpc/solana-rpc-client-contract";
import { buildUnsignedTx } from "../tx/tx-builder";
import { assertSupportedTransactionType } from "../tx/validations";

/** Static CU budgets per op class (simulation optional; unit tests mock getFeeForMessage). */
const STATIC_COMPUTE_UNITS: Record<"Delegate" | "Undelegate" | "ClaimDelegate", bigint> = {
  Delegate: 200_000n,
  Undelegate: 50_000n,
  ClaimDelegate: 50_000n,
};

/** Microlamports per compute unit → lamports scale. */
const MICRO_LAMPORTS_PER_LAMPORT = 1_000_000n;

export interface SolanaFeeServiceConfig {
  defaultComputeUnitPrice?: bigint;
  seedScanMax?: number;
}

export interface SolanaFeeService {
  estimateFee(tx: Transaction): Promise<SolanaFee>;
}

function requireAccount(tx: Transaction): string {
  if (!tx.account || tx.account.trim() === "") {
    throw new ValidationError(
      "INVALID_ADDRESS",
      "transaction.account is required to estimate a Solana fee (fee payer)."
    );
  }
  return tx.account;
}

function staticComputeUnits(type: Transaction["type"]): bigint {
  switch (type) {
    case "Delegate":
    case "Undelegate":
    case "ClaimDelegate":
      return STATIC_COMPUTE_UNITS[type];
    default:
      throw new ValidationError(
        "UNSUPPORTED_OPERATION",
        `Solana fee estimation does not support transaction type "${type}".`
      );
  }
}

/**
 * Priority fee in lamports: `floor(computeUnits * computeUnitPrice / 1e6)`.
 * `computeUnitPrice` is microlamports per compute unit.
 */
export function priorityFeeLamports(computeUnits: bigint, computeUnitPrice: bigint): bigint {
  if (computeUnits <= 0n || computeUnitPrice <= 0n) {
    return 0n;
  }
  return (computeUnits * computeUnitPrice) / MICRO_LAMPORTS_PER_LAMPORT;
}

/**
 * Builds the same message as sign (static CU budget + config priority price), then:
 * `total = getFeeForMessage` alone.
 *
 * When the message already includes SetComputeUnitLimit/Price, getFeeForMessage
 * returns signature fee + prioritization fee — do NOT add priority again.
 * `computeUnits` / `computeUnitPrice` are still returned for the SolanaFee shape.
 */
export function createFeeService(
  rpc: SolanaRpcClientContract,
  config: SolanaFeeServiceConfig = {},
  logger: Logger = new NoopLogger()
): SolanaFeeService {
  return {
    async estimateFee(tx: Transaction): Promise<SolanaFee> {
      logger.debug("FeeService: estimating fee", { type: tx.type });
      assertSupportedTransactionType(tx);
      const authorityAddress = requireAccount(tx);

      const computeUnits = staticComputeUnits(tx.type);
      const computeUnitPrice = config.defaultComputeUnitPrice ?? 0n;

      // Placeholder total; real total computed after getFeeForMessage.
      const draftFee: SolanaFee = {
        type: "SolanaFee",
        computeUnits,
        computeUnitPrice,
        total: 0n,
      };

      const built = await buildUnsignedTx(
        {
          rpc,
          authorityAddress,
          config: {
            seedScanMax: config.seedScanMax,
            defaultComputeUnitPrice: computeUnitPrice,
          },
          computeUnitPrice,
        },
        tx,
        draftFee
      );

      const messageBase64 = Buffer.from(built.messageBytes).toString("base64");
      const feeFromRpc = await rpc.getFeeForMessage(messageBase64);
      if (feeFromRpc === null) {
        throw new ValidationError(
          "INVALID_FEE",
          "getFeeForMessage returned null for the built staking message."
        );
      }

      // getFeeForMessage already includes prioritization when CU price ixs are present.
      const total = feeFromRpc;

      logger.debug("FeeService: fee estimated", {
        type: tx.type,
        feeFromRpc: feeFromRpc.toString(),
        computeUnits: computeUnits.toString(),
        computeUnitPrice: computeUnitPrice.toString(),
        total: total.toString(),
      });

      return {
        type: "SolanaFee",
        computeUnits,
        computeUnitPrice,
        total,
      };
    },
  };
}
