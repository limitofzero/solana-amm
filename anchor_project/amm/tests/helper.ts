import { Connection, PublicKey } from "@solana/web3.js";

export async function airdrop(connection: Connection, address: PublicKey, amount = 1_000_000_000) {
  await connection.confirmTransaction(await connection.requestAirdrop(address, amount), "confirmed");
}

export function indexToSeed(index: number) {
  const indexSeed = Buffer.alloc(2)
  indexSeed.writeInt16LE(index)
  return indexSeed;
}

