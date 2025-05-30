import { Chain } from "viem";
import { Balance } from "./balance-types";
import { BalanceServiceContract } from "./balance-service-contract";

export class BalanceService implements BalanceServiceContract {

    constructor(){}

    getBalances(chain: Chain): Balance[] {
        return []
    }
}