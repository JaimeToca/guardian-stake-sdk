import type { Address, Hex, TransactionSerializable } from "viem";
import { serializeTransaction, parseEther, formatEther, parseSignature } from "viem";
import {
  encodeClaim,
  encodeDelegate,
  encodeRedelegate,
  encodeUndelegate,
} from "../abi/staking-function-encoder";
import { privateKeyToAccount } from "viem/accounts";
import { STAKING_CONTRACT } from "../abi/multicall-stake-abi";
import type {
  Fee,
  Validator,
  OperatorAddress,
  BaseSignArgs,
  CompileArgs,
  PrehashResult,
  SigningWithPrivateKey,
  Transaction,
  UndelegateTransaction,
  RedelegateTransaction,
  Logger,
} from "@guardian-sdk/sdk";
import { SigningError, NoopLogger, ValidationError, privateKey } from "@guardian-sdk/sdk";
import type { StakingRpcClientContract } from "../rpc/staking-rpc-client-contract";
import type { BscSignServiceContract, CallData, SigningWithAccount } from "../sign-types";
import { isSigningWithAccount, isSigningWithPrivateKey } from "../sign-types";

const MIN_DELEGATION_AMOUNT = parseEther("1");
import { parseEvmAddress } from "../validations";

/**
 * Service responsible for handling various aspects of transaction signing on BSC.
 */
export class SignService implements BscSignServiceContract {
  constructor(
    private readonly stakingRpcClient: StakingRpcClientContract,
    private readonly logger: Logger = new NoopLogger()
  ) {}

  async sign(signingArgs: SigningWithPrivateKey | SigningWithAccount): Promise<Hex> {
    this.logger.info("SignService: signing transaction", {
      type: signingArgs.transaction.type,
      chain: signingArgs.transaction.chain.id,
    });
    const fee = signingArgs.fee;
    const nonce = signingArgs.nonce;
    const transaction = signingArgs.transaction;

    const unsignedTransaction = await this.buildUnsignedTransaction(transaction, fee, nonce);

    let signedTransaction: Hex;

    if (isSigningWithAccount(signingArgs)) {
      const account = signingArgs.account;
      signedTransaction = await account.signTransaction(unsignedTransaction);
    } else if (isSigningWithPrivateKey(signingArgs)) {
      const account = privateKeyToAccount(privateKey(signingArgs.privateKey));
      signedTransaction = await account.signTransaction(unsignedTransaction);
    } else {
      throw new SigningError(
        "INVALID_SIGNING_ARGS",
        "signingArgs must contain either a privateKey (SigningWithPrivateKey) or an account (SigningWithAccount)."
      );
    }

    this.logger.info("SignService: transaction signed");
    return signedTransaction;
  }

  async prehash(preHasArgs: BaseSignArgs): Promise<PrehashResult> {
    this.logger.info("SignService: prehashing transaction", {
      type: preHasArgs.transaction.type,
      chain: preHasArgs.transaction.chain.id,
    });
    const transaction = preHasArgs.transaction;
    const fee = preHasArgs.fee;
    const nonce = preHasArgs.nonce;

    const unsignedTransaction = await this.buildUnsignedTransaction(transaction, fee, nonce);

    const result = {
      serializedTransaction: serializeTransaction(unsignedTransaction),
      signArgs: {
        transaction: transaction,
        fee: fee,
        nonce: nonce,
      },
    };
    this.logger.info(
      "SignService: prehash complete — send serializedTransaction to external signer"
    );
    return result;
  }

  async compile(compileArgs: CompileArgs): Promise<Hex> {
    this.logger.info("SignService: compiling signed transaction");
    const transaction = compileArgs.signArgs.transaction;
    const fee = compileArgs.signArgs.fee;
    const nonce = compileArgs.signArgs.nonce;

    const unsignedTransaction = await this.buildUnsignedTransaction(transaction, fee, nonce);
    const sig = parseSignature(compileArgs.signature as Hex);

    const compiled = serializeTransaction(unsignedTransaction, sig);
    this.logger.info("SignService: transaction compiled");
    return compiled;
  }

  private async buildUnsignedTransaction(
    transaction: Transaction,
    fee: Fee,
    nonce: number
  ): Promise<TransactionSerializable> {
    const { data, amount } = await this.buildCallData(transaction);

    return this.buildBaseTransaction(
      {
        transaction,
        fee,
        nonce,
      },
      amount,
      data
    );
  }

