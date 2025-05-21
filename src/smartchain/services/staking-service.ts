import { Address, etherUnits, Hex, parseEther } from "viem";
import { StakingRpcClientContract } from "../rpc/staking-rpc-client-contract";
import { Delegations, Validator, ValidatorStatus } from "./staking-types";
import { StakingServiceContract } from "./staking-service-contract";
import { DecodedValidators } from "../abi/types";
import { InMemoryCache } from "../cache/in-memory-cache";

export class StakingService implements StakingServiceContract {
  constructor(
    private readonly cache: InMemoryCache<string, DecodedValidators>,
    private readonly stakingRpcClient: StakingRpcClientContract,
    private readonly bnbRpcClient: BNBRpcClientContract
  ) {}

  async getValidators(): Promise<Validator[]> {
    const [bnbValidators, contractCallValidators] = await Promise.all([
      this.bnbRpcClient.getValidators(),
      this.getCreditContractValidators(), // TODO: Set cache
    ]);

    return bnbValidators.map((bnbValidator, index) => {
      const operatorAddress = bnbValidator.operatorAddress as Hex;
      return {
        id: `${index}-${bnbValidator.moniker}`,
        status: this.getValidatorStatus(bnbValidator),
        name: bnbValidator.moniker,
        description: bnbValidator.miningStatus,
        image: this.getValidatorImage(operatorAddress),
        apy: bnbValidator.apy * 100,
        delegators: bnbValidator.delegatorCount,
        operatorAddress: operatorAddress,
        creditAddress: contractCallValidators.get(operatorAddress) as Hex,
      };
    });
  }

  private getValidatorStatus(bnbValidator: BNBChainValidator) {
    switch (bnbValidator.status) {
      case "INACTIVE":
        return ValidatorStatus.Inactive;
      case "JAILED":
        return ValidatorStatus.Jailed;
      default:
        return ValidatorStatus.Active;
    }
  }

  private getValidatorImage(address: string): string {
    const BASE_VALIDATOR_IMAGE_URL = `https://raw.githubusercontent.com/bnb-chain/bsc-validator-directory/main/mainnet/validators/`;
    const LOGO_FILE = `/logo.png`;

    return `${BASE_VALIDATOR_IMAGE_URL}${address}${LOGO_FILE}`;
  }

  async getDelegations(address: Address): Promise<Delegations> {
    const stakingSummaryPromise = this.bnbRpcClient.getStakingSummary()

    const validatorsContract = (await this.stakingRpcClient.getCreditContractValidators()).values()
    const activeDelegations = await this.stakingRpcClient.getPooledBNBData(Array.from(validatorsContract), address)
    console.log(activeDelegations)

    const stakingSummary = await stakingSummaryPromise

    return {
      delegations: [],
      stakingSummary: {
        totalProtocolStake: Number(stakingSummary.totalStaked),
        maxApy: stakingSummary.maxApy * 100,
        minAmountToStake: parseEther("1.0"),
        unboundPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
        redelegateFeeRate: 0,
        activeValidators: stakingSummary.activeValidators,
        totalValidators: stakingSummary.totalValidators,
      }
    }
  }

  // getPooledBNB
  private getActiveDelegations() {

  }

  // TODO: Clasify between pending and
  private getPendingDelegations() {

  }

  private async getCreditContractValidators(): Promise<DecodedValidators> {
    const cacheKey = "credit-contracts"

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as DecodedValidators
    }

    const creditContractValidators = await this.stakingRpcClient.getCreditContractValidators()
    this.cache.set(cacheKey, creditContractValidators)

    return creditContractValidators
  }
}
