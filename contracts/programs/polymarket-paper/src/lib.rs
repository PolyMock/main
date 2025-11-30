use anchor_lang::prelude::*;
use bolt_lang::*;

declare_id!("AmuwGa8LXKW63ZHzGm1TkqSugbJ8fMVXr6HKksYkwUNT");

/// User account for Polymarket paper trading
/// USDC balance for Yes/No predictions
#[account]
#[derive(Default, InitSpace)]
pub struct UserAccount {
    pub owner: Pubkey,
    pub usdc_balance: u64,       // USDC balance in 6 decimals 
    pub total_trades: u64,       // Total number of trades made
    pub created_at: i64,
}

/// Prediction position for Yes/No markets
#[account]
#[derive(Default, InitSpace)]
pub struct PredictionPosition {
    pub owner: Pubkey,
    #[max_len(32)]
    pub market_id: String,       // Polymarket market ID (max 32 chars)
    pub position_id: u64,
    pub prediction_type: PredictionType, // Yes or No
    pub amount_usdc: u64,        // Amount of USDC invested (6 decimals)
    pub price_per_share: u64,    // Price paid per share (6 decimals)
    pub shares: u64,             // Number of shares owned (6 decimals)
    pub status: PositionStatus,
    pub opened_at: i64,
    pub closed_at: i64,
}

/// Global configuration for the Polymarket paper trading program
#[account]
pub struct ProgramConfig {
    pub authority: Pubkey,           // Super admin
    pub treasury: Pubkey,            // Wallet that receives the fees
    pub bump: u8,
}

#[program]
pub mod polymarket_paper {
    use super::*;

    /// Initialize the program configuration 
    pub fn initialize_config(ctx: Context<InitializeConfig>, treasury: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.treasury = treasury;
        config.bump = ctx.bumps.config;

        emit!(ConfigInitialized {
            authority: config.authority,
            treasury: config.treasury,
        });

        Ok(())
    }

    /// Initialize a paper trading account with 10,000 USDC
    pub fn initialize_account(
        ctx: Context<InitializeAccount>,
        entry_fee: u64,
    ) -> Result<()> {
        require!(entry_fee >= 100_000_000, ErrorCode::EntryFeeTooLow); // Min 0.1 SOL

        let user_account = &mut ctx.accounts.user_account;
        let clock = Clock::get()?;

        user_account.owner = ctx.accounts.user.key();
        user_account.usdc_balance = 10_000_000_000; // 10,000 USDC 
        user_account.total_trades = 0;
        user_account.created_at = clock.unix_timestamp;

        // Transfer the entry fee to the treasury
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, entry_fee)?;

