use anchor_lang::prelude::*;

pub const AMM_SEED: &str = "AMM";

pub  const AMM_POOL_SEED: &str = "AMM_POOL";

pub  const AMM_POOL_AUTHORITY_SEED: &str = "AMM_POOL_AUTHORITY";
pub  const AMM_MINT_LIQUIDITY_SEED: &str = "AMM_MINT_LIQUIDITY";

#[account]
#[derive(InitSpace)]
pub struct Amm {
    pub admin: Pubkey,

    pub  index: u16,

    pub  fee: u16,
}

#[account]
#[derive(InitSpace)]
pub struct AmmPool {
    pub  amm: Pubkey,
    pub  mint_a: Pubkey,
    pub  mint_b: Pubkey,
}