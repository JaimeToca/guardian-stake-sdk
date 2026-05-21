/**
 * Cardano transaction builder powered by @cardano-sdk/core.
 *
 * Assembles Cardano.TxBody plain objects and converts them to
 * Serialization.TransactionBody via fromCore(), letting the SDK handle all
 * CBOR encoding details.  The full signed transaction is serialised to a
 * CBOR hex string ready for broadcast via Blockfrost.
 */

import { Cardano, Serialization } from "@cardano-sdk/core";
import {
  Ed25519KeyHashHex,
  Ed25519PublicKeyHex,
  Ed25519SignatureHex,
  Hash28ByteBase16,
} from "@cardano-sdk/crypto";
import type { CardanoCertificate, TxBodyParams, TxWitness } from "./tx-types";

export type { CardanoCertificate, TxInput, TxBodyParams, TxWitness } from "./tx-types";

const { Transaction, TransactionWitnessSet, VkeyWitness, CborSet } = Serialization;

/** Builds a TransactionBody from the given params. */
export function buildTransactionBody(params: TxBodyParams): Serialization.TransactionBody {
  const coreBody: Cardano.TxBody = {
    inputs: params.inputs.map((i) => ({
      txId: Cardano.TransactionId(i.txHashHex),
      index: i.index,
    })),
    outputs: [
      {
        address: Cardano.PaymentAddress(params.outputAddress),
        value: {
          coins: params.outputLovelaces,
          ...(params.outputAssets?.size && {
            assets: new Map(
              [...params.outputAssets.entries()].map(([id, qty]) => [Cardano.AssetId(id), qty])
            ),
          }),
        },
      },
    ],
    fee: params.fee,
  };

  if (params.ttl !== undefined) {
    coreBody.validityInterval = { invalidHereafter: Cardano.Slot(params.ttl) };
  }

  if (params.certificates?.length) {
    coreBody.certificates = params.certificates.map(buildCoreCertificate);
  }

  if (params.withdrawals?.size) {
    coreBody.withdrawals = Array.from(params.withdrawals.entries()).map(
      ([stakeAddress, quantity]) => ({
        stakeAddress: stakeAddress as Cardano.RewardAccount,
        quantity,
      })
    );
  }

  return Serialization.TransactionBody.fromCore(coreBody);
}

/**
 * Builds the full signed transaction and returns it as a CBOR hex string.
 * This is the output that gets submitted to the chain.
 */
export function buildSignedTransaction(
  body: Serialization.TransactionBody,
  witnesses: TxWitness[]
): string {
  const witnessSet = new TransactionWitnessSet();
  if (witnesses.length > 0) {
    const vkeys = CborSet.fromCore(
      witnesses.map((w): [Ed25519PublicKeyHex, Ed25519SignatureHex] => [
        Ed25519PublicKeyHex(w.vkeyHex),
        Ed25519SignatureHex(w.sigHex),
      ]),
      VkeyWitness.fromCore
    );
    witnessSet.setVkeys(vkeys);
  }
  return new Transaction(body, witnessSet).toCbor();
}

/**
 * Builds a mock transaction (zero-filled witnesses) for fee size estimation.
 * Returns the CBOR hex string — use `.length / 2` for the byte count.
 */
export function buildMockTransaction(params: TxBodyParams, witnessCount: number): string {
  const body = buildTransactionBody(params);
  const mockWitnesses: TxWitness[] = Array.from({ length: witnessCount }, () => ({
    vkeyHex: "00".repeat(32),
    sigHex: "00".repeat(64),
  }));
  return buildSignedTransaction(body, mockWitnesses);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildCoreCertificate(cert: CardanoCertificate): Cardano.Certificate {
  const stakeCredential: Cardano.Credential = {
    type: Cardano.CredentialType.KeyHash,
    hash: Hash28ByteBase16(cert.stakeKeyHashHex),
  };

  switch (cert.type) {
    case "StakeRegistration":
      return {
        __typename: Cardano.CertificateType.StakeRegistration,
        stakeCredential,
      };
    case "StakeDeregistration":
      return {
        __typename: Cardano.CertificateType.StakeDeregistration,
        stakeCredential,
      };
    case "StakeDelegation":
      return {
        __typename: Cardano.CertificateType.StakeDelegation,
        stakeCredential,
        poolId: Cardano.PoolId.fromKeyHash(Ed25519KeyHashHex(cert.poolKeyHashHex)),
      };
  }
}
