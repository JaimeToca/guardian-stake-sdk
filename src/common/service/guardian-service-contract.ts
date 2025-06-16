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
import { Delegations, Validator } from "./staking-types";

export interface GuardianServiceContract {
  getValidators(): Promise<Validator[]>;
  getDelegations(address: Address): Promise<Delegations>;
  getBalances(address: Address): Promise<Balance[]>;
  getNonce(address: Address): Promise<number>;
  estimateFee(transaction: Transaction): Promise<Fee>;
  sign(signingArgs: SigningWithPrivateKey | SigningWithAccount): Promise<Hex>;
  prehash(preHasArgs: BaseSignArgs): Promise<PrehashResult>;
  compile(compileArgs: CompileArgs): Promise<Hex>;
  buildCallData(transaction: Transaction): {
    data: Hex;
    amount: bigint;
  };
  getChainInfo(): GuardianChain;
}