  private buildBaseTransaction(
    signArgs: BaseSignArgs,
    amount: bigint,
    data: Hex
  ): TransactionSerializable {
    const transaction = signArgs.transaction;
    const fee = signArgs.fee;
    const nonce = signArgs.nonce;

    if (fee.type !== "GasFee") {
      throw new Error(`BSC sign service requires a GasFee, got "${fee.type}".`);
    }

    return {
      to: STAKING_CONTRACT,
      value: amount,
      data,
      chainId: Number(transaction.chain.chainId),
      gas: fee.gasLimit,
      gasPrice: fee.gasPrice,
      nonce: nonce,
    };
  }

  async buildCallData(transaction: Transaction): Promise<CallData> {
    if (transaction.type === "Delegate" && transaction.amount < MIN_DELEGATION_AMOUNT) {
      throw new ValidationError(
        "INVALID_AMOUNT",
        `Amount must be at least 1 BNB — got ${formatEther(transaction.amount)} BNB`
      );
    }

    switch (transaction.type) {
      case "Delegate": {
        const operatorAddress = this.getValidatorAddress(transaction.validator);
        return { data: encodeDelegate(operatorAddress), amount: transaction.amount };
      }
      case "Redelegate": {
        const from = this.getValidatorAddress(transaction.fromValidator);
        const to = this.getValidatorAddress(transaction.toValidator);
        const shares = await this.bnbToShares(transaction);
        return { data: encodeRedelegate(from, to, shares), amount: 0n };
      }
      case "Undelegate": {
        const operatorAddress = this.getValidatorAddress(transaction.validator);
        const shares = await this.bnbToShares(transaction);
        return { data: encodeUndelegate(operatorAddress, shares), amount: 0n };
      }
      case "Claim": {
        const operatorAddress = this.getValidatorAddress(transaction.validator);
        return {
          data: encodeClaim(operatorAddress, transaction.index),
          amount: 0n,
        };
      }
      default:
        throw new SigningError(
          "UNSUPPORTED_TRANSACTION_TYPE",
          `Cannot build call data: unsupported transaction type "${(transaction as Transaction).type}".`
        );
    }
  }

  /**
   * Resolves the share count to pass to the StakeCredit contract for undelegate/redelegate.
   *
   * Two paths depending on isMaxAmount:
   *
   * - isMaxAmount: true  → calls balanceOf(account) on the StakeCredit contract, returning the
   *   exact share balance with no arithmetic. This is the only safe approach for "undelegate all"
   *   because the BNB→shares round-trip (getPooledBNB → getSharesByPooledBNB) can lose 1 share
   *   to integer rounding, leaving a dust residual staked forever.
   *
   * - isMaxAmount: false → calls getSharesByPooledBNB(amount) to convert the given BNB wei amount
   *   to the equivalent share count at the current exchange rate.
   *
   * Requires a full Validator object (not a bare operator address string) because the credit contract
   * address is needed. Use getValidators() to obtain the Validator object.
   */
  private async bnbToShares(
    transaction: UndelegateTransaction | RedelegateTransaction
  ): Promise<bigint> {
    const validator =
      transaction.type === "Undelegate" ? transaction.validator : transaction.fromValidator;

    if (typeof validator === "string") {
      throw new SigningError(
        "INVALID_SIGNING_ARGS",
        "Undelegate and Redelegate require a Validator object (not just an operator address string) " +
          "so the SDK can resolve the credit contract and convert the BNB amount to shares. " +
          "Use getValidators() to obtain the full Validator object."
      );
    }

    const creditAddress = parseEvmAddress(validator.creditAddress);

    if (transaction.isMaxAmount) {
      if (transaction.account === undefined) {
        throw new ValidationError(
          "INVALID_ADDRESS",
          "account is required when isMaxAmount is true — it is used to read the exact share balance."
        );
      }
      return this.stakingRpcClient.getShareBalance(
        creditAddress,
        parseEvmAddress(transaction.account)
      );
    }

    return this.stakingRpcClient.getSharesByPooledBNBData(creditAddress, transaction.amount);
  }

  private getValidatorAddress(validator: Validator | OperatorAddress): Address {
    if (typeof validator === "string") {
      return parseEvmAddress(validator);
    } else {
      return parseEvmAddress(validator.operatorAddress);
    }
  }
}
