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
  /** Absolute slot number after which the transaction is invalid. */
  ttl?: number;
  certificates?: CardanoCertificate[];
  /** Reward withdrawals: stake1... bech32 → lovelaces */
  withdrawals?: Map<string, bigint>;
}

export interface TxWitness {
  vkeyHex: string; // 64-char hex (32-byte Ed25519 public key)
  sigHex: string; // 128-char hex (64-byte Ed25519 signature)
}
