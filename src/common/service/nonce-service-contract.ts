import { Address } from "viem";

export interface NonceServiceContract {
  getNonce(address: Address): Promise<number>;
}
