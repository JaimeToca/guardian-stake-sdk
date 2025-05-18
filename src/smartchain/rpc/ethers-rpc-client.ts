import { JsonRpcProvider } from "ethers";
import {
  claimableUnbondRequestData,
  getPooledBNBData,
  getSharesByPooledBNBData,
  getValidatorsData,
  pendingUnbondRequestData,
} from "../abi/staking-function-enconder";
import { abiCoder } from "../abi/abi-utils";
import { decodeGetValidators } from "../abi/staking-function-decoder";

export class EthersRpcClient implements EthersRpcClientContract {
  constructor(private readonly ethersProvider: JsonRpcProvider) {}

  async getValidatorsCreditContracts(
    contract: string
  ): Promise<Map<string, string>> {
    const validatorsResponse = await this.ethersProvider.call({
      to: contract,
      data: getValidatorsData(),
    });

    const decodedResponse = decodeGetValidators(validatorsResponse)

    console.log(decodedResponse);

    const map = new Map();
    return map;
  }

  async getClaimableUnbondDelegation(contract: string, address: string) {
    const validatorsResponse = this.ethersProvider.call({
      to: contract,
      data: claimableUnbondRequestData(address),
    });

    console.log(validatorsResponse);
  }

  async getPendingUnbondDelegation(contract: string, address: string) {
    const validatorsResponse = this.ethersProvider.call({
      to: contract,
      data: pendingUnbondRequestData(address),
    });

    console.log(validatorsResponse);
  }

  async getPooledBNBData(contract: string, address: string) {
    const validatorsResponse = this.ethersProvider.call({
      to: contract,
      data: getPooledBNBData(address),
    });
    console.log(validatorsResponse);
  }

  async getSharesByPooledBNBData(contract: string, amount: bigint) {
    const validatorsResponse = this.ethersProvider.call({
      to: contract,
      data: getSharesByPooledBNBData(amount),
    });
    console.log(validatorsResponse);
  }
}
