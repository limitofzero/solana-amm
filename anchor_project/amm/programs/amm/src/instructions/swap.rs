use anchor_lang::prelude::*;

use crate::errors::AmmError;
use crate::states::{Amm, AmmPool, AMM_POOL_AUTHORITY_SEED, AMM_POOL_SEED, AMM_SEED};
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

use anchor_spl::associated_token::AssociatedToken;

pub fn swap(ctx: Context<Swap>, is_swap_a: bool, amount: u64, min_out_amount: u64) -> Result<()> {
    require!(amount > 0, AmmError::AmountIsZero);

    let trader_input_balance = if is_swap_a {
        ctx.accounts.trader_account_a.amount
    } else {
        ctx.accounts.trader_account_b.amount
    };

    require!(
        trader_input_balance >= amount,
        AmmError::InsufficientBalance
    );

    let fee_bps = ctx.accounts.amm.fee;

    let percent = 10_000 - fee_bps as u128;
    let amount_eff = (amount as u128)
        .checked_mul(percent)
        .ok_or(AmmError::MathOverflow)?
        / 10_000;

    let pool_a = &ctx.accounts.pool_account_a;
    let pool_b = &ctx.accounts.pool_account_b;
    let (input_pool, output_pool) = if is_swap_a {
        (pool_a, pool_b)
    } else {
        (pool_b, pool_a)
    };

    let (input_reserve, output_reserve) = (input_pool.amount, output_pool.amount);

    require!(input_reserve > 0 && output_reserve > 0, AmmError::EmptyPool);

    let k = (input_reserve as u128)
        .checked_mul(output_reserve as u128)
        .ok_or(AmmError::MathOverflow)?;

    let new_input_reserve = (input_reserve as u128)
        .checked_add(amount_eff)
        .ok_or(AmmError::MathOverflow)?;
    let new_output_reserve = k / new_input_reserve;

    let output_amount = (output_reserve)
        .checked_sub(new_output_reserve as u64)
        .ok_or(AmmError::MathOverflow)?;
    require!(
        output_amount >= min_out_amount,
        AmmError::OutputAmountTooLow
    );

    let (input_mint, output_mint, trader_input, trader_output) = if is_swap_a {
        (
            &ctx.accounts.mint_a,
            &ctx.accounts.mint_b,
            &ctx.accounts.trader_account_a,
            &ctx.accounts.trader_account_b,
        )
    } else {
        (
            &ctx.accounts.mint_b,
            &ctx.accounts.mint_a,
            &ctx.accounts.trader_account_b,
            &ctx.accounts.trader_account_a,
        )
    };

    // transfer input amount from trader to input pool
    let cpi_accounts = TransferChecked {
        mint: input_mint.to_account_info(),
        from: trader_input.to_account_info(),
        to: input_pool.to_account_info(),
        authority: ctx.accounts.trader.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_context = CpiContext::new(cpi_program, cpi_accounts);
    transfer_checked(cpi_context, amount, input_mint.decimals)?;

    // transfer output amount to trader
    let authority_signer_seeds: &[&[&[u8]]] = &[&[
        &AMM_POOL_AUTHORITY_SEED.as_bytes(),
        &ctx.accounts.pool.amm.to_bytes(),
        &ctx.accounts.mint_a.key().to_bytes(),
        &ctx.accounts.mint_b.key().to_bytes(),
        &[ctx.bumps.authority],
    ]];

    let cpi_accounts = TransferChecked {
        mint: output_mint.to_account_info(),
        from: output_pool.to_account_info(),
        to: trader_output.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_context =
        CpiContext::new(cpi_program, cpi_accounts).with_signer(authority_signer_seeds);
    transfer_checked(cpi_context, output_amount, output_mint.decimals)?;

    Ok(())
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(
        seeds = [
            AMM_SEED.as_bytes(), &amm.index.to_le_bytes()
        ],
        bump,
    )]
    pub amm: Account<'info, Amm>,

    #[account(
        seeds = [AMM_POOL_SEED.as_bytes(), pool.amm.as_ref(), pool.mint_a.key().as_ref(), pool.mint_b.key().as_ref()],
        bump,
        has_one = mint_a,
        has_one = mint_b,
        has_one = amm,
    )]
    pub pool: Account<'info, AmmPool>,

    /// CHECK: readonly
    #[account(
        seeds=[AMM_POOL_AUTHORITY_SEED.as_bytes(), pool.amm.as_ref(), pool.mint_a.key().as_ref(), pool.mint_b.key().as_ref()],
        bump,
    )]
    pub authority: AccountInfo<'info>,

    pub trader: Signer<'info>,

    pub mint_a: Box<Account<'info, Mint>>,

    pub mint_b: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = authority,
    )]
    pub pool_account_a: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_b,
        associated_token::authority = authority,
    )]
    pub pool_account_b: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = trader,
    )]
    pub trader_account_a: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint_b,
        associated_token::authority = trader,
    )]
    pub trader_account_b: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
