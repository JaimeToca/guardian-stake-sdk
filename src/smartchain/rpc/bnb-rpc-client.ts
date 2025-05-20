import { appendUrlParams, fetchOrError } from "./rpc-utils";

export class BNBRpcClient implements BNBRpcClientContract {
  private static readonly BASE_MAINNET_URL =
    "https://api.bnbchain.org/bnb-staking/v1";
  private static readonly VALIDATORS_LIMIT = "100";
  private static readonly VALIDATORS_OFFSET = "0";

  async getValidators(): Promise<BNBChainValidator[]> {
    const requestUrl = appendUrlParams(
      BNBRpcClient.BASE_MAINNET_URL + "/validator/all",
      {
        limit: BNBRpcClient.VALIDATORS_LIMIT,
        offset: BNBRpcClient.VALIDATORS_OFFSET,
      }
    );

    const request: RequestInfo = new Request(requestUrl, {
      method: "GET",
      headers: new Headers({
        "Content-Type": "application/json",
        "Accept": "application/json",
      }),
    });

    const validatorResponse = await fetchOrError<BNBValidatorsResponse>(
      request
    );

    return validatorResponse.data.validators;
  }

  async getStakingSummary(): Promise<BNBStakingSummary> {
    const requestUrl = `${BNBRpcClient.BASE_MAINNET_URL}/summary`
    
    const request: RequestInfo = new Request(requestUrl, {
      method: "GET",
      headers: new Headers({
        "Content-Type": "application/json",
        "Accept": "application/json",
      }),
    });

    const summaryResponse = await fetchOrError<StakingResponse>(
      request
    );

    return summaryResponse.data.summary
  }
}
