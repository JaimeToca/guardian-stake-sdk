import { parseUnits, toHex } from "viem";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { GuardianSDK, BSC_CHAIN, TransactionType, bsc, ConsoleLogger, PrivateKey, Curve } from "@guardian/bsc";
import type { DelegateTransaction, RedelegateTransaction, UndelegateTransaction } from "@guardian/bsc";

const sdk = new GuardianSDK([                                                                                                                                                                                      
    bsc({                                                                                                                                                                                                            
      rpcUrl: "https://bsc.twnodes.com",                                                                                                                                                                           
      logger: new ConsoleLogger("debug"),
    }),                                                                                                                                                                                                              
  ]);

/**
 * Demonstrates how to read staking data for a given address:
 * - getBalances: available, staked, pending, and claimable BNB amounts
 * - getValidators: full list of registered validators on BSC
 * - getDelegations: active and pending delegations, including which validator
 *   each position is staked with, its current BNB value, and its status
 */
async function sample_check_delegations() {
   // Fetch balances
   const balances = await sdk.getBalances(
    BSC_CHAIN,
    "0x166b6b8BFD51655cEA080Cc2C42fcB858645d29b"
   );
   console.log("Balances:", balances);

   // Fetch validators
   const validators = await sdk.getValidators(BSC_CHAIN);
   console.log("Validators:", validators);

   // Fetch delegations for an address
  const delegations = await sdk.getDelegations(
    BSC_CHAIN,
    "0x166b6b8BFD51655cEA080Cc2C42fcB858645d29b"
  );
  for (const delegation of delegations.delegations) {
    console.log(`Validator: ${delegation.validator.name} (${delegation.validator.operatorAddress}) | Status: ${delegation.status} | Amount: ${delegation.amount}`);
  }
}

/**
 * Demonstrates a full delegate flow:
 * 1. Pick a validator from the active set
 * 2. Estimate the gas fee for the transaction
 * 3. Fetch the current nonce for the sender
 * 4. Sign the transaction with a private key
 *
 * The resulting rawTx is a signed hex string ready to broadcast to the network.
 */
async function sample_delegate_transaction() {
  const MNEMONIC = "<use your memonic>"; 
  const PRIVATE_KEY = privateKeyFromMnemonic(MNEMONIC);
  const ADDRESS = "0x33CA16e244c86484c2637F290419af6808ac12B3";
  const AMOUNT = parseUnits("1.01", 18); // 1.01 BNB

   // Fetch balances
   const balances = await sdk.getBalances(
    BSC_CHAIN,
    ADDRESS
   );
   console.log("Balances:", balances);

  // Pick a validator — use getValidators() to browse the full set
  const validators = await sdk.getValidators(BSC_CHAIN);
  const validator = validators.find((v) => v.name === "Binance Staking") ?? validators[0];
  console.log(`Delegating to: ${validator.name} (${validator.operatorAddress})`);

  // Build the transaction object
  const transaction: DelegateTransaction = {
    type: TransactionType.Delegate,
    chain: BSC_CHAIN,
    amount: AMOUNT,
    account: ADDRESS,
    isMaxAmount: false,
    validator,
  };

  // Estimate fee
  const fee = await sdk.estimateFee(transaction);
  console.log(`Fee: ${fee.total} wei (gasPrice: ${fee.gasPrice}, gasLimit: ${fee.gasLimit})`);

  // Fetch nonce
  const nonce = await sdk.getNonce(BSC_CHAIN, ADDRESS);
  console.log(`Nonce: ${nonce}`);

  // Sign — returns a signed raw transaction hex string ready to broadcast
  const rawTx = await sdk.sign({ transaction, fee, nonce, privateKey: PRIVATE_KEY });
  console.log(`Signed tx: ${rawTx}`);

  // broadcast
  const txHash = await sdk.broadcast(BSC_CHAIN, rawTx);
  console.log(`Broadcasted tx hash: ${txHash}`);
}

/**
 * Demonstrates a full redelegate flow:
 * 1. Pick a new validator from the active set
 * 2. Estimate the gas fee for the transaction
 * 3. Fetch the current nonce for the sender
 * 4. Sign the transaction with a private key
 *
 * The resulting rawTx is a signed hex string ready to broadcast to the network.
 */
