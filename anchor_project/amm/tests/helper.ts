import { Connection, PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {assert} from "chai";
import { Amm } from "../target/types/amm";
import { createMint } from "@solana/spl-token";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";

export async function airdrop(connection: Connection, address: PublicKey, amount = 1_000_000_000) {
  await connection.confirmTransaction(await connection.requestAirdrop(address, amount), "confirmed");
}

export function indexToSeed(index: number) {
  const indexSeed = Buffer.alloc(2)
  indexSeed.writeInt16LE(index)
  return indexSeed;
}

export async function checkAmm(
    program: anchor.Program<Amm>,
    amm: PublicKey,
    admin: PublicKey,
    index: number,
    fee: number,
) {
  let ammData = await program.account.amm.fetch(amm);

  assert.strictEqual(ammData.admin.toBase58(), admin.toBase58(), `AMM admin should be "${admin.toBase58()}" but was "${ammData.admin.toBase58()}"`);
  assert.strictEqual(ammData.index, index, `AMM index should be ${index} but was ${ammData.index}`);
  assert.strictEqual(ammData.fee, fee, `AMM fee should be ${fee} but was ${ammData.fee}`);
}

export async function createMintSafe(
  connection: Connection,
  payer: Keypair,
  mintAuthority: PublicKey,
  decimals: number,
  keypair: Keypair
) {
  try {
    await createMint(connection, payer, mintAuthority, null, decimals, keypair);
  } catch (err) {
  }
}

export interface CreateAmmResult {
  ammPda: PublicKey;
}

export async function createAmm(
  program: anchor.Program<Amm>,
  signer: Keypair,
  adminAccount: PublicKey,
  fee: number,
  index: number
): Promise<CreateAmmResult> {
  const [ammPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("AMM"), indexToSeed(index)],
    program.programId
  );

  await program.methods.createAmm(fee, index).accounts({
    amm: ammPda,
    adminAccount: adminAccount,
    signer: signer.publicKey,
    systemProgram: SystemProgram.programId,
  }).signers([signer]).rpc({ commitment: "confirmed" });

  return { ammPda };
}

export interface CreatePoolResult {
  poolPda: PublicKey;
  mintLiquidityPda: PublicKey;
  authorityPda: PublicKey;
  poolAccountA: PublicKey;
  poolAccountB: PublicKey;
}

export async function createPool(
  program: anchor.Program<Amm>,
  signer: Keypair,
  ammPda: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey
): Promise<CreatePoolResult> {
  const [poolPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("AMM_POOL"),
      ammPda.toBuffer(),
      mintA.toBuffer(),
      mintB.toBuffer(),
    ],
    program.programId
  );

  const [mintLiquidityPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("AMM_MINT_LIQUIDITY"),
      ammPda.toBuffer(),
      mintA.toBuffer(),
      mintB.toBuffer(),
    ],
    program.programId
  );

  const [authorityPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("AMM_POOL_AUTHORITY"),
      ammPda.toBuffer(),
      mintA.toBuffer(),
      mintB.toBuffer(),
    ],
    program.programId
  );

  const poolAccountA = getAssociatedTokenAddressSync(
    mintA,
    authorityPda,
    true
  );

  const poolAccountB = getAssociatedTokenAddressSync(
    mintB,
    authorityPda,
    true
  );

  await program.methods.createPool().accounts({
    amm: ammPda,
    pool: poolPda,
    mintLiquidity: mintLiquidityPda,
    poolAccountA: poolAccountA,
    poolAccountB: poolAccountB,
    authority: authorityPda,
    mintA: mintA,
    mintB: mintB,
    signer: signer.publicKey,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  }).signers([signer]).rpc({ commitment: "confirmed" });

  return {
    poolPda,
    mintLiquidityPda,
    authorityPda,
    poolAccountA,
    poolAccountB,
  };
}