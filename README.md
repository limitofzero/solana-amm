# AMM (Automated Market Maker) DEX on Solana

A decentralized exchange (DEX) built on Solana using the Anchor framework. This project implements a fully functional
Automated Market Maker with liquidity pools, token swaps, and comprehensive frontend interface.

**Deployed Frontend URL:** [https://program-limitofzero.vercel.app/](https://program-limitofzero.vercel.app/)

## 🚀 Features

### Core Functionality

- **Create AMM**: Initialize a new AMM instance with custom fee structure and index
- **Create Pool**: Set up liquidity pools for any token pair
- **Add Liquidity**: Provide liquidity to pools and receive LP tokens
- **Swap Tokens**: Trade tokens through the AMM with automatic price calculation
- **Withdraw Liquidity**: Remove liquidity from pools and receive tokens back
- **View Pools**: Browse all active pools with real-time reserves and fees

### Frontend Features

- **Wallet Integration**: Connect with Phantom, Solflare, and other Solana wallets
- **Token Management**: Create tokens, mint tokens, and manage saved token addresses
- **Real-time Data**: View pool reserves, token balances, and exchange rates
- **Slippage Protection**: Automatic slippage calculation and minimum output recommendations
- **User Share Display**: See your liquidity share percentage in pools
- **Transaction Status**: Detailed success/error feedback

## 📋 Prerequisites

- **Node.js** 18+ and npm/yarn
- **Rust** and **Anchor** framework installed
- **Solana CLI** tools installed
- A Solana wallet (Phantom, Solflare, etc.)

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd program-limitofzero
```

### 2. Install Anchor Dependencies

```bash
cd anchor_project/amm
anchor build
```

### 3. Install Frontend Dependencies

```bash
cd ../../frontend
yarn
```

## 🏗️ Project Structure

```
program-limitofzero/
├── anchor_project/
│   └── amm/
│       ├── programs/
│       │   └── amm/
│       │       ├── src/
│       │       │   ├── lib.rs              # Main program entry
│       │       │   ├── states.rs           # Account structures
│       │       │   ├── errors.rs           # Custom error types
│       │       │   └── instructions/       # Program instructions
│       │       └── Cargo.toml
│       ├── tests/                          # TypeScript tests
│       └── Anchor.toml
├── frontend/
│   ├── src/
│   │   ├── app/                           # Next.js app router
│   │   ├── components/                    # React components
│   │   ├── contexts/                      # React contexts (PoolsContext)
│   │   ├── hooks/                         # Custom hooks (useSavedMints)
│   │   └── lib/                           # Utilities and program setup
│   └── public/
│       └── amm.json                       # Program IDL
└── README.md
```

## 🔧 Configuration

### Program Deployment

The program is deployed on **Solana Devnet** with the following ID:

```
Program ID: 264uMZcS5Mcpe5EzAP6P2SoGQE4j7KtpSe6U8mSQZeAN
```

### Frontend Environment Variables

Create a `.env.local` file in the `frontend/` directory:

```bash
# Network configuration (devnet, mainnet, localnet)
NEXT_PUBLIC_SOLANA_NETWORK=devnet

# Optional: Custom RPC URL (for localnet)
# NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899

# Program ID
NEXT_PUBLIC_PROGRAM_ID=264uMZcS5Mcpe5EzAP6P2SoGQE4j7KtpSe6U8mSQZeAN
```

## 🚀 Running the Project

### Start Local Validator (Optional)

For local development, start a local Solana validator:

```bash
solana-test-validator
```

### Run Frontend

```bash
cd frontend
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Run Tests

```bash
cd anchor_project/amm
anchor test
```

## 📖 Usage Guide

### 1. Connect Wallet

- Click "Connect Wallet" in the top navigation
- Select your wallet (Phantom, Solflare, etc.)
- Approve the connection

### 2. Create Token Pool (Complete Workflow)

**Prerequisites:**

- **You can use any existing SPL tokens** - you don't need to create new tokens. Simply use the mint addresses of any
  SPL tokens you already have (e.g., USDC, SOL, or any other SPL token).
- If you already have **2 SPL tokens** with their mint addresses, you can skip to **Step 3.5** (Create AMM) if you
  haven't created an AMM yet, or proceed directly to **Step 3.6** (Create the Pool).
- If you don't have tokens yet and want to create test tokens, follow the steps below starting from **Step 3.1** to
  create them using Dev Tools.

To create a liquidity pool, you need two tokens to pair. You can use any existing SPL tokens or create new ones. Follow
these steps:

#### Step 3.1: Create Token A

1. Navigate to the **"Dev Tools"** tab
2. In the **"Create Token Mint"** section:
    - Enter a **Token Name** (e.g., "My First Token")
    - Enter a **Token Symbol** (e.g., "MFT")
    - Set **Decimals** (default: 9)
3. Click **"Create Mint"**
4. Copy the generated **Mint Address** (it will be displayed after creation)
5. The token will be automatically saved to your saved mints list

#### Step 3.2: Mint Token A

1. In the **"Mint Tokens"** section of Dev Tools:
    - The mint address should already be filled (from the created mint above)
    - Enter the **Supply** amount (e.g., "1000000" for 1 million tokens)
    - Click **"Mint Tokens"**
2. Wait for the transaction to confirm
3. You should now have tokens in your wallet balance

#### Step 3.3: Create Token B

1. In the **"Create Token Mint"** section again:
    - Enter a different **Token Name** (e.g., "My Second Token")
    - Enter a different **Token Symbol** (e.g., "MST")
    - Set **Decimals** (e.g., 9)
2. Click **"Create Mint"**
3. Copy the new **Mint Address**

#### Step 3.4: Mint Token B

1. In the **"Mint Tokens"** section:
    - The new mint address should be filled
    - Enter the **Supply** amount (e.g., "1000000")
    - Click **"Mint Tokens"**
2. Wait for the transaction to confirm

#### Step 3.5: Create AMM

1. Navigate to the **"Create AMM"** tab
2. Enter a **Fee** (in basis points, max 9999, e.g., 30 for 0.3%)
3. Enter an **Index** (unique identifier for the AMM, e.g., 1)
4. Click **"Create AMM"**
5. Wait for the transaction to confirm
6. Remember the **AMM Index** - you'll need it for creating the pool

#### Step 3.6: Create the Pool

1. Navigate to the **"Create Pool"** tab
2. In the **"Mint A Address"** field:
    - Select Token A from the dropdown (or paste the mint address)
    - You'll see the token name/symbol displayed if available
3. In the **"Mint B Address"** field:
    - Select Token B from the dropdown (or paste the mint address)
4. Enter the **AMM Index** (the same index you used when creating the AMM)
5. Click **"Create Pool"**
6. Wait for the transaction to confirm

**Note**: You can also use existing tokens from other pools by selecting them from the dropdown in the "Mint Tokens"
section of Dev Tools, which shows all tokens present in active pools.

### 4. Add Liquidity

- Navigate to "Add Liquidity" tab
- Select an existing pool from the dropdown (or enter manually)
- Enter amounts for Token A and Token B
- Use "Use Recommended" to match pool ratio
- View your share percentage in the pool
- Click "Add Liquidity"

### 5. Swap Tokens

- Go to "Swap" tab
- Select a pool from the dropdown
- Choose swap direction (A to B or B to A)
- Enter the amount to swap
- View exchange rate and estimated output
- Adjust slippage tolerance if needed
- Click "Swap"

### 6. Withdraw Liquidity

- Navigate to "Withdraw Liquidity" tab
- Select a pool you have LP tokens for
- View your LP token balance
- Enter amount to withdraw (or use quick buttons: 25%, 50%, 75%, 100%)
- View estimated token outputs
- Click "Withdraw Liquidity"

### 7. Dev Tools

- **Create Token Mint**: Create new SPL tokens with custom name, symbol, and decimals
- **Mint Tokens**: Mint tokens to your wallet (requires mint authority)
- **Token Selector**: Choose tokens from active pools for minting

## 🏛️ Program Architecture

### Program Instructions

1. **create_amm**: Initialize a new AMM instance
    - Parameters: `fee` (u16), `index` (u16)
    - Creates AMM PDA with seeds: `["AMM", index]`

2. **create_pool**: Create a liquidity pool for a token pair
    - Creates pool PDA, LP mint, and pool token accounts
    - Seeds: `["AMM_POOL", amm, mint_a, mint_b]`

3. **add_liquidity**: Add tokens to a pool
    - Parameters: `amount_a` (u64), `amount_b` (u64)
    - Mints LP tokens proportional to liquidity provided
    - Calculates optimal amounts to maintain pool ratio

4. **swap**: Exchange tokens through the pool
    - Parameters: `is_swap_a` (bool), `amount` (u64), `min_out_amount` (u64)
    - Uses constant product formula (x * y = k)
    - Applies AMM fee to input amount

5. **withdraw_liquidity**: Remove liquidity from a pool
    - Parameters: `amount` (u64) - LP token amount to burn
    - Returns proportional amounts of both tokens

### PDA Usage

The program uses Program Derived Addresses (PDAs) for deterministic account generation:

- **AMM PDA**: `["AMM", index]` - Stores AMM configuration
- **Pool PDA**: `["AMM_POOL", amm, mint_a, mint_b]` - Stores pool state
- **Pool Authority PDA**: `["AMM_POOL_AUTHORITY", amm, mint_a, mint_b]` - Controls pool token accounts
- **LP Mint PDA**: `["AMM_MINT_LIQUIDITY", amm, mint_a, mint_b]` - LP token mint

### Account Structures

```rust
#[account]
pub struct Amm {
    pub admin: Pubkey,      // Admin wallet address
    pub index: u16,         // Unique AMM index
    pub fee: u16,           // Fee in basis points (0-9999)
}

#[account]
pub struct AmmPool {
    pub amm: Pubkey,        // AMM this pool belongs to
    pub mint_a: Pubkey,     // First token mint
    pub mint_b: Pubkey,     // Second token mint
}
```

## 🧪 Testing

The project includes comprehensive tests covering both happy and unhappy paths:

### Test Files

- `tests/amm.ts` - AMM creation tests
- `tests/pool.ts` - Pool creation tests
- `tests/add_liquidity.ts` - Liquidity addition tests
- `tests/swap.ts` - Token swap tests
- `tests/withdraw_liquidity.ts` - Liquidity withdrawal tests

### Test Coverage

**Happy Path Tests:**

- Create AMM with valid parameters
- Create multiple pools with different indices
- Add liquidity to new and existing pools
- Swap tokens in both directions
- Withdraw liquidity and receive tokens
- Handle different token decimals

**Unhappy Path Tests:**

- Cannot create AMM with duplicate index
- Cannot create AMM with fee >= 10000
- Cannot create pool with same token pair twice
- Cannot add liquidity with zero amounts
- Cannot swap with insufficient balance
- Cannot swap with output below minimum
- Cannot withdraw more LP tokens than owned

Run tests:

```bash
cd anchor_project/amm
anchor test
```

## 🔐 Security Considerations

- **Fee Validation**: Fees are validated to be less than MAX_FEE_BPS (10000)
- **Amount Validation**: All amounts must be greater than zero
- **Balance Checks**: Insufficient balance errors are properly handled
- **Slippage Protection**: Minimum output amounts prevent unfavorable swaps
- **PDA Signing**: Pool authority uses PDA seeds for secure signing

## 🌐 Deployment

### Deploy Program to Devnet

```bash
cd anchor_project/amm
anchor build
anchor deploy --provider.cluster devnet
```

### Deploy Frontend

The frontend is deployed on vercel:

- **Vercel** (recommended)
- **Netlify**
- **Any static hosting service**

```bash
cd frontend
yarn run build
# Deploy the 'out' or '.next' directory
```

## 📚 Technologies Used

- **Anchor**: Solana program framework
- **Rust**: Program language
- **TypeScript**: Tests and frontend
- **Next.js**: Frontend framework
- **React**: UI library
- **@solana/web3.js**: Solana JavaScript SDK
- **@coral-xyz/anchor**: Anchor TypeScript client
- **@solana/spl-token**: SPL Token library
- **Tailwind CSS**: Styling

---

**Note**: This AMM is deployed on Solana Devnet for educational purposes.
