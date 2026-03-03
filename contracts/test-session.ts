import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';
import BN from 'bn.js';
import * as fs from 'fs';

const PROGRAM_ID = new PublicKey('cWcQsqrGLagy6KfjKkFjeNWm651s85b7q2ehKp7zSmL');
const SESSION_KEYS_PROGRAM_ID = new PublicKey('KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5');
const RPC = 'https://api.devnet.solana.com';

// Load IDL
const IDL = JSON.parse(fs.readFileSync('./target/idl/polymarket_paper.json', 'utf8'));

// Load wallet keypair (the authority/owner)
const walletKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync('/Users/alex/.config/solana/phantom.json', 'utf8')))
);

async function main() {
  const connection = new Connection(RPC, 'confirmed');

  console.log('Wallet:', walletKeypair.publicKey.toBase58());

  // Create a session keypair (simulating what the frontend does)
  const sessionKeypair = Keypair.generate();
  console.log('Session keypair:', sessionKeypair.publicKey.toBase58());

  // Airdrop to session keypair
  console.log('Airdropping to session keypair...');
  const airdropSig = await connection.requestAirdrop(sessionKeypair.publicKey, 0.05 * 1e9);
  await connection.confirmTransaction(airdropSig, 'confirmed');
  console.log('Airdrop confirmed');

  // Create provider with session keypair as wallet
  const sessionWallet = {
    publicKey: sessionKeypair.publicKey,
    signTransaction: async (tx: Transaction) => {
      tx.partialSign(sessionKeypair);
      return tx;
    },
    signAllTransactions: async (txs: Transaction[]) => {
      txs.forEach(tx => tx.partialSign(sessionKeypair));
      return txs;
    },
  };

  const provider = new AnchorProvider(connection, sessionWallet as any, { commitment: 'confirmed' });
  const program = new Program(IDL as Idl, provider);

  // Derive PDAs using wallet (authority) pubkey
  const [userAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('user'), walletKeypair.publicKey.toBuffer()],
    PROGRAM_ID
  );

  // Get current total_trades to derive position PDA
  const userAccount = await (program.account as any).userAccount.fetch(userAccountPDA);
  const totalTrades = userAccount.totalTrades.toNumber();
  console.log('Total trades:', totalTrades);

  const positionIdBuf = Buffer.alloc(8);
  positionIdBuf.writeBigUInt64LE(BigInt(totalTrades));
  const [positionPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), walletKeypair.publicKey.toBuffer(), positionIdBuf],
    PROGRAM_ID
  );

  // Create a session token PDA (we need to create a session first)
  const SEED_PREFIX = 'session_token';
  const [sessionTokenPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(SEED_PREFIX),
      PROGRAM_ID.toBuffer(),
      sessionKeypair.publicKey.toBuffer(),
      walletKeypair.publicKey.toBuffer(),
    ],
    SESSION_KEYS_PROGRAM_ID
  );
  console.log('Session token PDA:', sessionTokenPDA.toBase58());

  // First, create the session on-chain (this needs the WALLET to sign)
  console.log('\n--- Creating session ---');
  const walletProvider = new AnchorProvider(
    connection,
    {
      publicKey: walletKeypair.publicKey,
      signTransaction: async (tx: Transaction) => { tx.partialSign(walletKeypair); return tx; },
      signAllTransactions: async (txs: Transaction[]) => { txs.forEach(tx => tx.partialSign(walletKeypair)); return txs; },
    } as any,
    { commitment: 'confirmed' }
  );

  // Build create_session instruction manually
  const discriminator = Buffer.from([0xf2, 0xc1, 0x8f, 0xb3, 0x96, 0x19, 0x7a, 0xe3]);
  const parts: number[] = [];
  // Option<bool> top_up = Some(true)
  parts.push(1, 1);
  // Option<i64> valid_until = Some(now + 1 hour)
  parts.push(1);
  const validUntil = Math.floor(Date.now() / 1000) + 3600;
  const validBuf = Buffer.alloc(8);
  validBuf.writeBigInt64LE(BigInt(validUntil));
  parts.push(...validBuf);
  // Option<u64> lamports = Some(10_000_000)
  parts.push(1);
  const lampBuf = Buffer.alloc(8);
  lampBuf.writeBigUInt64LE(BigInt(10_000_000));
  parts.push(...lampBuf);

  const createSessionData = Buffer.concat([discriminator, Buffer.from(parts)]);
  const createSessionIx = {
    keys: [
      { pubkey: sessionTokenPDA, isSigner: false, isWritable: true },
      { pubkey: sessionKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: SESSION_KEYS_PROGRAM_ID,
    data: createSessionData,
  };

  const createSessionTx = new Transaction().add(createSessionIx);
  createSessionTx.feePayer = walletKeypair.publicKey;
  const { blockhash: bh1 } = await connection.getLatestBlockhash();
  createSessionTx.recentBlockhash = bh1;
  createSessionTx.partialSign(sessionKeypair);
  createSessionTx.partialSign(walletKeypair);

  const sessionSig = await connection.sendRawTransaction(createSessionTx.serialize());
  await connection.confirmTransaction(sessionSig, 'confirmed');
  console.log('Session created:', sessionSig);

  // Now try to buy YES using session keypair only
  console.log('\n--- Buying YES with session keypair ---');

  const amountUsdc = new BN(100_000_000); // 100 USDC
  const pricePerShare = new BN(500_000); // 0.50
  const stopLoss = new BN(0);
  const takeProfit = new BN(0);

  try {
    // Approach 1: Using .rpc() with session program
    const sig = await program.methods
      .buyYes('test123', amountUsdc, pricePerShare, stopLoss, takeProfit)
      .accounts({
        userAccount: userAccountPDA,
        positionAccount: positionPDA,
        authority: walletKeypair.publicKey,
        user: sessionKeypair.publicKey,
        sessionToken: sessionTokenPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([sessionKeypair])
      .rpc();

    console.log('SUCCESS! TX:', sig);
  } catch (e: any) {
    console.error('Approach 1 failed:', e.message);
    if (e.logs) console.error('Logs:', e.logs);

    // Approach 2: Manual transaction
    console.log('\n--- Trying manual transaction ---');
    const ix = await program.methods
      .buyYes('test123', amountUsdc, pricePerShare, stopLoss, takeProfit)
      .accounts({
        userAccount: userAccountPDA,
        positionAccount: positionPDA,
        authority: walletKeypair.publicKey,
        user: sessionKeypair.publicKey,
        sessionToken: sessionTokenPDA,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    console.log('Instruction keys:', ix.keys.map(k => ({
      pubkey: k.pubkey.toBase58(),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })));

    const tx = new Transaction().add(ix);
    tx.feePayer = sessionKeypair.publicKey;
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.sign(sessionKeypair);

    const sig2 = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    console.log('TX sent:', sig2);

    try {
      await connection.confirmTransaction(sig2, 'confirmed');
      console.log('SUCCESS! TX confirmed:', sig2);
    } catch (e2: any) {
      console.error('Manual TX failed');
      const txInfo = await connection.getTransaction(sig2, { commitment: 'confirmed' });
      console.error('TX logs:', txInfo?.meta?.logMessages);
    }
  }
}

main().catch(console.error);
