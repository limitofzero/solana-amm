use anchor_lang::prelude::*;

#[error_code]
pub enum AmmError {
    #[msg("Mint accounts should be different")]
    MintAccountsAreEqual
}