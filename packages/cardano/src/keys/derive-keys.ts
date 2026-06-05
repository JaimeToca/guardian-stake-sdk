import { Bip32PrivateKey, type Bip32PrivateKeyHex } from "@cardano-sdk/crypto";

// Hardened derivation offset — must use addition, not bitwise OR:
// JS bitwise ops work on signed int32, so `n | 0x80000000` produces a negative number
const HARDENED = 0x80000000;

// CIP-1852: m/1852'/1815'/account'/role/index
const PAYMENT_PATH = [1852 + HARDENED, 1815 + HARDENED, 0 + HARDENED, 0, 0];
const STAKING_PATH = [1852 + HARDENED, 1815 + HARDENED, 0 + HARDENED, 2, 0];

export interface CardanoDerivedKeys {
  paymentPrivateKey: string;
  stakingPrivateKey: string;
}

/**
 * Derives the payment and staking private keys from a BIP32 root key.
 *
 * The root key is a 96-byte BIP32-Ed25519 key encoded as a 192-character hex string.
 * Derivation follows CIP-1852 (account 0, index 0).
 *
 * The returned keys are 32-byte Ed25519 scalars (64-char hex), ready to pass
 * directly to `sdk.sign({ paymentPrivateKey, stakingPrivateKey, ... })`.
 */
export function deriveCardanoKeys(rootKeyHex: string): CardanoDerivedKeys {
  if (rootKeyHex.length !== 192) {
    throw new Error(
      `Invalid root key length: expected 192 hex characters (96 bytes), got ${rootKeyHex.length}.`
    );
  }

  const root = Bip32PrivateKey.fromHex(rootKeyHex as Bip32PrivateKeyHex);

  // toRawKey() returns a 64-byte extended Ed25519 key; slice to the first 32 bytes (the scalar)
  const paymentPrivateKey = root.derive(PAYMENT_PATH).toRawKey().hex().slice(0, 64);
  const stakingPrivateKey = root.derive(STAKING_PATH).toRawKey().hex().slice(0, 64);

  return { paymentPrivateKey, stakingPrivateKey };
}