        emit!(AccountInitialized {
            user: ctx.accounts.user.key(),
            initial_usdc: 10_000_000_000,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Buy YES shares in a prediction market
    pub fn buy_yes(
        ctx: Context<Trade>, 
        market_id: String,
        amount_usdc: u64,        // Amount of USDC to spend 
        price_per_share: u64,    // Price per YES share
    ) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        let position_account = &mut ctx.accounts.position_account;

        require!(
            user_account.usdc_balance >= amount_usdc,
            ErrorCode::InsufficientBalance
        );

        require!(
            price_per_share > 0 && price_per_share <= 1_000_000, // Max 1.00 USDC per share
            ErrorCode::InvalidPrice
        );

        // Calculate number of shares: amount_usdc / price_per_share
        let shares = (amount_usdc as u128)
            .checked_mul(1_000_000u128) 
            .unwrap()
            .checked_div(price_per_share as u128)
            .unwrap() as u64;

        // Update user balance
        user_account.usdc_balance = user_account
            .usdc_balance
            .checked_sub(amount_usdc)
            .unwrap();
        user_account.total_trades = user_account.total_trades.checked_add(1).unwrap();

        // Create position
        let clock = Clock::get()?;
        position_account.owner = user_account.owner;
        position_account.market_id = market_id.clone();
        position_account.position_id = user_account.total_trades - 1;
        position_account.prediction_type = PredictionType::Yes;
        position_account.amount_usdc = amount_usdc;
        position_account.price_per_share = price_per_share;
        position_account.shares = shares;
        position_account.status = PositionStatus::Active;
        position_account.opened_at = clock.unix_timestamp;
        position_account.closed_at = 0;

        emit!(PredictionMade {
            user: user_account.owner,
            market_id,
            prediction_type: PredictionType::Yes,
            amount_usdc,
            price_per_share,
            shares,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Buy NO shares in a prediction market
    pub fn buy_no(
        ctx: Context<Trade>, 
        market_id: String,
        amount_usdc: u64,        // Amount of USDC to spend
        price_per_share: u64,    // Price per NO share 
    ) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        let position_account = &mut ctx.accounts.position_account;

        require!(
            user_account.usdc_balance >= amount_usdc,
            ErrorCode::InsufficientBalance
        );

        require!(
            price_per_share > 0 && price_per_share <= 1_000_000, // Max 1.00 USDC per share
            ErrorCode::InvalidPrice
        );

        // Calculate number of shares: amount_usdc / price_per_share
        let shares = (amount_usdc as u128)
            .checked_mul(1_000_000u128) // Scale for precision
            .unwrap()
            .checked_div(price_per_share as u128)
            .unwrap() as u64;

        // Update user balance
        user_account.usdc_balance = user_account
            .usdc_balance
            .checked_sub(amount_usdc)
            .unwrap();
        user_account.total_trades = user_account.total_trades.checked_add(1).unwrap();

        // Create position
        let clock = Clock::get()?;
        position_account.owner = user_account.owner;
        position_account.market_id = market_id.clone();
        position_account.position_id = user_account.total_trades - 1;
        position_account.prediction_type = PredictionType::No;
        position_account.amount_usdc = amount_usdc;
        position_account.price_per_share = price_per_share;
        position_account.shares = shares;
        position_account.status = PositionStatus::Active;
        position_account.opened_at = clock.unix_timestamp;
        position_account.closed_at = 0;

        emit!(PredictionMade {
            user: user_account.owner,
            market_id,
            prediction_type: PredictionType::No,
            amount_usdc,
            price_per_share,
            shares,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Close a position and realize profit/loss
    pub fn close_position(
        ctx: Context<ClosePosition>,
        current_price: u64,  // Current market price for the shares 
    ) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        let position_account = &mut ctx.accounts.position_account;

        require!(
            position_account.status == PositionStatus::Active,
            ErrorCode::PositionNotActive
        );

        require!(
            position_account.owner == ctx.accounts.user.key(),
            ErrorCode::Unauthorized
        );

        require!(
            current_price <= 1_000_000, // Max 1.00 USDC per share
            ErrorCode::InvalidPrice
        );

        // Calculate payout: shares * current_price
        let payout = (position_account.shares as u128)
            .checked_mul(current_price as u128)
            .unwrap()
            .checked_div(1_000_000u128) // Normalize back to USDC
            .unwrap() as u64;

        // Update user balance with payout
        user_account.usdc_balance = user_account
            .usdc_balance
            .checked_add(payout)
            .unwrap();

        // Close the position
        let clock = Clock::get()?;
        position_account.status = PositionStatus::Closed;
        position_account.closed_at = clock.unix_timestamp;

        emit!(PositionClosed {
            user: position_account.owner,
            market_id: position_account.market_id.clone(),
            position_id: position_account.position_id,
            close_price: current_price,
            payout,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

// ============= CONTEXTS =============

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 1, // authority + treasury + bump
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, ProgramConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(entry_fee: u64)]
pub struct InitializeAccount<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + std::mem::size_of::<UserAccount>(),
        seeds = [b"user", user.key().as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, ProgramConfig>,

    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: Treasury wallet that receives fees
    #[account(mut, constraint = treasury.key() == config.treasury)]
    pub treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(market_id: String, amount_usdc: u64, price_per_share: u64)]
pub struct Trade<'info> {
    #[account(
        mut,
        seeds = [b"user", user.key().as_ref()],
        bump,
        constraint = user_account.owner == user.key() @ ErrorCode::Unauthorized
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(
        init,
        payer = user,
        space = 8 + std::mem::size_of::<PredictionPosition>(),
        seeds = [
            b"position",
            user.key().as_ref(),
            user_account.total_trades.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub position_account: Account<'info, PredictionPosition>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    #[account(
        mut,
        seeds = [b"user", user.key().as_ref()],
        bump,
        constraint = user_account.owner == user.key() @ ErrorCode::Unauthorized
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(
        mut,
        seeds = [
            b"position",
            user.key().as_ref(),
            position_account.position_id.to_le_bytes().as_ref()
        ],
        bump,
    )]
    pub position_account: Account<'info, PredictionPosition>,

    pub user: Signer<'info>,
}

// ============= ENUMS =============

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Default, InitSpace)]
pub enum PredictionType {
    #[default]
    Yes,
    No,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Default, InitSpace)]
pub enum PositionStatus {
    #[default]
    Active,
    Closed,
}

// ============= EVENTS =============

#[event]
pub struct ConfigInitialized {
    pub authority: Pubkey,
    pub treasury: Pubkey,
}

#[event]
pub struct AccountInitialized {
    pub user: Pubkey,
    pub initial_usdc: u64,
    pub timestamp: i64,
}

#[event]
pub struct PredictionMade {
    pub user: Pubkey,
    pub market_id: String,
    pub prediction_type: PredictionType,
    pub amount_usdc: u64,
    pub price_per_share: u64,
    pub shares: u64,
    pub timestamp: i64,
}

#[event]
pub struct PositionClosed {
    pub user: Pubkey,
    pub market_id: String,
    pub position_id: u64,
    pub close_price: u64,
    pub payout: u64,
    pub timestamp: i64,
}

// ============= ERRORS =============

#[error_code]
pub enum ErrorCode {
    #[msg("Entry fee is too low (minimum 0.1 SOL)")]
    EntryFeeTooLow,

    #[msg("Insufficient USDC balance")]
    InsufficientBalance,

    #[msg("Invalid price (must be between 0 and 1.00 USDC)")]
    InvalidPrice,

    #[msg("Position is not active")]
    PositionNotActive,

    #[msg("Unauthorized access")]
    Unauthorized,
}