use anchor_lang::prelude::*;
use bolt_lang::*;

declare_id!("2zaegVL5odaCikNPEzCnaicgvu1n9ueHZoQrvEPWX161");

/// Account for MagicBlock Bolt - the user account usable in Ephemeral Rollups
/// A user can have multiple accounts (one per trading pair)
#[account]
#[derive(Default, InitSpace)]
pub struct UserAccount {
    pub owner: Pubkey,
    pub pair_index: u8,          // Pair identifier (0=SOL/USDT, 1=BTC/USDT, etc.)
    pub token_in_balance: u64,   // Balance of the input token (ex: USDT) - 6 decimals
    pub token_out_balance: u64,  // Balance of the output token (ex: SOL/BTC/ETH) - 9 decimals
    pub total_positions: u64,
    pub created_at: i64,
}

/// Account for positions with TP/SL
#[account]
#[derive(Default, InitSpace)]
pub struct PositionAccount {
    pub owner: Pubkey,
    pub pair_index: u8,          // Pair identifier
    pub position_id: u64,
    pub position_type: PositionType,
    pub amount_token_out: u64,   // Amount of the output token (ex: SOL)
    pub entry_price: u64,        // Entry price (6 decimals)
    pub take_profit_price: u64,  // TP price (6 decimals)
    pub stop_loss_price: u64,    // SL price (6 decimals)
    pub status: PositionStatus,
    pub opened_at: i64,
    pub closed_at: i64,
}

/// Global configuration of the program with the admin whitelist
#[account]
pub struct ProgramConfig {
    pub authority: Pubkey,           // Super admin
    pub treasury: Pubkey,            // Wallet that receives the fees
    pub authorized_executors: Vec<Pubkey>, // Whitelist of authorized backends
    pub bump: u8,
}

#[program]
pub mod paper_trading {
    use super::*;

    /// Initialize the program configuration (only once at deployment)
    pub fn initialize_config(ctx: Context<InitializeConfig>, treasury: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.treasury = treasury;
        config.authorized_executors = Vec::new();
        config.bump = ctx.bumps.config;

        emit!(ConfigInitialized {
            authority: config.authority,
            treasury: config.treasury,
        });

        Ok(())
    }

    /// Add an authorized backend executor to execute the TP/SL
    pub fn add_executor(ctx: Context<UpdateExecutors>, executor: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        
        require!(
            !config.authorized_executors.contains(&executor),
            ErrorCode::ExecutorAlreadyExists
        );

        config.authorized_executors.push(executor);

        emit!(ExecutorAdded { executor });

        Ok(())
    }

    /// Remove an authorized backend executor
    pub fn remove_executor(ctx: Context<UpdateExecutors>, executor: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        
        config.authorized_executors.retain(|&x| x != executor);

        emit!(ExecutorRemoved { executor });

        Ok(())
    }

