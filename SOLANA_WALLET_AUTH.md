# Solana Wallet Authentication Guide

Users can now authenticate with **either Google OAuth OR their Solana wallet**. The database links users by their wallet address.

## 🎯 Features

- ✅ Authenticate with Solana wallet (Phantom, Solflare, etc.)
- ✅ Authenticate with Google OAuth
- ✅ Link wallet address to existing Google account
- ✅ Save backtest strategies to wallet-based account
- ✅ Automatic user creation on first wallet connection

## 📊 Database Schema

The `users` table now supports both authentication methods:

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id TEXT UNIQUE,              -- Google OAuth ID (optional)
  solana_address TEXT UNIQUE,         -- Solana wallet address (optional)
  email TEXT,                         -- From Google or null
  name TEXT,                          -- Display name
  picture TEXT,                       -- Profile picture URL
  created_at DATETIME,
  last_login DATETIME,
  CONSTRAINT check_auth CHECK (google_id IS NOT NULL OR solana_address IS NOT NULL)
);
```

**Note:** Users must have at least one authentication method (Google OR Solana wallet).

## 🔧 Setup Instructions

### 1. Run Database Migration

```bash
wrangler d1 execute polymock-db --file=./database/migrations/0002_add_solana_wallet.sql
```

This will:
- Add `solana_address` column
- Make `google_id` optional
- Add constraint to ensure at least one auth method exists
- Create index on `solana_address`

### 2. Frontend Integration

Import the wallet auth utility:

```typescript
import { authenticateWithWallet } from '$lib/auth/walletAuth';
import { useWallet } from '@solana/wallet-adapter-react';
```

Example usage in your component:

```typescript
const { publicKey, signMessage } = useWallet();

async function handleWalletAuth() {
  if (!publicKey || !signMessage) {
    alert('Please connect your wallet first');
    return;
  }

  const result = await authenticateWithWallet(
    publicKey.toBase58(),
    signMessage
  );

  if (result.success) {
    console.log('Authenticated!', result.user);
    // Redirect or update UI
  } else {
    alert(result.error);
  }
}
```

## 🔐 How It Works

### Authentication Flow

1. **User connects Solana wallet** (Phantom, Solflare, etc.)
2. **Frontend requests signature** from wallet with a message containing:
   - Wallet address
   - Timestamp
   - Authentication purpose
3. **User signs the message** in their wallet
4. **Frontend sends to backend**:
   - Wallet address
   - Signature
   - Original message
5. **Backend verifies** (currently trusted, TODO: verify signature)
6. **Backend creates/updates user**:
   - If wallet exists → update last_login
   - If new wallet → create new user with wallet address
7. **Session cookie is set** with user info
8. **User is authenticated** and can save strategies

### Session Data

The session cookie contains:

```typescript
{
  id: number;                    // Database user ID
  solanaAddress?: string;        // If authenticated via wallet
  googleId?: string;             // If authenticated via Google
  email: string | null;          // From Google or null
  name: string;                  // Display name
  picture: string | null;        // Profile picture or null
}
```

## 📝 API Endpoints

### POST `/api/auth/wallet`

Authenticate with Solana wallet.

**Request:**
```json
{
  "walletAddress": "7xKXtg...",
  "signature": [123, 45, 67, ...],
  "message": "Sign this message..."
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "solanaAddress": "7xKXtg...",
    "name": "7xKX...tg2f",
    "email": null,
    "picture": null
  }
}
```

### GET `/api/auth/user`

Get current authenticated user (works for both Google and Wallet auth).

**Response:**
```json
{
  "user": {
    "id": 1,
    "solanaAddress": "7xKXtg...",
    "name": "7xKX...tg2f"
  }
}
```

## 🎨 Example: Strategies Page with Wallet Auth

```svelte
<script>
  import { onMount } from 'svelte';
  import { useWallet } from '@solana/wallet-adapter-react';
  import { authenticateWithWallet, getCurrentUser } from '$lib/auth/walletAuth';

  const { publicKey, signMessage } = useWallet();
  let user = null;
  let strategies = [];

  onMount(async () => {
    // Check if already authenticated
    user = await getCurrentUser();

    if (user) {
      loadStrategies();
    }
  });

  async function handleWalletLogin() {
    if (!publicKey || !signMessage) return;

    const result = await authenticateWithWallet(
      publicKey.toBase58(),
      signMessage
    );

    if (result.success) {
      user = result.user;
      loadStrategies();
    }
  }

  async function loadStrategies() {
    const res = await fetch('/api/strategies');
    const data = await res.json();
    strategies = data.strategies;
  }
</script>

{#if !user}
  <button on:click={handleWalletLogin}>
    Sign in with Wallet
  </button>
{:else}
  <h2>Welcome {user.name}!</h2>
  <p>Wallet: {user.solanaAddress}</p>

  {#each strategies as strategy}
    <div>{strategy.strategyName}</div>
  {/each}
{/if}
```

## 🔒 Security Notes

### TODO: Implement Signature Verification

Currently, the backend **trusts the client** to provide a valid signature. In production, you should:

1. **Verify the signature server-side** using `@solana/web3.js`
2. **Check the message format** and timestamp
3. **Prevent replay attacks** by storing used signatures

Example verification (add to backend):

```typescript
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';

function verifySignature(
  walletAddress: string,
  signature: number[],
  message: string
): boolean {
  const publicKey = new PublicKey(walletAddress);
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = new Uint8Array(signature);

  return nacl.sign.detached.verify(
    messageBytes,
    signatureBytes,
    publicKey.toBytes()
  );
}
```

### Session Security

- ✅ HttpOnly cookies (can't be accessed via JavaScript)
- ✅ SameSite=lax (CSRF protection)
- ✅ Secure in production (HTTPS only)
- ✅ 30-day expiration

## 🔗 Linking Google and Wallet

Users can authenticate with either method. To link accounts:

1. User logs in with Google
2. Later connects wallet
3. Backend can update user record to add `solana_address`

Example API endpoint to link:

```typescript
// POST /api/auth/link-wallet
export const POST: RequestHandler = async ({ request, platform, cookies }) => {
  const user = await getUserFromSession({ cookies } as any);
  if (!user) return json({ error: 'Not authenticated' }, { status: 401 });

  const { walletAddress, signature, message } = await request.json();

  // Verify signature
  // Update user record with wallet address

  const db = platform?.env?.DB as D1Database;
  await db
    .prepare('UPDATE users SET solana_address = ? WHERE id = ?')
    .bind(walletAddress, user.id)
    .run();

  return json({ success: true });
};
```

## 📦 Benefits

1. **No email required** - Users can authenticate with just their wallet
2. **True ownership** - Strategies linked to blockchain identity
3. **Easy onboarding** - One-click authentication if wallet is connected
4. **Future-proof** - Can add NFT/token-gating, on-chain features, etc.
5. **Privacy** - Users don't need to share personal info

## 🚀 Next Steps

- [ ] Add signature verification in backend
- [ ] Add ability to link Google + Wallet accounts
- [ ] Show wallet address in user profile
- [ ] Add wallet-based features (NFTs, token rewards, etc.)
- [ ] Add message replay prevention
- [ ] Add wallet connection status indicator in UI
