import { HexString } from "../entity/types";
import { GuardianChain } from "../chain";
import { Balance } from "./balance-types";
import { Transaction } from "./transaction-types";
import { Fee } from "./fee-types";
import {
  BaseSignArgs,
  CompileArgs,
  PrehashResult,
  SigningWithPrivateKey,
} from "./sign-types";
import { Delegations, Validator } from "./staking-types";

/**
 * @interface GuardianServiceContract
 * @description Defines the chain-agnostic contract for the Guardian Service facade.
 */
export interface GuardianServiceContract {
  getValidators(): Promise<Validator[]>;
  getDelegations(address: string): Promise<Delegations>;
  getBalances(address: string): Promise<Balance[]>;
  getNonce(address: string): Promise<number>;
  estimateFee(transaction: Transaction): Promise<Fee>;
  sign(signingArgs: SigningWithPrivateKey): Promise<string>;
  prehash(preHasArgs: BaseSignArgs): Promise<PrehashResult>;
  compile(compileArgs: CompileArgs): Promise<string>;
  buildCallData(transaction: Transaction): { data: HexString; amount: bigint };
  getChainInfo(): GuardianChain;
}