    /// Initialize a paper trading account for a user on a specific pair
    /// The user pays an entry fee and receives mock tokens
    /// The user can create multiple accounts (one per pair: SOL/USDT, BTC/USDT, etc.)
    pub fn initialize_account(
        ctx: Context<InitializeAccount>,
        pair_index: u8,          // 0=SOL/USDT, 1=BTC/USDT, 2=ETH/USDT, etc.
        entry_fee: u64,
        initial_token_in: u64,   // How many token_in to give to the user (ex: 10,000 USDT)
    ) -> Result<()> {
        require!(entry_fee >= 100_000_000, ErrorCode::EntryFeeTooLow); // Min 0.1 SOL

        let user_account = &mut ctx.accounts.user_account;
        let clock = Clock::get()?;

        user_account.owner = ctx.accounts.user.key();
        user_account.pair_index = pair_index;
        user_account.token_in_balance = initial_token_in;
        user_account.token_out_balance = 0;
        user_account.total_positions = 0;
        user_account.created_at = clock.unix_timestamp;

        // Transfer the fees to the treasury
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
            pair_index,
            initial_token_in,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Buy token_out with token_in (without TP/SL)
    /// Example: buy SOL with USDT (pair_index=0)
    /// The price is passed as a parameter (calculated by the backend via Pyth or other oracle)
    pub fn buy(
        ctx: Context<Trade>, 
        amount_token_out: u64,  // How many token_out to buy
        price: u64,             // Current price (6 decimals) - ex: 150.50 USDT = 150_500_000
    ) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        
        // Calculate the cost in token_in
        let cost_token_in = (amount_token_out as u128)
            .checked_mul(price as u128)
            .unwrap()
            .checked_div(1_000_000)
            .unwrap() as u64;

        require!(
            user_account.token_in_balance >= cost_token_in,
            ErrorCode::InsufficientBalance
        );

        // Update the balances - in an Ephemeral Rollup
        user_account.token_in_balance = user_account
            .token_in_balance
            .checked_sub(cost_token_in)
            .unwrap();
        user_account.token_out_balance = user_account
            .token_out_balance
            .checked_add(amount_token_out)
            .unwrap();

        emit!(TradeExecuted {
            user: user_account.owner,
            pair_index: user_account.pair_index,
            trade_type: TradeType::Buy,
            amount: amount_token_out,
            price,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Sell token_out for token_in (without TP/SL)
    /// Example: sell SOL for USDT
    pub fn sell(
        ctx: Context<Trade>, 
        amount_token_out: u64,  // How many token_out to sell
        price: u64,             // Current price (6 decimals)
    ) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;

        require!(
            user_account.token_out_balance >= amount_token_out,
            ErrorCode::InsufficientBalance
        );
        
        // Calculate how many token_in we receive
        let received_token_in = (amount_token_out as u128)
            .checked_mul(price as u128)
            .unwrap()
            .checked_div(1_000_000)
            .unwrap() as u64;

        // Update the balances
        user_account.token_out_balance = user_account
            .token_out_balance
            .checked_sub(amount_token_out)
            .unwrap();
        user_account.token_in_balance = user_account
            .token_in_balance
            .checked_add(received_token_in)
            .unwrap();

        emit!(TradeExecuted {
            user: user_account.owner,
            pair_index: user_account.pair_index,
            trade_type: TradeType::Sell,
            amount: amount_token_out,
            price,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Open a LONG position with TP/SL
    /// Buy token_out and create a position monitored by the backend
    pub fn open_long_position(
        ctx: Context<OpenPosition>,
        amount_token_out: u64,
        entry_price: u64,        // Entry price provided by the backend
        take_profit_price: u64,
        stop_loss_price: u64,
    ) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        let position_account = &mut ctx.accounts.position_account;

        // Check the consistency of the prices for a LONG
        require!(
            take_profit_price > entry_price,
            ErrorCode::InvalidTakeProfitPrice
        );
        require!(
            stop_loss_price < entry_price,
            ErrorCode::InvalidStopLossPrice
        );

        // Calculate the cost
        let cost_token_in = (amount_token_out as u128)
            .checked_mul(entry_price as u128)
            .unwrap()
            .checked_div(1_000_000)
            .unwrap() as u64;

        require!(
            user_account.token_in_balance >= cost_token_in,
            ErrorCode::InsufficientBalance
        );

        // Deduct the token_in
        user_account.token_in_balance = user_account
            .token_in_balance
            .checked_sub(cost_token_in)
            .unwrap();

        // Create the position
        let clock = Clock::get()?;
        position_account.owner = user_account.owner;
        position_account.pair_index = user_account.pair_index;
        position_account.position_id = user_account.total_positions;
        position_account.position_type = PositionType::Long;
        position_account.amount_token_out = amount_token_out;
        position_account.entry_price = entry_price;
        position_account.take_profit_price = take_profit_price;
        position_account.stop_loss_price = stop_loss_price;
        position_account.status = PositionStatus::Active;
        position_account.opened_at = clock.unix_timestamp;
        position_account.closed_at = 0;

        user_account.total_positions += 1;

        emit!(PositionOpened {
            user: user_account.owner,
            pair_index: user_account.pair_index,
            position_id: position_account.position_id,
            position_type: PositionType::Long,
            amount: amount_token_out,
            entry_price,
            tp_price: take_profit_price,
            sl_price: stop_loss_price,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Open a SHORT position with TP/SL
    pub fn open_short_position(
        ctx: Context<OpenPosition>,
        amount_token_out: u64,
        entry_price: u64,
        take_profit_price: u64,
        stop_loss_price: u64,
    ) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        let position_account = &mut ctx.accounts.position_account;

        // Check the consistency of the prices for a SHORT (inverse of the LONG)
        require!(
            take_profit_price < entry_price,
            ErrorCode::InvalidTakeProfitPrice
        );
        require!(
            stop_loss_price > entry_price,
            ErrorCode::InvalidStopLossPrice
        );

        require!(
            user_account.token_out_balance >= amount_token_out,
            ErrorCode::InsufficientBalance
        );

        // Deduct the token_out
        user_account.token_out_balance = user_account
            .token_out_balance
            .checked_sub(amount_token_out)
            .unwrap();

        // Create the short position
        let clock = Clock::get()?;
        position_account.owner = user_account.owner;
        position_account.pair_index = user_account.pair_index;
        position_account.position_id = user_account.total_positions;
        position_account.position_type = PositionType::Short;
        position_account.amount_token_out = amount_token_out;
        position_account.entry_price = entry_price;
        position_account.take_profit_price = take_profit_price;
        position_account.stop_loss_price = stop_loss_price;
        position_account.status = PositionStatus::Active;
        position_account.opened_at = clock.unix_timestamp;
        position_account.closed_at = 0;

        user_account.total_positions += 1;

        emit!(PositionOpened {
            user: user_account.owner,
            pair_index: user_account.pair_index,
            position_id: position_account.position_id,
            position_type: PositionType::Short,
            amount: amount_token_out,
            entry_price,
            tp_price: take_profit_price,
            sl_price: stop_loss_price,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Execute a TP/SL automatically
    /// ONLY callable by authorized backends in the whitelist
    pub fn execute_tp_sl(
        ctx: Context<ExecuteTPSL>,
        current_price: u64,  // Current price provided by the backend
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        let position_account = &mut ctx.accounts.position_account;
        let user_account = &mut ctx.accounts.user_account;

        // CRITICAL CHECK: The executor must be in the whitelist
        require!(
            config.authorized_executors.contains(&ctx.accounts.executor.key()),
            ErrorCode::UnauthorizedExecutor
        );

        require!(
            position_account.status == PositionStatus::Active,
            ErrorCode::PositionNotActive
        );

        // Check that the pair_index corresponds
        require!(
            position_account.pair_index == user_account.pair_index,
            ErrorCode::PairMismatch
        );

        // Check that the TP or SL condition is met
        let close_reason = match position_account.position_type {
            PositionType::Long => {
                if current_price >= position_account.take_profit_price {
                    CloseReason::TakeProfit
                } else if current_price <= position_account.stop_loss_price {
                    CloseReason::StopLoss
                } else {
                    return Err(ErrorCode::ConditionNotMet.into());
                }
            }
            PositionType::Short => {
                if current_price <= position_account.take_profit_price {
                    CloseReason::TakeProfit
                } else if current_price >= position_account.stop_loss_price {
                    CloseReason::StopLoss
                } else {
                    return Err(ErrorCode::ConditionNotMet.into());
                }
            }
        };

        // Close the position
        close_position_logic(
            position_account,
            user_account,
            current_price,
            close_reason,
        )?;

        Ok(())
    }

    /// Close a manually active position
    pub fn close_position(
        ctx: Context<ClosePositionManual>,
        current_price: u64,  // Current price provided by the backend
    ) -> Result<()> {
        let position_account = &mut ctx.accounts.position_account;
        let user_account = &mut ctx.accounts.user_account;

        require!(
            position_account.status == PositionStatus::Active,
            ErrorCode::PositionNotActive
        );

        require!(
            position_account.owner == ctx.accounts.user.key(),
            ErrorCode::Unauthorized
        );

        // Check that the pair_index corresponds
        require!(
            position_account.pair_index == user_account.pair_index,
            ErrorCode::PairMismatch
        );

        close_position_logic(
            position_account,
            user_account,
            current_price,
            CloseReason::Manual,
        )?;

        Ok(())
    }
}

// ============= HELPER FUNCTIONS =============

/// Common logic to close a position
fn close_position_logic(
    position_account: &mut PositionAccount,
    user_account: &mut UserAccount,
    current_price: u64,
    close_reason: CloseReason,
) -> Result<()> {
    let clock = Clock::get()?;

    match position_account.position_type {
        PositionType::Long => {
            // Calculate the current value
            let current_value = (position_account.amount_token_out as u128)
                .checked_mul(current_price as u128)
                .unwrap()
                .checked_div(1_000_000)
                .unwrap() as u64;

            // Return the token_in to the user
            user_account.token_in_balance = user_account
                .token_in_balance
                .checked_add(current_value)
                .unwrap();
        }
        PositionType::Short => {
            // For a short, calculate the PnL
            let entry_value = (position_account.amount_token_out as u128)
                .checked_mul(position_account.entry_price as u128)
                .unwrap()
                .checked_div(1_000_000)
                .unwrap() as u64;

            let current_value = (position_account.amount_token_out as u128)
                .checked_mul(current_price as u128)
                .unwrap()
                .checked_div(1_000_000)
                .unwrap() as u64;

            // PnL = entry_value - current_value (for a short)
            if entry_value > current_value {
                // Profit
                let profit = entry_value - current_value;
                user_account.token_in_balance = user_account
                    .token_in_balance
                    .checked_add(entry_value)
                    .unwrap()
                    .checked_add(profit)
                    .unwrap();
            } else {
                // Loss
                let loss = current_value - entry_value;
                user_account.token_in_balance = user_account
                    .token_in_balance
                    .checked_add(entry_value)
                    .unwrap()
                    .checked_sub(loss)
                    .unwrap();
            };

            // Return the token_out
            user_account.token_out_balance = user_account
                .token_out_balance
                .checked_add(position_account.amount_token_out)
                .unwrap();
        }
    }

    position_account.status = PositionStatus::Closed;
    position_account.closed_at = clock.unix_timestamp;

    emit!(PositionClosed {
        user: position_account.owner,
        pair_index: position_account.pair_index,
        position_id: position_account.position_id,
        close_price: current_price,
        close_reason,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ============= CONTEXTS =============

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 4 + (32 * 10) + 1, // authority + treasury + vec_len + 10 executors max + bump
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, ProgramConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateExecutors<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ ErrorCode::Unauthorized
    )]
    pub config: Account<'info, ProgramConfig>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(pair_index: u8, entry_fee: u64, initial_token_in: u64)]
pub struct InitializeAccount<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + std::mem::size_of::<UserAccount>(),
        seeds = [
            b"user", 
            user.key().as_ref(),
            &[pair_index]  // Include the pair in the seeds
        ],
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

    /// CHECK: Treasury wallet that receives fees - validated against config.treasury
    #[account(mut, constraint = treasury.key() == config.treasury)]
    pub treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Trade<'info> {
    #[account(
        mut,
        seeds = [
            b"user", 
            user.key().as_ref(),
            &[user_account.pair_index]
        ],
        bump,
        constraint = user_account.owner == user.key() @ ErrorCode::Unauthorized
    )]
    pub user_account: Account<'info, UserAccount>,

    pub user: Signer<'info>,
}

#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(
        mut,
        seeds = [
            b"user", 
            user.key().as_ref(),
            &[user_account.pair_index]
        ],
        bump,
        constraint = user_account.owner == user.key() @ ErrorCode::Unauthorized
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(
        init,
        payer = user,
        space = 8 + std::mem::size_of::<PositionAccount>(),
        seeds = [
            b"position",
            user.key().as_ref(),
            &[user_account.pair_index],
            user_account.total_positions.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub position_account: Account<'info, PositionAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteTPSL<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, ProgramConfig>,

    #[account(
        mut,
        seeds = [
            b"position",
            position_account.owner.as_ref(),
            &[position_account.pair_index],
            position_account.position_id.to_le_bytes().as_ref()
        ],
        bump,
    )]
    pub position_account: Account<'info, PositionAccount>,

    #[account(
        mut,
        seeds = [
            b"user", 
            position_account.owner.as_ref(),
            &[position_account.pair_index]
        ],
        bump,
    )]
    pub user_account: Account<'info, UserAccount>,

    /// The backend executor (must be in the whitelist)
    pub executor: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClosePositionManual<'info> {
    #[account(
        mut,
        seeds = [
            b"position",
            user.key().as_ref(),
            &[position_account.pair_index],
            position_account.position_id.to_le_bytes().as_ref()
        ],
        bump,
    )]
    pub position_account: Account<'info, PositionAccount>,

    #[account(
        mut,
        seeds = [
            b"user", 
            user.key().as_ref(),
            &[user_account.pair_index]
        ],
        bump,
    )]
    pub user_account: Account<'info, UserAccount>,

