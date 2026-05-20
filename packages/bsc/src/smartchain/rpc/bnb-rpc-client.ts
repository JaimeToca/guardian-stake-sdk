import { fetchOrError, NoopLogger } from "@guardian-sdk/sdk";
import type { Logger } from "@guardian-sdk/sdk";
import type { BNBRpcClientContract } from "./bnb-rpc-client-contract";
import type {
  BNBChainValidator,
  BNBStakingSummary,
  BNBValidatorsResponse,
  StakingResponse,
} from "./bnb-rpc-types";

const BASE_MAINNET_URL = "https://api.bnbchain.org/bnb-staking/v1";

export function createBnbRpcClient(logger: Logger = new NoopLogger()): BNBRpcClientContract {
  return {
    async getValidators(): Promise<BNBChainValidator[]> {
      const url = `${BASE_MAINNET_URL}/validator/all`;
      logger.debug("BNBRpcClient: fetching validators", { url });
      const start = Date.now();

      const response = await fetchOrError<BNBValidatorsResponse>({
        url,
        method: "GET",
        params: { limit: "100", offset: "0" },
      });

      logger.debug("BNBRpcClient: validators fetched", {
        count: response.data.validators.length,
        ms: Date.now() - start,
        response: response.data,
      });
      return response.data.validators;
    },

    async getStakingSummary(): Promise<BNBStakingSummary> {
      const url = `${BASE_MAINNET_URL}/summary`;
      logger.debug("BNBRpcClient: fetching staking summary", { url });
      const start = Date.now();

      const response = await fetchOrError<StakingResponse>({ url, method: "GET" });

      logger.debug("BNBRpcClient: staking summary fetched", {
        ms: Date.now() - start,
        response: response.data,
      });
      return response.data.summary;
    },
  };
}
