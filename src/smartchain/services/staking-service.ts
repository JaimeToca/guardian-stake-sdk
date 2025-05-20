import { Address, Hex } from "viem";
import { ViemRpcClientContract } from "../rpc/viem-rpc-client-contract";
import { Validator, ValidatorStatus } from "../staking-types";
import { StakingServiceContract } from "./staking-service-contract";

export class StakingService implements StakingServiceContract {
  constructor(
    private readonly viemRpcClient: ViemRpcClientContract,
    private readonly bnbRpcClient: BNBRpcClientContract
  ) {}

  async getValidators(): Promise<Validator[]> {
    const [bnbValidators, contractCallValidators] = await Promise.all([
      this.bnbRpcClient.getValidators(),
      this.viemRpcClient.getValidatorsCreditContracts(),
    ]);

    return bnbValidators.map((bnbValidator, index) => {
      const operatorAddress = bnbValidator.operatorAddress as Hex
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

  private getValidatorStatus(bnbValidator: SmartChainValidator) {
    switch (bnbValidator.status) {
      case "INACTIVE": return ValidatorStatus.Inactive;
      case "JAILED": return ValidatorStatus.Jailed;
      default: return ValidatorStatus.Active
    }
  }

  private getValidatorImage(address: string): string {
    const BASE_VALIDATOR_IMAGE_URL = `https://raw.githubusercontent.com/bnb-chain/bsc-validator-directory/main/mainnet/validators/`;
    const LOGO_FILE = `/logo.png`;

    return `${BASE_VALIDATOR_IMAGE_URL}${address}${LOGO_FILE}`;
  }

  getDelegations(): Promise<Validator[]> {
    throw new Error(`Method not implemented`);
  }
}
