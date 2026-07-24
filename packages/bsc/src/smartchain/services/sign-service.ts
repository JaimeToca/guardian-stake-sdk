import type { Address, Hex, TransactionSerializable } from "viem";
import {
  serializeTransaction,
  parseTransaction,
  parseEther,
  formatEther,
  parseSignature,
  recoverTransactionAddress,
  getAddress,
} from "viem";
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
import {
  SigningError,
  NoopLogger,
  ValidationError,
  privateKey,
  assertValidator,
} from "@guardian-sdk/sdk";
import type { StakingRpcClientContract } from "../rpc/staking-rpc-client-contract";
import type {
  BscSignArgs,
  BscSignServiceContract,
  CallData,
  SigningWithAccount,
} from "../sign-types";
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
      transaction.type === "Undelegate" ? transaction.validator! : transaction.fromValidator;

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
        assertValidator(transaction);
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
        assertValidator(transaction);
        const shares = await bnbToShares(transaction);
        return {
          data: encodeUndelegate(getValidatorAddress(transaction.validator), shares),
          amount: 0n,
        };
      }
      case "ClaimDelegate":
        assertValidator(transaction);
        if (transaction.index === undefined) {
          throw new ValidationError("INVALID_AMOUNT", "ClaimDelegate on BSC requires an index.");
        }
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
    if (signArgs.fee.type !== "GasFee") {
      throw new SigningError(
        "INVALID_FEE_TYPE",
        `BSC requires a GasFee (gasPrice + gasLimit) but received "${signArgs.fee.type}". ` +
          "Use sdk.estimateFee() on a BSC transaction to obtain the correct fee object."
      );
    }
    const fee = signArgs.fee;

    return {
      to: STAKING_CONTRACT,
      value: amount,
      data,
      chainId: Number(signArgs.transaction.chain.chainId),
      gas: fee.gasLimit,
      gasPrice: fee.gasPrice,
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
          "BSC sign() requires either a privateKey string (SigningWithPrivateKey) or a viem PrivateKeyAccount (SigningWithAccount)."
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

      const serializedTransaction = serializeTransaction(unsignedTx);

      logger.info("SignService: prehash complete — send serializedTransaction to external signer");
      // Thread the exact serialized unsigned tx through `_unsignedTx` (a BSC-only extension,
      // mirroring Cardano's `_txBodyCbor` / Tron's `_rawTx`) so compile() can reassemble the
      // signed transaction without rebuilding it — and without re-running bnbToShares()/live
      // RPC a second time for Undelegate/Redelegate.
      const signArgs: BscSignArgs = {
        transaction: preHashArgs.transaction,
        fee: preHashArgs.fee,
        nonce: preHashArgs.nonce,
        _unsignedTx: serializedTransaction,
      };

      return {
        serializedTransaction,
        signArgs,
      };
    },

    async compile(compileArgs: CompileArgs): Promise<Hex> {
      logger.info("SignService: compiling signed transaction");

      const unsignedTx = (compileArgs.signArgs as BscSignArgs)._unsignedTx;
      if (!unsignedTx) {
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "compile() requires signArgs._unsignedTx from prehash()."
        );
      }

      const signature = parseSignature(compileArgs.signature as Hex);
      const compiled = serializeTransaction(parseTransactionSafely(unsignedTx), signature);

      // Verify the signature actually recovers to the expected signer over the exact bytes
      // that were serialized — never re-derive the tx from (mutable) signArgs.transaction.
      // This closes the gap where a caller could mutate signArgs between prehash() and
      // compile() (or supply an unrelated signature) and have it silently assembled into a
      // broadcastable-looking tx, deferring the only real check to the destination node.
      //
      // On the MPC/external-signing path (identified by the presence of `_unsignedTx`,
      // threaded from prehash()), `transaction.account` is REQUIRED for this check to be
      // meaningful — skipping verification here would defeat the fix for exactly the
      // integrator this check exists to protect. Only a direct sign()-less caller of
      // compile() without any prehash() (no `_unsignedTx` at all) can omit `account`.
      const expectedAccount = compileArgs.signArgs.transaction.account;
      if (unsignedTx && !expectedAccount) {
        throw new SigningError(
          "MISSING_ACCOUNT",
          "compile() requires transaction.account (the expected signer address) to verify the external signature."
        );
      }
      if (expectedAccount !== undefined) {
        const recovered = await recoverTransactionAddress({
          serializedTransaction: compiled,
        });
        if (getAddress(recovered) !== getAddress(parseEvmAddress(expectedAccount))) {
          throw new SigningError(
            "SIGNATURE_MISMATCH",
            "compile() produced a transaction whose signature does not recover to transaction.account. " +
              "This can mean signArgs was mutated after prehash(), or the supplied signature belongs " +
              "to a different signer/transaction."
          );
        }
      }

      logger.info("SignService: transaction compiled");
      return compiled;
    },
  };
}

function parseTransactionSafely(serializedTransaction: Hex): TransactionSerializable {
  try {
    return parseTransaction(serializedTransaction) as TransactionSerializable;
  } catch {
    throw new SigningError(
      "INVALID_SIGNING_ARGS",
      "compile() could not parse signArgs._unsignedTx — it must be the unmodified value returned by prehash()."
    );
  }
}
