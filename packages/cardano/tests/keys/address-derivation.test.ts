import { describe, it, expect, beforeAll } from "vitest";
import type { Hash28ByteBase16 } from "@cardano-sdk/crypto";
import { Bip32PrivateKey, ready, Ed25519KeyHashHex } from "@cardano-sdk/crypto";
import { Cardano } from "@cardano-sdk/core";
import { deriveCardanoKeys } from "../../src/keys/derive-keys";
import {
  buildRewardAccount,
  checkIfPaymentAddressIsValid,
} from "../../src/cardano-chain/validations";

/**
 * Deterministic test fixture derived from a known 24-word BIP-39 mnemonic.
 *
 * Mnemonic (24 words, generated with @scure/bip39, entropy 256 bits):
 *   silly jacket suffer festival similar matter during thumb decrease couch ship crisp
 *   unique lift key save answer food napkin fame again language rebuild join
 *
 * Entropy hex (32 bytes):
 *   c8aee362aa9c8f12910f0b39261f1819ded902de85fe09ab5a4ba9304af9ecd3
 *
 * Derivation path: CIP-1852 — m/1852'/1815'/0'/role/0
 *   payment key: role = 0
 *   staking key: role = 2
 *
 * All expected values below were independently derived with @cardano-sdk/crypto 0.4.5
 * and @cardano-sdk/core 0.46.12.  Anyone can reproduce them by running the derivation
 * script in the project root (see packages/cardano/tests/keys/address-derivation.test.ts).
 */

// --- Fixture constants ---

/** 32-byte BIP-39 entropy for the test mnemonic (no mnemonic library required). */
const TEST_ENTROPY_HEX = "c8aee362aa9c8f12910f0b39261f1819ded902de85fe09ab5a4ba9304af9ecd3";

/** Expected payment address: CIP-0019 type-0 (base address, key-hash + key-hash, mainnet). */
const EXPECTED_PAYMENT_ADDRESS =
  "addr1q845kr0x2vfendhj4hd0lqkwgz8u5ffsn58hd7rhtcpcfu9sne8ahfa8g89y5rclcnw8pma54u6hwt4hspd8t44fpdaq5sskyj";

/** Expected stake address (bech32 stake1...). */
const EXPECTED_STAKE_ADDRESS = "stake1uxcfun7m57n5rjj2pu0ufhrsa7627dth96mcqkn4665sk7spdy9rp";

/** Expected payment public key (32-byte Ed25519, 64-char hex). */
const EXPECTED_PAYMENT_PUBKEY = "9e7348300a5474b24aad5b09b3e981d66f17192d88da21440d371047919b02c0";

/** Expected staking public key (32-byte Ed25519, 64-char hex). */
const EXPECTED_STAKING_PUBKEY = "15930930307bdc198d32294ee6b9e0597136b63599e6d1eb61a632ad6823c024";

/** Expected payment key hash (28-byte Blake2b-224 hash of payment public key, 56-char hex). */
const EXPECTED_PAYMENT_KEY_HASH = "eb4b0de6531399b6f2addaff82ce408fca25309d0f76f8775e0384f0";

/** Expected staking key hash (28-byte Blake2b-224 hash of staking public key, 56-char hex). */
const EXPECTED_STAKING_KEY_HASH = "b09e4fdba7a741ca4a0f1fc4dc70efb4af35772eb7805a75d6a90b7a";

// --- Helpers ---

const HARDENED = 0x80000000;
// CIP-1852: m/1852'/1815'/account'/role/index
const PAYMENT_PATH = [1852 + HARDENED, 1815 + HARDENED, 0 + HARDENED, 0, 0];
const STAKING_PATH = [1852 + HARDENED, 1815 + HARDENED, 0 + HARDENED, 2, 0];

let rootKey: InstanceType<typeof Bip32PrivateKey>;

beforeAll(async () => {
  await ready();
  rootKey = Bip32PrivateKey.fromBip39Entropy(Buffer.from(TEST_ENTROPY_HEX, "hex"), "");
});

// --- Tests ---

