import { Address } from "viem";
import { Balance } from "./balance-types";

export interface BalanceServiceContract {
  getBalances(address: Address): Promise<Balance[]>;
}
