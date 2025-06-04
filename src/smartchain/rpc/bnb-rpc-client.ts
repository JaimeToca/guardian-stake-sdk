import { BNBRpcClientContract } from "./bnb-rpc-client-contract";
import { BNBChainValidator, BNBStakingSummary, BNBValidatorsResponse, StakingResponse } from "./bnb-rpc-types";
import { fetchOrError } from "./rpc-utils";

export class BNBRpcClient implements BNBRpcClientContract {
  private static readonly BASE_MAINNET_URL =
    "https://api.bnbchain.org/bnb-staking/v1";
  private static readonly VALIDATORS_LIMIT = "100";
  private static readonly VALIDATORS_OFFSET = "0";

  async getValidators(): Promise<BNBChainValidator[]> {
    const requestUrl = `${BNBRpcClient.BASE_MAINNET_URL}/validator/all`

    const response = await fetchOrError<BNBValidatorsResponse>({
      url: requestUrl,
      method: "GET",
      params: {
        limit: BNBRpcClient.VALIDATORS_LIMIT,
        offset: BNBRpcClient.VALIDATORS_OFFSET,
      },
    });

    return response.data.validators;
  }

  async getStakingSummary(): Promise<BNBStakingSummary> {
    const requestUrl = `${BNBRpcClient.BASE_MAINNET_URL}/summary`;

    const response = await fetchOrError<StakingResponse>({
      url: requestUrl,
      method: "GET",
    });

    return response.data.summary;
  }
}
