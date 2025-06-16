import { Address, Hex } from "viem";
import { GuardianChain } from "../../common/chain";
import { Balance } from "../../common/service/balance-types";
import { Fee } from "../../common/service/fee-types";
import { GuardianServiceContract } from "../../common/service/guardian-service-contract";
import {
  SigningWithPrivateKey,
  SigningWithAccount,
  BaseSignArgs,
  PrehashResult,
  CompileArgs,
} from "../../common/service/sign-types";
import { Transaction } from "../../common/service/transaction-types";
import {
  BalanceServiceContract,
  FeeServiceContract,
  SignServiceContract,
} from "../../common";
import { NonceServiceContract } from "../../common/service/nonce-service-contract";

export class GuardianService implements GuardianServiceContract {
  constructor(
    private chain: GuardianChain,
    private balanceService: BalanceServiceContract,
    private nonceService: NonceServiceContract,
    private feeService: FeeServiceContract,
    private signService: SignServiceContract
  ) {}
  getChainInfo(): GuardianChain {
    return this.chain;
  }
  getBalances(chain: GuardianChain, address: Address): Promise<Balance[]> {
    return this.balanceService.getBalances(address);
  }
  getNonce(address: Address): Promise<number> {
    return this.nonceService.getNonce(address);
  }
  estimateFee(transaction: Transaction): Promise<Fee> {
    return this.feeService.estimateFee(transaction);
  }
  sign(signingArgs: SigningWithPrivateKey | SigningWithAccount): Promise<Hex> {
    return this.signService.sign(signingArgs);
  }
  prehash(preHasArgs: BaseSignArgs): Promise<PrehashResult> {
    return this.signService.prehash(preHasArgs);
  }
  compile(compileArgs: CompileArgs): Promise<Hex> {
    return this.signService.compile(compileArgs);
  }
  buildCallData(transaction: Transaction): { data: Hex; amount: bigint } {
    return this.signService.buildCallData(transaction);
  }
}
