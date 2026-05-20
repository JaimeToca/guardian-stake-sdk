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
import { parseEvmAddress } from "../validations";

const MIN_DELEGATION_AMOUNT = parseEther("1");

export function createSignService(
  stakingRpcClient: StakingRpcClientContract,
  logger: Logger = new NoopLogger()
): BscSignServiceContract {
  function getValidatorAddress(validator: Validator | OperatorAddress): Address {
    return typeof validator === "string"
      ? parseEvmAddress(validator)
      : parseEvmAddress(validator.operatorAddress);
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
   */
  async function bnbToShares(
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
      return stakingRpcClient.getShareBalance(creditAddress, parseEvmAddress(transaction.account));
    }

    return stakingRpcClient.getSharesByPooledBNBData(creditAddress, transaction.amount);
  }

  async function buildCallData(transaction: Transaction): Promise<CallData> {
    if (transaction.type === "Delegate" && transaction.amount < MIN_DELEGATION_AMOUNT) {
      throw new ValidationError(
        "INVALID_AMOUNT",
        `Amount must be at least 1 BNB — got ${formatEther(transaction.amount)} BNB`
      );
    }

    switch (transaction.type) {
      case "Delegate":
        return {
          data: encodeDelegate(getValidatorAddress(transaction.validator)),
          amount: transaction.amount,
        };
      case "Redelegate": {
        const shares = await bnbToShares(transaction);
        return {
          data: encodeRedelegate(
            getValidatorAddress(transaction.fromValidator),
            getValidatorAddress(transaction.toValidator),
            shares
          ),
          amount: 0n,
        };
      }
      case "Undelegate": {
        const shares = await bnbToShares(transaction);
        return {
          data: encodeUndelegate(getValidatorAddress(transaction.validator), shares),
          amount: 0n,
        };
      }
      case "Claim":
        return {
          data: encodeClaim(getValidatorAddress(transaction.validator), transaction.index),
          amount: 0n,
        };
      default:
        throw new SigningError(
          "UNSUPPORTED_TRANSACTION_TYPE",
          `Cannot build call data: unsupported transaction type "${(transaction as Transaction).type}".`
        );
    }
  }

  function buildBaseTransaction(
    signArgs: BaseSignArgs,
    amount: bigint,
    data: Hex
  ): TransactionSerializable {
    return {
      to: STAKING_CONTRACT,
      value: amount,
      data,
      chainId: Number(signArgs.transaction.chain.chainId),
      gas: signArgs.fee.gasLimit,
      gasPrice: signArgs.fee.gasPrice,
      nonce: signArgs.nonce,
    };
  }

  async function buildUnsignedTransaction(
    transaction: Transaction,
    fee: Fee,
    nonce: number
  ): Promise<TransactionSerializable> {
    const { data, amount } = await buildCallData(transaction);
    return buildBaseTransaction({ transaction, fee, nonce }, amount, data);
  }

  return {
    buildCallData,

    async sign(signingArgs: SigningWithPrivateKey | SigningWithAccount): Promise<Hex> {
      logger.info("SignService: signing transaction", {
        type: signingArgs.transaction.type,
        chain: signingArgs.transaction.chain.id,
      });

      const unsignedTx = await buildUnsignedTransaction(
        signingArgs.transaction,
        signingArgs.fee,
        signingArgs.nonce
      );

      let signedTransaction: Hex;
      if (isSigningWithAccount(signingArgs)) {
        signedTransaction = await signingArgs.account.signTransaction(unsignedTx);
      } else if (isSigningWithPrivateKey(signingArgs)) {
        signedTransaction = await privateKeyToAccount(
          privateKey(signingArgs.privateKey)
        ).signTransaction(unsignedTx);
      } else {
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "signingArgs must contain either a privateKey (SigningWithPrivateKey) or an account (SigningWithAccount)."
        );
      }

      logger.info("SignService: transaction signed");
      return signedTransaction;
    },

    async prehash(preHashArgs: BaseSignArgs): Promise<PrehashResult> {
      logger.info("SignService: prehashing transaction", {
        type: preHashArgs.transaction.type,
        chain: preHashArgs.transaction.chain.id,
      });

      const unsignedTx = await buildUnsignedTransaction(
        preHashArgs.transaction,
        preHashArgs.fee,
        preHashArgs.nonce
      );

      logger.info("SignService: prehash complete — send serializedTransaction to external signer");
      return {
        serializedTransaction: serializeTransaction(unsignedTx),
        signArgs: {
          transaction: preHashArgs.transaction,
          fee: preHashArgs.fee,
          nonce: preHashArgs.nonce,
        },
      };
    },

    async compile(compileArgs: CompileArgs): Promise<Hex> {
      logger.info("SignService: compiling signed transaction");

      const unsignedTx = await buildUnsignedTransaction(
        compileArgs.signArgs.transaction,
        compileArgs.signArgs.fee,
        compileArgs.signArgs.nonce
      );

      const compiled = serializeTransaction(
        unsignedTx,
        parseSignature(compileArgs.signature as Hex)
      );
      logger.info("SignService: transaction compiled");
      return compiled;
    },
  };
}
