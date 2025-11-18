use crate::states::{AmmPool, AMM_MINT_LIQUIDITY_SEED, AMM_POOL_AUTHORITY_SEED, AMM_POOL_SEED};
use anchor_lang::prelude::*;

use crate::errors::AmmError;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{burn, transfer_checked, Burn, Mint, Token, TokenAccount, TransferChecked};

pub fn withdraw_liquidity(ctx: Context<WithdrawLiquidity>, lp_amount_to_burn: u64) -> Result<()> {
    require!(lp_amount_to_burn > 0, AmmError::AmountIsZero);
    let total_lp = ctx.accounts.mint_liquidity.supply;
    require!(total_lp > 0, AmmError::LpSupplyIsZero);

    let depositor_lp_account = &ctx.accounts.depositor_account_liquidity;

    let depositor_lp_balance = depositor_lp_account.amount;
    require!(
        depositor_lp_balance >= lp_amount_to_burn,
        AmmError::InsufficientLpBalance
    );

    let pool_a = &ctx.accounts.pool_account_a;
    let pool_b = &ctx.accounts.pool_account_b;

    let reserve_a = pool_a.amount;
    let reserve_b = pool_b.amount;

    let (amount_a_out, amount_b_out) =
        calculate_out_amounts(lp_amount_to_burn, total_lp, reserve_a, reserve_b)?;

    let depositor = &ctx.accounts.depositor;

    // burn lp tokens
    let cpi_burn = Burn {
        mint: ctx.accounts.mint_liquidity.to_account_info(),
        from: depositor_lp_account.to_account_info(),
        authority: depositor.to_account_info(),
    };

    let cpi_program = &ctx.accounts.token_program;
    let cpi_context = CpiContext::new(cpi_program.to_account_info(), cpi_burn);
    burn(cpi_context, lp_amount_to_burn)?;

    let authority = &ctx.accounts.authority;
    let authority_signer_seeds: &[&[&[u8]]] = &[&[
        &AMM_POOL_AUTHORITY_SEED.as_bytes(),
        &ctx.accounts.pool.amm.to_bytes(),
        &ctx.accounts.mint_a.key().to_bytes(),
        &ctx.accounts.mint_b.key().to_bytes(),
        &[ctx.bumps.authority],
    ]];

    // withdraw amount_a_out
    let mint_a = &ctx.accounts.mint_a;
    let cpi_accounts = TransferChecked {
        mint: mint_a.to_account_info(),
        from: pool_a.to_account_info(),
        to: ctx.accounts.depositor_account_a.to_account_info(),
        authority: authority.to_account_info(),
    };
    let cpi_context = CpiContext::new(cpi_program.to_account_info(), cpi_accounts)
        .with_signer(authority_signer_seeds);
    transfer_checked(cpi_context, amount_a_out, mint_a.decimals)?;

    // withdraw amount_b_out
    let mint_b = &ctx.accounts.mint_b;
    let cpi_accounts = TransferChecked {
        mint: mint_b.to_account_info(),
        from: pool_b.to_account_info(),
        to: ctx.accounts.depositor_account_b.to_account_info(),
        authority: authority.to_account_info(),
    };
    let cpi_context = CpiContext::new(cpi_program.to_account_info(), cpi_accounts)
        .with_signer(authority_signer_seeds);
    transfer_checked(cpi_context, amount_b_out, mint_b.decimals)?;

    Ok(())
}

fn calculate_out_amounts(
    lp_to_burn: u64,
    total_lp: u64,
    reserve_a: u64,
    reserve_b: u64,
) -> Result<(u64, u64)> {
    let amount_a_out = (lp_to_burn as u128)
        .checked_mul(reserve_a as u128)
        .ok_or(AmmError::MathOverflow)?
        / total_lp as u128;

    let amount_b_out = (lp_to_burn as u128)
        .checked_mul(reserve_b as u128)
        .ok_or(AmmError::MathOverflow)?
        / total_lp as u128;

    Ok((amount_a_out as u64, amount_b_out as u64))
}

#[derive(Accounts)]
pub struct WithdrawLiquidity<'info> {
    #[account(
        seeds = [AMM_POOL_SEED.as_bytes(), pool.amm.as_ref(), pool.mint_a.key().as_ref(), pool.mint_b.key().as_ref()],
        bump,
        has_one = mint_a,
        has_one = mint_b,
    )]
    pub pool: Account<'info, AmmPool>,

    /// CHECK readonly
    #[account(
        seeds=[AMM_POOL_AUTHORITY_SEED.as_bytes(), pool.amm.as_ref(), pool.mint_a.key().as_ref(), pool.mint_b.key().as_ref()],
        bump,
    )]
    pub authority: AccountInfo<'info>,

    /// The account paying for all rents
    pub depositor: Signer<'info>,

    #[account(
        mut,
        seeds = [AMM_MINT_LIQUIDITY_SEED.as_bytes(), pool.amm.as_ref(), pool.mint_a.key().as_ref(), pool.mint_b.key().as_ref()],
        bump,
    )]
    pub mint_liquidity: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub mint_a: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub mint_b: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = authority
    )]
    pub pool_account_a: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_b,
        associated_token::authority = authority
    )]
    pub pool_account_b: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_liquidity,
        associated_token::authority = depositor,
    )]
    pub depositor_account_liquidity: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint_a,
        associated_token::authority = depositor,
    )]
    pub depositor_account_a: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint_b,
        associated_token::authority = depositor,
    )]
    pub depositor_account_b: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
