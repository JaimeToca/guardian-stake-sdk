import type { Address } from "viem";
import { parseEther } from "viem";
import type { CacheContract, Logger } from "@guardian-sdk/sdk";
import { NoopLogger } from "@guardian-sdk/sdk";
import type { BNBChainValidator, BNBRpcClientContract, StakingRpcClientContract } from "../rpc";
import { processSingleMulticallResult } from "../abi";
import type {
  Delegation,
  Delegations,
  GetValidatorsParams,
  StakingServiceContract,
  Validator,
  ValidatorStatus,
  ValidatorsPage,
} from "@guardian-sdk/sdk";
import { validatePageParams } from "@guardian-sdk/sdk";
import { parseEvmAddress } from "../validations";

const UNBOUND_PERIOD = 604800000; // 7 days in millis
const REDELEGATION_FEE = 0.002;
const MIN_AMOUNT_TO_STAKE = parseEther("1.0");
const VALIDATOR_ALL_CACHE_KEY = "bsc-validators-all";
const DEFAULT_PAGE_SIZE = 100;
const BASE_VALIDATOR_IMAGE_URL =
  "https://raw.githubusercontent.com/bnb-chain/bsc-validator-directory/main/mainnet/validators/";

/**
 * Sanity bound for the RPC-reported pending-unbond count (M-BSC-2).
 *
 * `getPendingUnbondDelegation` returns a count that directly sizes an
 * `Array.from({ length: count })` fan-out of per-index RPC calls
 * (`getUnbondRequestData`). BSC's staking contract itself caps concurrent
 * unbond requests per delegator at 7 (`maxElements` in StakeCredit) — 64 is a
 * generous ceiling above that real protocol limit, bounding the fan-out
 * against a hostile/buggy RPC without ever clamping a real wallet's count.
 */
const MAX_PENDING_UNBOND_COUNT = 64;

/**
 * Plausibility bound for `unlockTime` (unix seconds) before the `* 1000n`
 * conversion to millis (M-BSC-2). Guards against a malformed value (e.g.
 * already in millis, or some other unit) that would otherwise silently
 * overflow `Number.MAX_SAFE_INTEGER` when narrowed to a `number` for
 * `pendingUntil`. Bounded to year 2286 (10 digits of unix seconds) —
 * comfortably beyond any real unbond unlock time.
 */
const MAX_PLAUSIBLE_UNLOCK_TIME_SECONDS = 9_999_999_999n;

function clampPendingUnbondCount(rawCount: bigint, logger: Logger): number {
  const count = Number(rawCount);
  if (!Number.isSafeInteger(count) || count <= 0) return 0;
  if (count > MAX_PENDING_UNBOND_COUNT) {
    logger.warn("StakingService: pending-unbond count exceeds sanity bound — clamping", {
      reported: rawCount.toString(),
      clampedTo: MAX_PENDING_UNBOND_COUNT,
    });
    return MAX_PENDING_UNBOND_COUNT;
  }
  return count;
}

function safeUnlockTimeMillis(unlockTime: bigint, logger: Logger): number {
  if (unlockTime < 0n || unlockTime > MAX_PLAUSIBLE_UNLOCK_TIME_SECONDS) {
    logger.warn("StakingService: implausible unlockTime from RPC — treating as already unlocked", {
      unlockTime: unlockTime.toString(),
    });
    return 0;
  }
  return Number(unlockTime * 1000n);
}

function getValidatorStatus(v: BNBChainValidator): ValidatorStatus {
  if (v.status === "INACTIVE") return "Inactive";
  if (v.status === "JAILED") return "Jailed";
  return "Active";
}

function getValidatorImage(address: Address): string {
  return `${BASE_VALIDATOR_IMAGE_URL}${address}/logo.png`;
}

function validatorPageCacheKey(page: number, pageSize: number): string {
  return `bsc-validators-${page}-${pageSize}`;
}

function mapValidators(
  bnbValidators: BNBChainValidator[],
  contractValidators: Map<Address, Address>,
  logger: Logger
): Validator[] {
  return bnbValidators.flatMap((bnbValidator) => {
    const operatorAddress = parseEvmAddress(bnbValidator.operatorAddress);
    const creditAddress = contractValidators.get(operatorAddress);
    if (!creditAddress) {
      logger.warn("StakingService: validator has no credit address — skipping", {
        moniker: bnbValidator.moniker,
        operatorAddress,
      });
      return [];
    }
    return [
      {
        id: operatorAddress,
        status: getValidatorStatus(bnbValidator),
        name: bnbValidator.moniker,
        description: bnbValidator.miningStatus,
        image: getValidatorImage(operatorAddress),
        apy: (bnbValidator.apy ?? 0) * 100,
        delegators: bnbValidator.delegatorCount,
        operatorAddress,
        creditAddress: parseEvmAddress(creditAddress),
      },
    ];
  });
}

