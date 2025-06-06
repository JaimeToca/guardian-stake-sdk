import { BNBRpcClientContract } from "./bnb-rpc-client-contract";
import {
  BNBChainValidator,
  BNBStakingSummary,
  BNBValidatorsResponse,
  StakingResponse,
} from "./bnb-rpc-types";
import { fetchOrError } from "./rpc-utils";

/**
 * A client class responsible for interacting with BNB (Binance Coin)
 * https://api.bnbchain.org API. It's assumed that BNBRpcClient.BASE_MAINNET_URL, VALIDATORS_LIMIT,
 * and VALIDATORS_OFFSET are static properties.
 */
export class BNBRpcClient implements BNBRpcClientContract {
  private static readonly BASE_MAINNET_URL =
    "https://api.bnbchain.org/bnb-staking/v1";
  private static readonly VALIDATORS_LIMIT = "100"; // It's okay, 50 validators at the moment
  private static readonly VALIDATORS_OFFSET = "0";

  /**
   * Fetches a list of all validators on the BNB Chain mainnet.
   * This method retrieves a paginated list of validator details from the API, the response
   * contains extra information such as image, status, apy, comission etc..
   * This information is later indexed with the credit contract of the validator retrieved
   * using {@linkcode ../staking-rpc.client.ts}.
   *
   * @returns {Promise<BNBChainValidator[]>} A promise that resolves to an array
   * of `BNBChainValidator` objects, each representing a single validator.
   * @throws {ApiError} If the API request fails for any reason (e.g., network error, server error).
   */
  async getValidators(): Promise<BNBChainValidator[]> {
    const requestUrl = `${BNBRpcClient.BASE_MAINNET_URL}/validator/all`;

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

  /**
   * Fetches the staking summary for BNB .
   * This method makes an API call to retrieve the current staking statistics.
   *
   * @returns {Promise<BNBStakingSummary>} A promise that resolves to an object
   * containing the BNB staking summary data.
   * @throws {ApiError} If the API request fails for any reason (e.g., network error, server error).
   */
  async getStakingSummary(): Promise<BNBStakingSummary> {
    const requestUrl = `${BNBRpcClient.BASE_MAINNET_URL}/summary`;

    const response = await fetchOrError<StakingResponse>({
      url: requestUrl,
      method: "GET",
    });

    return response.data.summary;
  }
}
