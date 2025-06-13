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
import { FeeServiceContract, SignServiceContract } from "../../common";

export class GuardianService implements GuardianServiceContract {
  constructor(private feeService: FeeServiceContract, private signService: SignServiceContract, ) {}

  getBalances(chain: GuardianChain, address: Address): Promise<Balance[]> {
    throw new Error("Method not implemented.");
  }
  estimateFee(transaction: Transaction): Promise<Fee> {
    throw new Error("Method not implemented.");
  }
  sign(signingArgs: SigningWithPrivateKey | SigningWithAccount): Promise<Hex> {
    throw new Error("Method not implemented.");
  }
  prehash(preHasArgs: BaseSignArgs): PrehashResult {
    throw new Error("Method not implemented.");
  }
  compile(compileArgs: CompileArgs): Hex {
    throw new Error("Method not implemented.");
  }
  buildCallData(transaction: Transaction): { data: Hex; amount: bigint } {
    throw new Error("Method not implemented.");
  }
}
