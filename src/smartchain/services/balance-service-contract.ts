import { Address, Chain } from "viem";
import { Balance } from "./balance-types";

export interface BalanceServiceContract {
    getBalances(chain: Chain, address: Address): Promise<Balance[]>
}