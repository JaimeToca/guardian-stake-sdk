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
    async getValidators({
      page,
      pageSize,
    }: {
      page: number;
      pageSize: number;
    }): Promise<{ validators: BNBChainValidator[]; total: number }> {
      const offset = (page - 1) * pageSize;
      const url = `${BASE_MAINNET_URL}/validator/all`;
      logger.debug("BNBRpcClient: fetching validators", { url, page, pageSize, offset });
      const start = Date.now();

      const response = await fetchOrError<BNBValidatorsResponse>({
        url,
        method: "GET",
        params: { limit: String(pageSize), offset: String(offset) },
      });

      logger.debug("BNBRpcClient: validators fetched", {
        count: response.data.validators.length,
        total: response.data.total,
        ms: Date.now() - start,
      });
      return { validators: response.data.validators, total: response.data.total };
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
