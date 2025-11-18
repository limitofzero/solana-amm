import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { WalletContextState } from "@solana/wallet-adapter-react";
import idl from "../../public/amm.json";

const PROGRAM_ID_STRING = process.env.NEXT_PUBLIC_PROGRAM_ID || "264uMZcS5Mcpe5EzAP6P2SoGQE4j7KtpSe6U8mSQZeAN";
export const PROGRAM_ID = new PublicKey(PROGRAM_ID_STRING);

export type AmmProgram = Program<Idl>;

export interface Amm {
  admin: PublicKey;
  index: number;
  fee: number;
}

export interface AmmPool {
  amm: PublicKey;
  mintA: PublicKey;
  mintB: PublicKey;
}

export function getProgram(connection: Connection, wallet: WalletContextState): AmmProgram {
  if (!wallet.publicKey) {
    throw new Error("Wallet not connected");
  }

  const provider = new AnchorProvider(
    connection,
    wallet as any,
    AnchorProvider.defaultOptions()
  );
  return new Program(idl as Idl, provider);
}

export function indexToSeed(index: number): Buffer {
  const indexSeed = Buffer.alloc(2);
  indexSeed.writeInt16LE(index);
  return indexSeed;
}

export async function getAmmPda(index: number): Promise<PublicKey> {
  const [ammPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("AMM"), indexToSeed(index)],
    PROGRAM_ID
  );
  return ammPda;
}

export async function getPoolPda(ammPda: PublicKey, mintA: PublicKey, mintB: PublicKey): Promise<PublicKey> {
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("AMM_POOL"), ammPda.toBuffer(), mintA.toBuffer(), mintB.toBuffer()],
    PROGRAM_ID
  );
  return poolPda;
}

export async function getAuthorityPda(ammPda: PublicKey, mintA: PublicKey, mintB: PublicKey): Promise<PublicKey> {
  const [authorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("AMM_POOL_AUTHORITY"), ammPda.toBuffer(), mintA.toBuffer(), mintB.toBuffer()],
    PROGRAM_ID
  );
  return authorityPda;
}

export async function getMintLiquidityPda(ammPda: PublicKey, mintA: PublicKey, mintB: PublicKey): Promise<PublicKey> {
  const [mintLiquidityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("AMM_MINT_LIQUIDITY"), ammPda.toBuffer(), mintA.toBuffer(), mintB.toBuffer()],
    PROGRAM_ID
  );
  return mintLiquidityPda;
}

export async function getAllPools(program: AmmProgram): Promise<AmmPool[]> {
  try {
    const accountNamespace = program.account as unknown as {
      ammPool: {
        all: () => Promise<Array<{ account: { amm: PublicKey; mintA: PublicKey; mintB: PublicKey } }>>;
      };
    };
    const pools = await accountNamespace.ammPool.all();
    return pools.map((pool) => ({
      amm: pool.account.amm,
      mintA: pool.account.mintA,
      mintB: pool.account.mintB,
    }));
  } catch (error) {
    console.error("Error fetching pools:", error);
    return [];
  }
}

