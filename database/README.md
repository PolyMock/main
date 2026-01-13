# Polymock Database Setup

This directory contains the database schema and migrations for the Polymock application using Cloudflare D1.

## Setup Instructions

### 1. Install Wrangler CLI (if not already installed)
```bash
npm install -g wrangler
```

### 2. Login to Cloudflare
```bash
wrangler login
```

### 3. Create D1 Database
```bash
wrangler d1 create polymock-db
```

This will output something like:
```
✅ Successfully created DB 'polymock-db'
binding = "DB"
database_name = "polymock-db"
database_id = "xxxx-xxxx-xxxx-xxxx"
```

### 4. Update wrangler.toml
Add the database binding to your `wrangler.toml` file:
```toml
[[d1_databases]]
binding = "DB"
database_name = "polymock-db"
database_id = "YOUR_DATABASE_ID_HERE"
```

### 5. Run Migrations

**For local development:**
```bash
wrangler d1 execute polymock-db --local --file=./database/migrations/0001_initial_schema.sql
```

**For production:**
```bash
wrangler d1 execute polymock-db --file=./database/migrations/0001_initial_schema.sql
```

### 6. Verify Tables
```bash
# Local
wrangler d1 execute polymock-db --local --command="SELECT name FROM sqlite_master WHERE type='table';"

# Production
wrangler d1 execute polymock-db --command="SELECT name FROM sqlite_master WHERE type='table';"
```

## Database Schema

### Users Table
Stores Google OAuth authenticated users:
- `google_id`: Unique Google user identifier
- `email`: User's email from Google
- `name`: User's display name
- `picture`: Profile picture URL
- `created_at`: Account creation timestamp
- `last_login`: Last login timestamp

### Backtest Strategies Table
Stores completed backtest configurations and results:
- **Configuration**: All backtest parameters (entry rules, position sizing, exit rules, etc.)
- **Results**: Performance metrics (returns, win rate, profit factor, etc.)
- **Full Data**: Complete trades history, equity curve, and P&L distribution for viewing

## Testing Database Locally

You can use `wrangler d1 execute` to test queries:

```bash
# Insert a test user
wrangler d1 execute polymock-db --local --command="INSERT INTO users (google_id, email, name) VALUES ('test123', 'test@example.com', 'Test User');"

# Query users
wrangler d1 execute polymock-db --local --command="SELECT * FROM users;"
```

## Environment Variables

Make sure to add these to your Cloudflare Pages settings:
- `GOOGLE_CLIENT_ID` - Already configured
- `GOOGLE_CLIENT_SECRET` - Already configured
- `SESSION_SECRET` - Generate a random secret for JWT signing

Generate session secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
