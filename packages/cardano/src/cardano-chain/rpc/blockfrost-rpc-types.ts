/** Blockfrost /pools/extended response item */
export interface BlockfrostPoolExtended {
  pool_id: string; // bech32, e.g. pool1...
  hex: string; // 56-char hex pool ID
  vrf_key: string;
  blocks_minted: number;
  blocks_epoch: number;
  live_stake: string; // lovelaces
  live_size: number; // fraction of total stake (0-1)
  live_saturation: number; // saturation (0-1, >1 = oversaturated)
  live_delegators: number;
  active_stake: string; // lovelaces
  active_size: number;
  declared_pledge: string; // lovelaces
  live_pledge: string; // lovelaces
  margin_cost: number; // 0-1, pool's variable fee
  fixed_cost: string; // lovelaces per epoch
  reward_account: string; // stake address
  owners: string[];
  registration: string[];
  retirement: string[];
}

/** Blockfrost /pools/{pool_id}/metadata */
export interface BlockfrostPoolMetadata {
  pool_id: string;
  hex: string;
  url: string | null;
  hash: string | null;
  ticker: string | null;
  name: string | null;
  description: string | null;
  homepage: string | null;
}

/** Blockfrost /accounts/{stake_address} */
export interface BlockfrostAccount {
  stake_address: string;
  active: boolean;
  active_epoch: number | null;
  controlled_amount: string; // total lovelaces controlled by this stake key
  rewards_sum: string; // total rewards earned (lovelaces)
  withdrawals_sum: string; // total rewards withdrawn (lovelaces)
  reserves_sum: string;
  treasury_sum: string;
  withdrawable_amount: string; // lovelaces available to withdraw now
  pool_id: string | null; // currently delegated pool bech32 ID, null if not delegating
}

/** Single UTXO from /addresses/{address}/utxos */
export interface BlockfrostUtxo {
  tx_hash: string; // 64-char hex
  tx_index: number;
  output_index: number;
  amount: BlockfrostAssetAmount[];
  block: string;
  data_hash: string | null;
  inline_datum: string | null;
  reference_script_hash: string | null;
}

export interface BlockfrostAssetAmount {
  unit: string; // "lovelace" or policy_id + asset_name
  quantity: string;
}

/** Blockfrost /epochs/latest/parameters */
export interface BlockfrostProtocolParams {
  epoch: number;
  min_fee_a: number; // lovelaces per tx byte (e.g. 44)
  min_fee_b: number; // constant lovelaces added to fee (e.g. 155381)
  max_block_size: number;
  max_tx_size: number;
  key_deposit: string; // lovelaces required to register stake key (e.g. "2000000")
  pool_deposit: string;
  e_max: number;
  n_opt: number; // k parameter, target number of pools
  a0: number;
  rho: number; // monetary expansion rate
  tau: number; // treasury growth rate
  decentralisation_param: number;
  protocol_major_ver: number;
  protocol_minor_ver: number;
  min_pool_cost: string;
  coins_per_utxo_size: string | null;
}

/** Blockfrost /blocks/latest */
export interface BlockfrostBlock {
  slot: number;
}

/** Blockfrost /network — for total stake info */
export interface BlockfrostNetwork {
  supply: {
    max: string;
    total: string;
    circulating: string;
    locked: string;
    treasury: string;
    reserves: string;
  };
  stake: {
    live: string; // total staked lovelaces
    active: string;
  };
}
