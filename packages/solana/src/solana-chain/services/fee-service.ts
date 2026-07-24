import type { Logger, SolanaFee, Transaction } from "@guardian-sdk/sdk";
import { NoopLogger, ValidationError } from "@guardian-sdk/sdk";
import { getBase64Decoder } from "@solana/kit";
import type { SolanaRpcClientContract } from "../rpc/solana-rpc-client-contract";
import { buildUnsignedTx } from "../tx/tx-builder";
import { assertSupportedTransactionType } from "../tx/validations";
import { DEFAULT_COMPUTE_UNIT_PRICE } from "../state/constants";

/** Kit: bytes → base64 string. */
const base64Decoder = getBase64Decoder();

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
 * `total = getFeeForMessage + priorityFeeLamports`.
 *
 * `getFeeForMessage` returns only the base signature fee — it does NOT include the
 * prioritization fee even when the message carries SetComputeUnitLimit/Price. So the
 * priority fee is added explicitly; with `computeUnitPrice == 0` it contributes 0.
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
      const computeUnitPrice = config.defaultComputeUnitPrice ?? DEFAULT_COMPUTE_UNIT_PRICE;

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
          // Quote a fee even for an unfunded wallet — fee size is independent of balance.
          skipBalanceCheck: true,
        },
        tx,
        draftFee
      );

      const messageBase64 = base64Decoder.decode(built.messageBytes);
      const feeFromRpc = await rpc.getFeeForMessage(messageBase64);
      if (feeFromRpc === null) {
        throw new ValidationError(
          "INVALID_FEE",
          "getFeeForMessage returned null for the built staking message."
        );
      }

      // getFeeForMessage returns the base fee only; add the prioritization fee explicitly.
      const priorityFee = priorityFeeLamports(computeUnits, computeUnitPrice);
      const total = feeFromRpc + priorityFee;

      logger.debug("FeeService: fee estimated", {
        type: tx.type,
        feeFromRpc: feeFromRpc.toString(),
        priorityFee: priorityFee.toString(),
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
