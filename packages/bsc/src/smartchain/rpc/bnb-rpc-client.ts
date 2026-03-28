import { fetchOrError, NoopLogger } from "@guardian/sdk";
import type { Logger } from "@guardian/sdk";
import type { BNBRpcClientContract } from "./bnb-rpc-client-contract";
import type {
  BNBChainValidator,
  BNBStakingSummary,
  BNBValidatorsResponse,
  StakingResponse,
} from "./bnb-rpc-types";

/**
 * A client class responsible for interacting with BNB Chain indexing API.
 */
export class BNBRpcClient implements BNBRpcClientContract {
  private static readonly BASE_MAINNET_URL = "https://api.bnbchain.org/bnb-staking/v1";
  private static readonly VALIDATORS_LIMIT = "100";
  private static readonly VALIDATORS_OFFSET = "0";

  constructor(private readonly logger: Logger = new NoopLogger()) {}

  async getValidators(): Promise<BNBChainValidator[]> {
    const requestUrl = `${BNBRpcClient.BASE_MAINNET_URL}/validator/all`;
    this.logger.debug("BNBRpcClient: fetching validators", { url: requestUrl });
    const start = Date.now();

    const response = await fetchOrError<BNBValidatorsResponse>({
      url: requestUrl,
      method: "GET",
      params: {
        limit: BNBRpcClient.VALIDATORS_LIMIT,
        offset: BNBRpcClient.VALIDATORS_OFFSET,
      },
    });

    this.logger.debug("BNBRpcClient: validators fetched", {
      count: response.data.validators.length,
      ms: Date.now() - start,
      response: response.data,
    });
    return response.data.validators;
  }

  async getStakingSummary(): Promise<BNBStakingSummary> {
    const requestUrl = `${BNBRpcClient.BASE_MAINNET_URL}/summary`;
    this.logger.debug("BNBRpcClient: fetching staking summary", { url: requestUrl });
    const start = Date.now();

    const response = await fetchOrError<StakingResponse>({
      url: requestUrl,
      method: "GET",
    });

    this.logger.debug("BNBRpcClient: staking summary fetched", {
      ms: Date.now() - start,
      response: response.data,
    });
    return response.data.summary;
  }
}