    pub user: Signer<'info>,
}

// ============= ENUMS =============

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Default, InitSpace)]
pub enum PositionType {
    #[default]
    Long,
    Short,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Default, InitSpace)]
pub enum PositionStatus {
    #[default]
    Active,
    Closed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum TradeType {
    Buy,
    Sell,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum CloseReason {
    TakeProfit,
    StopLoss,
    Manual,
}

// ============= EVENTS =============

#[event]
pub struct ConfigInitialized {
    pub authority: Pubkey,
    pub treasury: Pubkey,
}

#[event]
pub struct ExecutorAdded {
    pub executor: Pubkey,
}

#[event]
pub struct ExecutorRemoved {
    pub executor: Pubkey,
}

#[event]
pub struct AccountInitialized {
    pub user: Pubkey,
    pub pair_index: u8,
    pub initial_token_in: u64,
    pub timestamp: i64,
}

#[event]
pub struct TradeExecuted {
    pub user: Pubkey,
    pub pair_index: u8,
    pub trade_type: TradeType,
    pub amount: u64,
    pub price: u64,
    pub timestamp: i64,
}

#[event]
pub struct PositionOpened {
    pub user: Pubkey,
    pub pair_index: u8,
    pub position_id: u64,
    pub position_type: PositionType,
    pub amount: u64,
    pub entry_price: u64,
    pub tp_price: u64,
    pub sl_price: u64,
    pub timestamp: i64,
}

#[event]
pub struct PositionClosed {
    pub user: Pubkey,
    pub pair_index: u8,
    pub position_id: u64,
    pub close_price: u64,
    pub close_reason: CloseReason,
    pub timestamp: i64,
}

// ============= ERRORS =============

#[error_code]
pub enum ErrorCode {
    #[msg("Entry fee is too low (minimum 0.1 SOL)")]
    EntryFeeTooLow,

    #[msg("Insufficient mock balance")]
    InsufficientBalance,

    #[msg("Invalid take profit price")]
    InvalidTakeProfitPrice,

    #[msg("Invalid stop loss price")]
    InvalidStopLossPrice,

    #[msg("Position is not active")]
    PositionNotActive,

    #[msg("TP/SL condition not met")]
    ConditionNotMet,

    #[msg("Unauthorized access")]
    Unauthorized,

    #[msg("Executor is not authorized to execute TP/SL")]
    UnauthorizedExecutor,

    #[msg("Executor already exists in the whitelist")]
    ExecutorAlreadyExists,

    #[msg("Pair index mismatch between position and user account")]
    PairMismatch,
}