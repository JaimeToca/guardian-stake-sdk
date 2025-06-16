import { Address, PublicClient } from "viem";
import { NonceServiceContract } from "../../common/service/nonce-service-contract";

export class NonceService implements NonceServiceContract {
  constructor(private readonly client: PublicClient) {}
  getNonce(address: Address): Promise<number> {
    return this.client.getTransactionCount({
      address: address,
    });
  }
}