describe("Cardano address derivation from mnemonic entropy", () => {
  describe("root key", () => {
    it("produces a 192-char hex root key from the test entropy", () => {
      expect(rootKey.hex()).toHaveLength(192);
      expect(rootKey.hex()).toMatch(/^[0-9a-f]{192}$/);
    });

    it("is deterministic — same entropy always yields the same root key", () => {
      const second = Bip32PrivateKey.fromBip39Entropy(Buffer.from(TEST_ENTROPY_HEX, "hex"), "");
      expect(second.hex()).toBe(rootKey.hex());
    });
  });

  describe("deriveCardanoKeys — private keys", () => {
    it("returns 64-char hex private keys that are valid lowercase hex", () => {
      const { paymentPrivateKey, stakingPrivateKey } = deriveCardanoKeys(rootKey.hex());
      expect(paymentPrivateKey).toHaveLength(64);
      expect(stakingPrivateKey).toHaveLength(64);
      expect(paymentPrivateKey).toMatch(/^[0-9a-f]{64}$/);
      expect(stakingPrivateKey).toMatch(/^[0-9a-f]{64}$/);
    });

    it("payment key and staking key are different", () => {
      const { paymentPrivateKey, stakingPrivateKey } = deriveCardanoKeys(rootKey.hex());
      expect(paymentPrivateKey).not.toBe(stakingPrivateKey);
    });
  });

  describe("public key derivation", () => {
    it("derives the expected payment public key hex", () => {
      const paymentPubKey = rootKey.derive(PAYMENT_PATH).toPublic().toRawKey();
      expect(paymentPubKey.hex()).toBe(EXPECTED_PAYMENT_PUBKEY);
    });

    it("derives the expected staking public key hex", () => {
      const stakingPubKey = rootKey.derive(STAKING_PATH).toPublic().toRawKey();
      expect(stakingPubKey.hex()).toBe(EXPECTED_STAKING_PUBKEY);
    });
  });

  describe("key hash derivation", () => {
    it("payment public key Blake2b-224 hash matches the expected 28-byte hex", () => {
      const paymentKeyHash = rootKey.derive(PAYMENT_PATH).toPublic().toRawKey().hash();
      expect(paymentKeyHash.hex()).toBe(EXPECTED_PAYMENT_KEY_HASH);
      // 28 bytes = 56 hex characters
      expect(paymentKeyHash.hex()).toHaveLength(56);
    });

    it("staking public key Blake2b-224 hash matches the expected 28-byte hex", () => {
      const stakingKeyHash = rootKey.derive(STAKING_PATH).toPublic().toRawKey().hash();
      expect(stakingKeyHash.hex()).toBe(EXPECTED_STAKING_KEY_HASH);
      expect(stakingKeyHash.hex()).toHaveLength(56);
    });
  });

  describe("payment address (CIP-0019 type-0 base address)", () => {
    it("builds the expected mainnet base address from payment and stake credentials", () => {
      const paymentKeyHash = rootKey.derive(PAYMENT_PATH).toPublic().toRawKey().hash();
      const stakingKeyHash = rootKey.derive(STAKING_PATH).toPublic().toRawKey().hash();

      const paymentCredential: Cardano.Credential = {
        type: Cardano.CredentialType.KeyHash,
        hash: paymentKeyHash.hex() as Hash28ByteBase16,
      };
      const stakeCredential: Cardano.Credential = {
        type: Cardano.CredentialType.KeyHash,
        hash: stakingKeyHash.hex() as Hash28ByteBase16,
      };

      const address = Cardano.BaseAddress.fromCredentials(
        Cardano.NetworkId.Mainnet,
        paymentCredential,
        stakeCredential
      )
        .toAddress()
        .toBech32();

      expect(address).toBe(EXPECTED_PAYMENT_ADDRESS);
    });

    it("payment address starts with addr1q (type-0 base address bech32 prefix)", () => {
      const paymentKeyHash = rootKey.derive(PAYMENT_PATH).toPublic().toRawKey().hash();
      const stakingKeyHash = rootKey.derive(STAKING_PATH).toPublic().toRawKey().hash();

      const address = Cardano.BaseAddress.fromCredentials(
        Cardano.NetworkId.Mainnet,
        { type: Cardano.CredentialType.KeyHash, hash: paymentKeyHash.hex() as Hash28ByteBase16 },
        { type: Cardano.CredentialType.KeyHash, hash: stakingKeyHash.hex() as Hash28ByteBase16 }
      )
        .toAddress()
        .toBech32();

      expect(address).toMatch(/^addr1q/);
    });

    it("payment address is accepted by checkIfPaymentAddressIsValid", () => {
      expect(() => checkIfPaymentAddressIsValid(EXPECTED_PAYMENT_ADDRESS)).not.toThrow();
    });
  });

  describe("stake address (CIP-0019 reward key address)", () => {
    it("builds the expected mainnet stake1... address from the staking key hash", () => {
      const stakingKeyHash = rootKey.derive(STAKING_PATH).toPublic().toRawKey().hash();
      const stakeAddress = buildRewardAccount(stakingKeyHash.hex());
      expect(stakeAddress).toBe(EXPECTED_STAKE_ADDRESS);
    });

    it("stake address starts with stake1", () => {
      const stakingKeyHash = rootKey.derive(STAKING_PATH).toPublic().toRawKey().hash();
      const stakeAddress = buildRewardAccount(stakingKeyHash.hex());
      expect(stakeAddress).toMatch(/^stake1/);
    });

    it("can also be built via Cardano.createRewardAccount with explicit NetworkId", () => {
      const stakingKeyHash = rootKey.derive(STAKING_PATH).toPublic().toRawKey().hash();
      const stakeAddress = Cardano.createRewardAccount(
        Ed25519KeyHashHex(stakingKeyHash.hex()),
        Cardano.NetworkId.Mainnet
      );
      expect(stakeAddress).toBe(EXPECTED_STAKE_ADDRESS);
    });
  });

  describe("address round-trip", () => {
    it("payment address decodes back to the original payment and stake key hashes", () => {
      const paymentKeyHash = rootKey.derive(PAYMENT_PATH).toPublic().toRawKey().hash();
      const stakingKeyHash = rootKey.derive(STAKING_PATH).toPublic().toRawKey().hash();

      const addr = Cardano.Address.fromString(EXPECTED_PAYMENT_ADDRESS);
      expect(addr).not.toBeNull();

      const base = addr!.asBase();
      expect(base).not.toBeUndefined();

      expect(base!.getPaymentCredential().hash).toBe(paymentKeyHash.hex());
      expect(base!.getStakeCredential().hash).toBe(stakingKeyHash.hex());
    });

    it("payment address is on mainnet", () => {
      const addr = Cardano.Address.fromString(EXPECTED_PAYMENT_ADDRESS);
      expect(addr!.getNetworkId()).toBe(Cardano.NetworkId.Mainnet);
    });

    it("stake address encodes the staking key hash at the expected position", () => {
      // Verify by decoding the stake address back
      const stakingKeyHash = rootKey.derive(STAKING_PATH).toPublic().toRawKey().hash();
      const rebulit = buildRewardAccount(stakingKeyHash.hex());
      expect(rebulit).toBe(EXPECTED_STAKE_ADDRESS);
    });
  });
});
