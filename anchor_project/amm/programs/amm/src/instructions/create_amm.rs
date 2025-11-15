use anchor_lang::prelude::*;
use crate::states::{Amm, AMM_SEED};

pub  fn create_amm(ctx: Context<CreateAmm>, fee: u16, index: u16) -> Result<()> {
    let amm = &mut ctx.accounts.amm;
    amm.fee = fee;
    amm.index = index;
    amm.admin = ctx.accounts.admin_account.key();
    Ok(())
}

#[derive(Accounts)]
#[instruction(fee: u16, index: u16)]
pub  struct CreateAmm<'info> {
    #[account(
    init,
    payer = signer,
    space = 8 + Amm::INIT_SPACE,
    seeds = [AMM_SEED.as_bytes(), &index.to_le_bytes()],
    bump,
    )]
    pub amm: Account<'info, Amm>,

    /// CHECK: We only read the pubkey and store it as admin
    pub admin_account: AccountInfo<'info>,

    #[account(mut)]
    signer: Signer<'info>,

    pub  system_program: Program<'info, System>,
}