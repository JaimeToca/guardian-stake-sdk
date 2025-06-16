import { Address, Hex } from "viem";
import { GuardianChain } from "../chain";
import { Balance } from "./balance-types";
import { Transaction } from "./transaction-types";
import { Fee } from "./fee-types";
import {
  BaseSignArgs,
  CompileArgs,
  PrehashResult,
  SigningWithAccount,
  SigningWithPrivateKey,
} from "./sign-types";

export interface GuardianServiceContract {
  getBalances(chain: GuardianChain, address: Address): Promise<Balance[]>;
  getNonce(address: Address): Promise<number>;
  estimateFee(transaction: Transaction): Promise<Fee>;
  sign(signingArgs: SigningWithPrivateKey | SigningWithAccount): Promise<Hex>;
  prehash(preHasArgs: BaseSignArgs): Promise<PrehashResult>;
  compile(compileArgs: CompileArgs): Promise<Hex>;
  buildCallData(transaction: Transaction): {
    data: Hex;
    amount: bigint;
  };
  getChainInfo(): GuardianChain
}
