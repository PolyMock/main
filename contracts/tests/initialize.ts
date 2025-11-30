import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { PolymarketPaper } from "../target/types/polymarket_paper";

const PROGRAM_ID = new PublicKey("AmuwGa8LXKW63ZHzGm1TkqSugbJ8fMVXr6HKksYkwUNT");
const RPC_URL = "https://rpc.magicblock.app/devnet/";

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");

  const walletPath = path.join(os.homedir(), ".config", "solana", "phantom.json");
  const walletData = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));

  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Program ID:", PROGRAM_ID.toBase58());

  // Set up Anchor provider
  const anchorWallet = new anchor.Wallet(wallet);
  const provider = new anchor.AnchorProvider(connection, anchorWallet, {});
  anchor.setProvider(provider);
  
  // Load the IDL
  const idlPath = path.join(__dirname, "../target/idl/polymarket_paper.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  
  // Create the program interface
  const program = new anchor.Program<PolymarketPaper>(idl as PolymarketPaper, provider);

  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PROGRAM_ID
  );

  console.log("Config PDA:", configPDA.toBase58());

  const existingConfig = await connection.getAccountInfo(configPDA);
  if (existingConfig) {
    console.log("Config account already initialized!");
    return;
  }

  
  const treasury = wallet.publicKey;
  console.log("Treasury (using wallet):", treasury.toBase58());

  console.log("Initializing config account...");

  try {
    const tx = await program.methods
      .initializeConfig(treasury)
      .accountsPartial({
        config: configPDA,
        authority: wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([wallet])
      .rpc();

    console.log("Config initialized!");
    console.log("Transaction:", tx);
    console.log("Config PDA:", configPDA.toBase58());
    console.log("Authority:", wallet.publicKey.toBase58());
    console.log("Treasury:", treasury.toBase58());
    console.log("\nContract successfully initialized on MagicBlock!");
  } catch (error) {
    console.error("Failed to initialize config:", error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
