import { JsonRpcProvider } from "ethers";
import {
  claimableUnbondRequestData,
  getPooledBNBData,
  getSharesByPooledBNBData,
  getValidatorsData,
  pendingUnbondRequestData,
} from "../abi/function-enconder";

export class EthersRpcClient implements EthersRpcClientContract {
  constructor(private readonly ethersProvider: JsonRpcProvider) {}

  async getValidatorsCreditContracts(
    contract: string
  ): Promise<Map<string, string>> {
    const validatorsResponse = this.ethersProvider.call({
      to: contract,
      data: getValidatorsData(),
    });

    console.log(validatorsResponse);

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