export function createStakingService(
  allValidatorsCache: CacheContract<string, Validator[]>,
  pageCache: CacheContract<string, ValidatorsPage>,
  stakingRpcClient: StakingRpcClientContract,
  bnbRpcClient: BNBRpcClientContract,
  logger: Logger = new NoopLogger()
): StakingServiceContract {
  // BSC has ~50–60 validators — fetching all in one shot is intentional and cheap.
  async function fetchAllValidators(): Promise<Validator[]> {
    const cached = allValidatorsCache.get(VALIDATOR_ALL_CACHE_KEY);
    if (cached) {
      logger.debug("StakingService: all-validators cache hit", { count: cached.length });
      return cached;
    }

    logger.debug("StakingService: all-validators cache miss — fetching from RPC");
    const [{ validators: bnbValidators }, contractValidators] = await Promise.all([
      bnbRpcClient.getValidators({ page: 1, pageSize: 100 }), // intentionally large page size to get all validators in one request
      stakingRpcClient.getCreditContractValidators(),
    ]);

    const validators = mapValidators(bnbValidators, contractValidators, logger);
    allValidatorsCache.set(VALIDATOR_ALL_CACHE_KEY, validators);
    logger.debug("StakingService: all-validators cached", { count: validators.length });
    return validators;
  }

  async function getActiveDelegations(
    address: Address,
    validators: Validator[]
  ): Promise<Delegation[]> {
    const creditContracts = validators.map((v) => parseEvmAddress(v.creditAddress));
    const pooledBNBData = await stakingRpcClient.getPooledBNBData(creditContracts, address);

    return pooledBNBData.flatMap((data, index) => {
      const stakedAmount = processSingleMulticallResult(data);
      if (stakedAmount === undefined) return [];
      return [
        {
          id: `delegation_active_${index}`,
          validator: validators[index],
          amount: stakedAmount,
          status: "Active" as const,
          delegationIndex: -1n,
          pendingUntil: 0,
        },
      ];
    });
  }

  async function getUnbondDelegations(
    creditAddress: Address,
    address: Address,
    count: number,
    validator: Validator
  ): Promise<Delegation[]> {
    const unbondRequests = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        stakingRpcClient.getUnbondRequestData(creditAddress, address, BigInt(i))
      )
    );
    const now = Date.now();

    return unbondRequests.map((req, index) => {
      const unlockTimeInMillis = safeUnlockTimeMillis(req.unlockTime, logger);
      return {
        id: `delegation_pending__${validator.creditAddress}_${index}`,
        validator,
        amount: req.amount,
        status: now > unlockTimeInMillis ? ("Claimable" as const) : ("Pending" as const),
        delegationIndex: BigInt(index),
        pendingUntil: now > unlockTimeInMillis ? 0 : unlockTimeInMillis,
      };
    });
  }

  async function getPendingOrClaimableDelegations(
    address: Address,
    validators: Validator[]
  ): Promise<Delegation[]> {
    const creditAddresses = validators.map((v) => parseEvmAddress(v.creditAddress));
    const pendingUnbond = await stakingRpcClient.getPendingUnbondDelegation(
      creditAddresses,
      address
    );

    const delegationsPerValidator = await Promise.all(
      pendingUnbond.flatMap((result, index) => {
        const pendingCountRaw = processSingleMulticallResult(result);
        if (pendingCountRaw === undefined) return [];
        const pendingCount = clampPendingUnbondCount(pendingCountRaw, logger);
        if (pendingCount <= 0) return [];
        return [
          getUnbondDelegations(
            parseEvmAddress(validators[index].creditAddress),
            address,
            pendingCount,
            validators[index]
          ),
        ];
      })
    );

    return delegationsPerValidator.flat();
  }

  return {
    async getValidators(params: GetValidatorsParams = {}): Promise<ValidatorsPage> {
      const page = params.page ?? 1;
      const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;

      validatePageParams(params);

      const cacheKey = validatorPageCacheKey(page, pageSize);
      const cached = pageCache.get(cacheKey);

      if (cached) {
        logger.debug("StakingService: validator page cache hit", { page, pageSize });
        return cached;
      }

      logger.debug("StakingService: validator page cache miss — fetching from RPC", {
        page,
        pageSize,
      });

      const [{ validators: bnbValidators, total }, contractValidators] = await Promise.all([
        bnbRpcClient.getValidators({ page, pageSize }),
        stakingRpcClient.getCreditContractValidators(),
      ]);

      const data = mapValidators(bnbValidators, contractValidators, logger);
      const result: ValidatorsPage = {
        data,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
          hasNextPage: page * pageSize < total,
        },
      };

      pageCache.set(cacheKey, result);
      logger.debug("StakingService: validator page cached", { page, pageSize, total });
      return result;
    },

    async getDelegations(address: string): Promise<Delegations> {
      const evmAddress = parseEvmAddress(address);
      const stakingSummaryPromise = bnbRpcClient.getStakingSummary();
      const validators = await fetchAllValidators();

      const [stakingSummary, activeDelegations, pendingDelegations] = await Promise.all([
        stakingSummaryPromise,
        getActiveDelegations(evmAddress, validators),
        getPendingOrClaimableDelegations(evmAddress, validators),
      ]);

      return {
        delegations: activeDelegations.concat(pendingDelegations),
        stakingSummary: {
          totalProtocolStake: Number(stakingSummary.totalStaked),
          maxApy: stakingSummary.maxApy * 100,
          minAmountToStake: MIN_AMOUNT_TO_STAKE,
          unboundPeriodInMillis: UNBOUND_PERIOD,
          redelegateFeeRate: REDELEGATION_FEE,
          activeValidators: stakingSummary.activeValidators,
          totalValidators: stakingSummary.totalValidators,
        },
      };
    },
  };
}
