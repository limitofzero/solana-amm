use anchor_lang::prelude::*;

pub  mod instructions;
pub  mod states;
mod errors;

declare_id!("264uMZcS5Mcpe5EzAP6P2SoGQE4j7KtpSe6U8mSQZeAN");

#[program]
pub mod amm {
    pub use super::instructions::*;
    use super::*;

    pub fn create_amm(ctx: Context<CreateAmm>, fee: u16, index: u16) -> Result<()> {
        instructions::create_amm(ctx, fee, index)
    }

    pub  fn create_pool(ctx: Context<CreatePool>) -> Result<()> {
        instructions::create_pool(ctx)
    }
}

