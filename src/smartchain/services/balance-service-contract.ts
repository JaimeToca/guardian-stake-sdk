import { Chain } from "viem";
import { Balance } from "./balance-types";

export interface BalanceServiceContract {
    getBalances(chain: Chain): Balance[]
}