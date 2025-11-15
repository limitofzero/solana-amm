use anchor_lang::prelude::*;

pub const AMM_SEED: &str = "AMM";

#[account]
#[derive(InitSpace)]
pub struct Amm {
    pub admin: Pubkey,

    pub  index: u16,

    pub  fee: u16,
}