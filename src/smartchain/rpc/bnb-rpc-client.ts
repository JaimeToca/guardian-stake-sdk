import { appendUrlParams, fetchOrError } from "../../utils/rpc-utils";

export class RpcClient implements RpcClientContract {
  private static readonly BASE_MAINNET_URL =
    "https://api.bnbchain.org/bnb-staking/v1";
  private static readonly VALIDATORS_LIMIT = "100";
  private static readonly VALIDATORS_OFFSET = "0";

  async getValidators(): Promise<SmartChainValidator[]> {
    const requestUrl = appendUrlParams(
      RpcClient.BASE_MAINNET_URL + "/validator/all",
      {
        limit: RpcClient.VALIDATORS_LIMIT,
        offset: RpcClient.VALIDATORS_OFFSET,
      }
    );

    const request: RequestInfo = new Request(requestUrl, {
      method: "GET",
      headers: new Headers({
        "Content-Type": "application/json",
        "Accept": "application/json",
      }),
    });

    const validatorResponse = await fetchOrError<SmartChainValidatorsResponse>(
      request
    );

    return validatorResponse.data.validators;
  }
}
