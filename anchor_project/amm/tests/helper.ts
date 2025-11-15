import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {assert} from "chai";
import { Amm } from "../target/types/amm";
import { createMint } from "@solana/spl-token";

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