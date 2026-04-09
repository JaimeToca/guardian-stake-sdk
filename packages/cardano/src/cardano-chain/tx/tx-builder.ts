/**
 * Cardano transaction builder powered by @cardano-sdk/core.
 *
 * Assembles Serialization.TransactionBody objects from higher-level params
 * and serialises the full signed transaction to a CBOR hex string ready for
 * broadcast via Blockfrost.
 */

import { Cardano, Serialization } from "@cardano-sdk/core";
import { Ed25519KeyHashHex } from "@cardano-sdk/crypto";

const {
  Certificate,
  StakeDelegation,
  StakeRegistration,
  StakeDeregistration,
  TransactionBody,
  TransactionInput,
  TransactionOutput,
  Value,
  Transaction,
  TransactionWitnessSet,
  VkeyWitness,
  CborSet,
} = Serialization;

// ─── Public types ─────────────────────────────────────────────────────────────

export type CardanoCertificate =
  | { type: "StakeRegistration"; stakeKeyHashHex: string }
  | { type: "StakeDeregistration"; stakeKeyHashHex: string }
  | { type: "StakeDelegation"; stakeKeyHashHex: string; poolKeyHashHex: string };

export interface TxInput {
  txHashHex: string; // 64-char hex (32-byte tx hash)
  index: number;
}

export interface TxBodyParams {
  inputs: TxInput[];
  outputAddress: string; // bech32 payment address
  outputLovelaces: bigint;
  fee: bigint;
  certificates?: CardanoCertificate[];
  /** Reward withdrawals: stake1... bech32 → lovelaces */
  withdrawals?: Map<string, bigint>;
}

export interface TxWitness {
  vkeyHex: string; // 64-char hex (32-byte Ed25519 public key)
  sigHex: string; // 128-char hex (64-byte Ed25519 signature)
}

// ─── Public functions ─────────────────────────────────────────────────────────

/** Builds a TransactionBody from the given params. */
export function buildTransactionBody(params: TxBodyParams): Serialization.TransactionBody {
  const inputsSet = CborSet.fromCore(
    params.inputs.map((i) =>
      new TransactionInput(Cardano.TransactionId(i.txHashHex), BigInt(i.index)).toCore()
    ),
    TransactionInput.fromCore
  );

  const addr = Cardano.Address.fromString(params.outputAddress);
  if (!addr) throw new Error(`Invalid Cardano address: ${params.outputAddress}`);

  const output = new TransactionOutput(addr, Value.fromCore({ coins: params.outputLovelaces }));
  const body = new TransactionBody(inputsSet, [output], params.fee);

  if (params.certificates && params.certificates.length > 0) {
    const certsSet = CborSet.fromCore(
      params.certificates.map((c) => buildCertificate(c).toCore()),
      Certificate.fromCore
    );
    body.setCerts(certsSet);
  }

  if (params.withdrawals && params.withdrawals.size > 0) {
    body.setWithdrawals(
      params.withdrawals as Map<Cardano.RewardAccount, Cardano.Lovelace>
    );
  }

  return body;
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
      witnesses.map((w) => [w.vkeyHex, w.sigHex] as [string, string]),
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

function buildCertificate(cert: CardanoCertificate): Serialization.Certificate {
  const stakeCred = {
    type: Cardano.CredentialType.KeyHash,
    hash: cert.stakeKeyHashHex,
  };

  switch (cert.type) {
    case "StakeRegistration":
      return Certificate.newStakeRegistration(new StakeRegistration(stakeCred));
    case "StakeDeregistration":
      return Certificate.newStakeDeregistration(new StakeDeregistration(stakeCred));
    case "StakeDelegation":
      return Certificate.newStakeDelegation(
        new StakeDelegation(stakeCred, Ed25519KeyHashHex(cert.poolKeyHashHex))
      );
  }
}
