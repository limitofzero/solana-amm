use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{
    states::Amm,
    states::AMM_POOL_SEED,
    states::AMM_SEED,
    states::AMM_POOL_AUTHORITY_SEED,
    states::AMM_MINT_LIQUIDITY_SEED,
    states::AmmPool,
    errors::AmmError,
};

pub  fn create_pool(ctx: Context<CreatePool>,) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let mint_a = ctx.accounts.mint_a.key();
    let mint_b = ctx.accounts.mint_b.key();
    require!(mint_a != mint_b, AmmError::MintAccountsAreEqual);

    pool.amm = ctx.accounts.amm.key();
    pool.mint_a = mint_a;
    pool.mint_b = mint_b;

    Ok(())
}

#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(
       seeds = [AMM_SEED.as_bytes(), amm.index.to_le_bytes().as_ref()],
        bump
    )]
    pub  amm: Box<Account<'info, Amm>>,

    #[account(
        init,
        payer = signer,
        seeds = [AMM_POOL_SEED.as_bytes(), amm.key().as_ref(), mint_a.key().as_ref(), mint_b.key().as_ref()],
        bump,
        space = 8 + AmmPool::INIT_SPACE,
    )]
    pub pool: Box<Account<'info, AmmPool>>,

    #[account(
        init,
        payer = signer,
        seeds = [AMM_MINT_LIQUIDITY_SEED.as_bytes(), amm.key().as_ref(), mint_a.key().as_ref(), mint_b.key().as_ref()],
        bump,
        mint::decimals = 6,
        mint::authority = authority,
    )]
    pub  mint_liquidity: Box<Account<'info, Mint>>,

    #[account(
    init,
    payer = signer,
    associated_token::mint = mint_a,
    associated_token::authority = authority,
    )]
    pub  pool_account_a: Box<Account<'info, TokenAccount>>,

    #[account(
    init,
    payer = signer,
    associated_token::mint = mint_b,
    associated_token::authority = authority,
    )]
    pub  pool_account_b: Box<Account<'info, TokenAccount>>,

    /// CHECK readonly
    #[account(
        seeds = [AMM_POOL_AUTHORITY_SEED.as_bytes(), mint_a.key().as_ref(), mint_b.key().as_ref()],
        bump,
    )]
    pub authority: AccountInfo<'info>,

    pub mint_a: Box<Account<'info, Mint>>,

    pub mint_b: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub  signer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}