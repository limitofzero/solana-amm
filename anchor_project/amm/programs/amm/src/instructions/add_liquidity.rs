use crate::errors::AmmError;
use crate::states::{AmmPool, AMM_MINT_LIQUIDITY_SEED, AMM_POOL_AUTHORITY_SEED, AMM_POOL_SEED};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{
    mint_to, transfer_checked, Mint, MintTo, Token, TokenAccount, TransferChecked,
};

pub fn add_liquidity(ctx: Context<AddLiquidity>, amount_a: u64, amount_b: u64) -> Result<()> {
    require!(amount_a > 0 || amount_b > 0, AmmError::AmountIsZero);

    let depositor_account_a = &ctx.accounts.depositor_account_a;
    let depositor_account_b = &ctx.accounts.depositor_account_b;

    let pool_a = &mut ctx.accounts.pool_account_a;
    let pool_b = &mut ctx.accounts.pool_account_b;

    let reserve_a = pool_a.amount;
    let reserve_b = pool_b.amount;

    let is_new_pool = reserve_a == 0 && reserve_b == 0;
    let (amount_a, amount_b) = if is_new_pool {
        (amount_a, amount_b)
    } else {
        calculate_liquidity_amounts(reserve_a, amount_a, reserve_b, amount_b)?
    };

    require!(
        depositor_account_a.amount >= amount_a,
        AmmError::InsufficientBalance
    );
    require!(
        depositor_account_b.amount >= amount_b,
        AmmError::InsufficientBalance
    );

    let lp_mint = &ctx.accounts.mint_liquidity;
    let total_lp = lp_mint.supply;
    let lp_amount = calculate_lp(amount_a, amount_b, reserve_a, reserve_b, total_lp)?;

    // transfer token a
    let cpi_accounts = TransferChecked {
        mint: ctx.accounts.mint_a.to_account_info(),
        from: depositor_account_a.to_account_info(),
        to: pool_a.to_account_info(),
        authority: ctx.accounts.depositor.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_context = CpiContext::new(cpi_program, cpi_accounts);
    transfer_checked(cpi_context, amount_a, ctx.accounts.mint_a.decimals)?;

    // transfer token b
    let cpi_accounts = TransferChecked {
        mint: ctx.accounts.mint_b.to_account_info(),
        from: depositor_account_b.to_account_info(),
        to: pool_b.to_account_info(),
        authority: ctx.accounts.depositor.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_context = CpiContext::new(cpi_program, cpi_accounts);
    transfer_checked(cpi_context, amount_b, ctx.accounts.mint_b.decimals)?;

    // mint lp
    let authority = &ctx.accounts.authority;
    let authority_signer_seeds: &[&[&[u8]]] = &[&[
        &AMM_POOL_AUTHORITY_SEED.as_bytes(),
        &ctx.accounts.pool.amm.key().to_bytes(),
        &ctx.accounts.mint_a.key().to_bytes(),
        &ctx.accounts.mint_b.key().to_bytes(),
        &[ctx.bumps.authority],
    ]];
    let cpi_accounts = MintTo {
        mint: ctx.accounts.mint_liquidity.to_account_info(),
        to: ctx.accounts.depositor_account_liquidity.to_account_info(),
        authority: authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_context =
        CpiContext::new(cpi_program, cpi_accounts).with_signer(authority_signer_seeds);
    mint_to(cpi_context, lp_amount)?;

    Ok(())
}

fn calculate_liquidity_amounts(
    reserve_a: u64,
    amount_a: u64,
    reserve_b: u64,
    amount_b: u64,
) -> Result<(u64, u64)> {
    require!(reserve_a > 0 && reserve_b > 0, AmmError::InvalidPoolState);

    let required_b = amount_a
        .checked_mul(reserve_b)
        .ok_or(AmmError::MathOverflow)?
        / reserve_a;
    if amount_b >= required_b {
        return Ok((amount_a, required_b));
    }

    let required_a = amount_b
        .checked_mul(reserve_a)
        .ok_or(AmmError::MathOverflow)?
        / reserve_b;
    if amount_a >= required_a {
        Ok((required_a, amount_b))
    } else {
        Err(AmmError::InsufficientBalance.into())
    }
}

fn calculate_lp(
    amount_a: u64,
    amount_b: u64,
    reserve_a: u64,
    reserve_b: u64,
    total_lp: u64,
) -> Result<u64> {
    if total_lp == 0 {
        let product = (amount_a as u128)
            .checked_mul(amount_b as u128)
            .ok_or(AmmError::MathOverflow)?;
        let r = (product as f64).sqrt() as u64;
        Ok(r)
    } else {
        let lp_from_a = (amount_a as u128)
            .checked_mul(total_lp as u128)
            .ok_or(AmmError::MathOverflow)?
            / (reserve_a as u128);

        let lp_from_b = (amount_b as u128)
            .checked_mul(total_lp as u128)
            .ok_or(AmmError::MathOverflow)?
            / (reserve_b as u128);

        let lp_amount = lp_from_a.min(lp_from_b);
        require!(lp_amount > 0, AmmError::LpIsZero);

        Ok(lp_amount as u64)
    }
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(
        seeds = [AMM_POOL_SEED.as_bytes(), pool.amm.as_ref(), pool.mint_a.key().as_ref(), pool.mint_b.key().as_ref()],
        bump,
        has_one = mint_a,
        has_one = mint_b,
    )]
    pub pool: Box<Account<'info, AmmPool>>,

    pub mint_a: Box<Account<'info, Mint>>,

    pub mint_b: Box<Account<'info, Mint>>,

    /// CHECK readonly
    #[account(
        seeds=[AMM_POOL_AUTHORITY_SEED.as_bytes(), pool.amm.as_ref(), pool.mint_a.key().as_ref(), pool.mint_b.key().as_ref()],
        bump,
    )]
    pub authority: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [AMM_MINT_LIQUIDITY_SEED.as_bytes(), pool.amm.as_ref(), pool.mint_a.key().as_ref(), pool.mint_b.key().as_ref()],
        bump,
    )]
    pub mint_liquidity: Box<Account<'info, Mint>>,

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

    pub depositor: Signer<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint_liquidity,
        associated_token::authority = depositor,
    )]
    pub depositor_account_liquidity: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = depositor
    )]
    pub depositor_account_a: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_b,
        associated_token::authority = depositor
    )]
    pub depositor_account_b: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}
