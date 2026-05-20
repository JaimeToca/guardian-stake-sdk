import type { Address } from "viem";
import { parseEther } from "viem";
import type { CacheContract, Logger } from "@guardian-sdk/sdk";
import { NoopLogger } from "@guardian-sdk/sdk";
import type { BNBChainValidator, BNBRpcClientContract, StakingRpcClientContract } from "../rpc";
import { processSingleMulticallResult } from "../abi";
import type {
  Delegation,
  Delegations,
  StakingServiceContract,
  Validator,
  ValidatorStatus,
} from "@guardian-sdk/sdk";
import { filterByStatus } from "@guardian-sdk/sdk";
import { parseEvmAddress } from "../validations";

const UNBOUND_PERIOD = 604800000; // 7 days in millis
const REDELEGATION_FEE = 0.002;
const MIN_AMOUNT_TO_STAKE = parseEther("1.0");
const VALIDATOR_CACHE_KEY = "bsc-validators";
const BASE_VALIDATOR_IMAGE_URL =
  "https://raw.githubusercontent.com/bnb-chain/bsc-validator-directory/main/mainnet/validators/";

function getValidatorStatus(v: BNBChainValidator): ValidatorStatus {
  if (v.status === "INACTIVE") return "Inactive";
  if (v.status === "JAILED") return "Jailed";
  return "Active";
}

function getValidatorImage(address: Address): string {
  return `${BASE_VALIDATOR_IMAGE_URL}${address}/logo.png`;
}

// BSC does not have more than 60 validators — no pagination needed
export function createStakingService(
  cache: CacheContract<string, Validator[]>,
  stakingRpcClient: StakingRpcClientContract,
  bnbRpcClient: BNBRpcClientContract,
  logger: Logger = new NoopLogger()
): StakingServiceContract {
  async function fetchAllValidators(): Promise<Validator[]> {
    const cached = cache.get(VALIDATOR_CACHE_KEY);
    if (cached) {
      logger.debug("StakingService: validators cache hit", { count: cached.length });
      return cached;
    }

    logger.debug("StakingService: validators cache miss — fetching from RPC");
    const [bnbValidators, contractValidators] = await Promise.all([
      bnbRpcClient.getValidators(),
      stakingRpcClient.getCreditContractValidators(),
    ]);

    const validators = bnbValidators
      .map((bnbValidator, index) => {
        const operatorAddress = parseEvmAddress(bnbValidator.operatorAddress);
        const creditAddress = contractValidators.get(operatorAddress);
        if (!creditAddress) {
          logger.warn("StakingService: validator has no credit address — skipping", {
            moniker: bnbValidator.moniker,
            operatorAddress,
          });
          return undefined;
        }
        return {
          id: `${bnbValidator.moniker}_${index}`,
          status: getValidatorStatus(bnbValidator),
          name: bnbValidator.moniker,
          description: bnbValidator.miningStatus,
          image: getValidatorImage(operatorAddress),
          apy: (bnbValidator.apy ?? 0) * 100,
          delegators: bnbValidator.delegatorCount,
          operatorAddress,
          creditAddress: parseEvmAddress(creditAddress),
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== undefined);

    cache.set(VALIDATOR_CACHE_KEY, validators);
    logger.debug("StakingService: validators cached", { count: validators.length });
    return validators;
  }

  async function getActiveDelegations(
    address: Address,
    validators: Validator[]
  ): Promise<Delegation[]> {
    const creditContracts = validators.map((v) => parseEvmAddress(v.creditAddress));
    const pooledBNBData = await stakingRpcClient.getPooledBNBData(creditContracts, address);

    return pooledBNBData
      .map((data, index) => {
        const stakedAmount = processSingleMulticallResult(data);
        if (stakedAmount === undefined) return undefined;
        return {
          id: `delegation_active_${index}`,
          validator: validators[index],
          amount: stakedAmount,
          status: "Active" as const,
          delegationIndex: -1n,
          pendingUntil: 0,
        };
      })
      .filter((item) => item !== undefined);
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
      const unlockTimeInMillis = req.unlockTime * 1000n;
      return {
        id: `delegation_pending__${validator.creditAddress}_${index}`,
        validator,
        amount: req.amount,
        status: now > unlockTimeInMillis ? ("Claimable" as const) : ("Pending" as const),
        delegationIndex: BigInt(index),
        pendingUntil: now > unlockTimeInMillis ? 0 : Number(unlockTimeInMillis),
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
      pendingUnbond.map(async (result, index) => {
        const pendingCountRaw = processSingleMulticallResult(result);
        if (pendingCountRaw === undefined) return undefined;
        return getUnbondDelegations(
          parseEvmAddress(validators[index].creditAddress),
          address,
          Number(pendingCountRaw),
          validators[index]
        );
      })
    );

    return delegationsPerValidator.filter((d): d is Delegation[] => d !== undefined).flat();
  }

  return {
    async getValidators(status?: ValidatorStatus | ValidatorStatus[]): Promise<Validator[]> {
      return filterByStatus(await fetchAllValidators(), status);
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