async function sample_redelegate_transaction() {
  const MNEMONIC = "<use your memonic>"; 
  const PRIVATE_KEY = privateKeyFromMnemonic(MNEMONIC);
  const ADDRESS = "0x33CA16e244c86484c2637F290419af6808ac12B3";
  const AMOUNT = parseUnits("1.01", 18); // 1.01 BNB

  // Pick a validator — use getValidators() to browse the full set
  const validators = await sdk.getValidators(BSC_CHAIN);

  // From Validator A to Validator B
  const fromValidator = validators.find((v) => v.name === "Binance Staking") ?? validators[0];
  const toValidator = validators.find((v) => v.name === "Ankr Staking") ?? validators[1];
  console.log(`Redelegating from: ${fromValidator.name} (${fromValidator.operatorAddress})`);
  console.log(`Redelegating to: ${toValidator.name} (${toValidator.operatorAddress})`);

  // Build the transaction object
  const transaction: RedelegateTransaction = {
    type: TransactionType.Redelegate,
    chain: BSC_CHAIN,
    amount: AMOUNT,
    account: ADDRESS,
    isMaxAmount: true, // IMPORTANT to set for max amount
    fromValidator: fromValidator,
    toValidator: toValidator,
  };

  // Estimate fee
  const fee = await sdk.estimateFee(transaction);
  console.log(`Fee: ${fee.total} wei (gasPrice: ${fee.gasPrice}, gasLimit: ${fee.gasLimit})`);

  // Fetch nonce
  const nonce = await sdk.getNonce(BSC_CHAIN, ADDRESS);
  console.log(`Nonce: ${nonce}`);

  // Sign — returns a signed raw transaction hex string ready to broadcast
  const rawTx = await sdk.sign({ transaction, fee, nonce, privateKey: PRIVATE_KEY });
  console.log(`Signed tx: ${rawTx}`);

  // broadcast
  const txHash = await sdk.broadcast(BSC_CHAIN, rawTx);
  console.log(`Broadcasted tx hash: ${txHash}`);
}

/**
 * Demonstrates a full undelegate flow:
 * 1. Pick a validator from the active set
 * 2. Estimate the gas fee for the transaction
 * 3. Fetch the current nonce for the sender
 * 4. Sign the transaction with a private key
 *
 * The resulting rawTx is a signed hex string ready to broadcast to the network.
 */
async function sample_undelegate_transaction() {
  const MNEMONIC = "<use your memonic>"; 
  const PRIVATE_KEY = privateKeyFromMnemonic(MNEMONIC);
  const ADDRESS = "0x33CA16e244c86484c2637F290419af6808ac12B3";
  const AMOUNT = parseUnits("1.01", 18); // 1.01 BNB

  // Pick a validator — use getValidators() to browse the full set
  const validators = await sdk.getValidators(BSC_CHAIN);

  // From Validator A to Validator B
  const validator = validators.find((v) => v.name === "Ankr Staking") ?? validators[1];
  console.log(`Undelegating from: ${validator.name} (${validator.operatorAddress})`);

  // Build the undelegatetransaction object
  const transaction: UndelegateTransaction = {
    type: TransactionType.Undelegate,
    chain: BSC_CHAIN,
    amount: AMOUNT,
    account: ADDRESS,
    isMaxAmount: true, 
    validator: validator,
  };

  // Estimate fee
  const fee = await sdk.estimateFee(transaction);
  console.log(`Fee: ${fee.total} wei (gasPrice: ${fee.gasPrice}, gasLimit: ${fee.gasLimit})`);

  // Fetch nonce
  const nonce = await sdk.getNonce(BSC_CHAIN, ADDRESS);
  console.log(`Nonce: ${nonce}`);

  // Sign — returns a signed raw transaction hex string ready to broadcast
  const rawTx = await sdk.sign({ transaction, fee, nonce, privateKey: PRIVATE_KEY });
  console.log(`Signed tx: ${rawTx}`);

  // broadcast
  const txHash = await sdk.broadcast(BSC_CHAIN, rawTx);
  console.log(`Broadcasted tx hash: ${txHash}`);
}

/**
 * This does not belong to Guardian SDK, it is up to the consumer to implement private key management and signing. 
 * In this particular case, given a mnemonic, we derive the private key using the popular bip39 and bip32 libraries. 
 * The resulting private key is then used to sign transactions with the Guardian SDK.
 *
 * @scure/bip32 and @scure/bip39 ship as transitive dependencies of viem —
 * no extra packages required.
 */
function privateKeyFromMnemonic(mnemonic: string, addressIndex = 0): PrivateKey {
  const seed = mnemonicToSeedSync(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(`m/44'/60'/0'/0/${addressIndex}`);
  if (!child.privateKey) throw new Error("Failed to derive private key");
  const hex = toHex(child.privateKey);
  return PrivateKey.from(hex, Curve.Secp256k1);
}

sample_undelegate_transaction();
