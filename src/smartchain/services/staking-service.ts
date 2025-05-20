import { Address, Hex } from "viem";
import { StakingRpcClientContract } from "../rpc/staking-rpc-client-contract";
import { Delegations, Validator, ValidatorStatus } from "./staking-types";
import { StakingServiceContract } from "./staking-service-contract";

export class StakingService implements StakingServiceContract {
  constructor(
    private readonly stakingRpcClient: StakingRpcClientContract,
    private readonly bnbRpcClient: BNBRpcClientContract
  ) {}

  async getValidators(): Promise<Validator[]> {
    const [bnbValidators, contractCallValidators] = await Promise.all([
      this.bnbRpcClient.getValidators(),
      this.stakingRpcClient.getValidatorsCreditContracts(), // TODO: Set cache
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
    // Set Cache
    const validatorsContract = (await this.stakingRpcClient.getValidatorsCreditContracts()).values()

    const activeDelegations = this.stakingRpcClient.getPooledBNBData(Array.from(validatorsContract), address)

    console.log(activeDelegations)

    return {
      delegations: [],
      stakingSummary: {
        totalProtocolStake: 0,
        maxApy: 0,
        minAmountToStake: 0,
        unboundPeriod: 0, 
        redelegateFeeRate: 0,
        activeValidators: 0,
        inactiveValidators: 0,
        jailedValidators: 0,
        totalValidators: 0,
      }
    }
  }

  // getPooledBNB
  private getActiveDelegations() {

  }

  // TODO: Clasify between pending and
  private getPendingDelegations() {

  }
}
