use anchor_lang::prelude::*;

#[error_code]
pub enum AmmError {
    #[msg("Mint accounts should be different")]
    MintAccountsAreEqual,
    #[msg("Amount of the token should be greater than zero")]
    AmountIsZero,
    #[msg("Insufficient balance to deposit")]
    InsufficientBalance,
    #[msg("One of the pools has zero tokens")]
    InvalidPoolState,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("LP amount is zero")]
    LpIsZero,
    #[msg("Total lp supply is zero")]
    LpSupplyIsZero,
    #[msg("Insufficient balance of LP token")]
    InsufficientLpBalance,
    #[msg("Min output amount is bigger than amount")]
    MinOutputIsBiggerThanInput,
    #[msg("Output amount is less than expected min")]
    OutputAmountTooLow,
    #[msg("Empty pull")]
    EmptyPool,
}
