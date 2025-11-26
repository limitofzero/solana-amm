import { Connection, PublicKey } from "@solana/web3.js";
import { getMint, Mint } from "@solana/spl-token";

const mintCache = new Map<string, Mint>();

export async function getCachedMint(
  connection: Connection,
  mintAddress: PublicKey | string
): Promise<Mint> {
  const address = typeof mintAddress === "string" ? mintAddress : mintAddress.toString();
  
  if (mintCache.has(address)) {
    return mintCache.get(address)!;
  }

  const mint = await getMint(connection, new PublicKey(address));
  mintCache.set(address, mint);
  return mint;
}

