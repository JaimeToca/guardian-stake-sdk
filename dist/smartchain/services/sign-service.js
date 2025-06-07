"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignService = void 0;
const viem_1 = require("viem");
const staking_function_enconder_1 = require("../abi/staking-function-enconder");
const accounts_1 = require("viem/accounts");
const multicall_stake_abi_1 = require("../abi/multicall-stake-abi");
const common_1 = require("../../common");
class SignService {
    async sign(signingArgs) {
        const fee = signingArgs.fee;
        const nonce = signingArgs.nonce;
        const transaction = signingArgs.transaction;
        const unsignedTransaction = this.buildUnsignedTransaction(transaction, fee, nonce);
        let signedTransaction;
        if ((0, common_1.isSigningWithAccount)(signingArgs)) {
            const account = signingArgs.account;
            signedTransaction = await account.signTransaction(unsignedTransaction);
        }
        else if ((0, common_1.isSigningWithPrivateKey)(signingArgs)) {
            const privateKey = signingArgs.privateKey;
            const account = (0, accounts_1.privateKeyToAccount)(privateKey);
            signedTransaction = await account.signTransaction(unsignedTransaction);
        }
        else {
            throw Error("Invalid Arguments for signing");
        }
        return signedTransaction;
    }
    prehash(preHasArgs) {
        const transaction = preHasArgs.transaction;
        const fee = preHasArgs.fee;
        const nonce = preHasArgs.nonce;
        const unsignedTransaction = this.buildUnsignedTransaction(transaction, fee, nonce);
        return {
            serializedTransaction: (0, viem_1.serializeTransaction)(unsignedTransaction),
            signArgs: {
                transaction: transaction,
                fee: fee,
                nonce: nonce,
            },
        };
    }
    compile(compileArgs) {
        const transaction = compileArgs.signArgs.transaction;
        const fee = compileArgs.signArgs.fee;
        const nonce = compileArgs.signArgs.nonce;
        const r = compileArgs.r;
        const s = compileArgs.s;
        const v = compileArgs.v;
        const unsignedTransaction = this.buildUnsignedTransaction(transaction, fee, nonce);
        return (0, viem_1.serializeTransaction)({ unsignedTransaction, r, s, v });
    }
    buildUnsignedTransaction(transaction, fee, nonce) {
        const { data, amount } = this.buildCallData(transaction);
        return this.buildBaseTransaction({
            transaction,
            fee,
            nonce,
        }, amount, data);
    }
    buildBaseTransaction(signArgs, amount, data) {
        const transaction = signArgs.transaction;
        const fee = signArgs.fee;
        const nonce = signArgs.nonce;
        return {
            to: multicall_stake_abi_1.STAKING_CONTRACT,
            value: amount,
            data,
            chainId: transaction.chain.id,
            gas: fee.gasLimit,
            gasPrice: fee.gasPrice,
            nonce: nonce,
        };
    }
    buildCallData(transaction) {
        switch (transaction.type) {
            case common_1.TransactionType.Delegate: {
                const operatorAddress = this.getValidatorAddress(transaction.validator);
                return {
                    data: (0, staking_function_enconder_1.encodeDelegate)(operatorAddress),
                    amount: transaction.amount,
                };
            }
            case common_1.TransactionType.Redelegate: {
                const from = this.getValidatorAddress(transaction.fromValidator);
                const to = this.getValidatorAddress(transaction.toValidator);
                return {
                    data: (0, staking_function_enconder_1.encodeRedelegate)(from, to, transaction.amount),
                    amount: 0n,
                };
            }
            case common_1.TransactionType.Undelegate: {
                const operatorAddress = this.getValidatorAddress(transaction.validator);
                return {
                    data: (0, staking_function_enconder_1.encodeUndelegate)(operatorAddress, transaction.amount),
                    amount: 0n,
                };
            }
            case common_1.TransactionType.Claim: {
                const operatorAddress = this.getValidatorAddress(transaction.validator);
                return {
                    data: (0, staking_function_enconder_1.encodeClaim)(operatorAddress, transaction.index),
                    amount: 0n,
                };
            }
            default:
                throw new Error("Cannot build call data due to unsupported transaction type");
        }
    }
    getValidatorAddress(validator) {
        if (typeof validator === "string") {
            return validator;
        }
        else {
            return validator.operatorAddress;
        }
    }
}
exports.SignService = SignService;
//# sourceMappingURL=sign-service.js.map