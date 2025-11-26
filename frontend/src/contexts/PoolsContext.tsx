"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getProgram, getAllPools, AmmPool, getPoolPda, getAuthorityPda } from "@/lib/program";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { getCachedMint } from "@/lib/mintCache";

export interface PoolWithIndex extends AmmPool {
  ammIndex: number;
  poolPda: PublicKey;
  reserveA?: string;
  reserveB?: string;
  fee?: number;
}

interface PoolsContextType {
  pools: PoolWithIndex[];
  loading: boolean;
  refreshPools: () => Promise<void>;
}

const PoolsContext = createContext<PoolsContextType | undefined>(undefined);

export function PoolsProvider({ children }: { children: ReactNode }) {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const [pools, setPools] = useState<PoolWithIndex[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPools = async () => {
    if (!publicKey || !signTransaction) {
      setPools([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const program = getProgram(connection, { publicKey, signTransaction, signAllTransactions } as any);
      const allPools = await getAllPools(program);
      
      const poolsWithIndex = await Promise.all(
        allPools.map(async (pool) => {
          try {
            const accountNamespace = program.account as unknown as {
              amm: {
                fetch: (address: PublicKey) => Promise<{ index: number; fee: number; admin: PublicKey }>;
              };
            };
            const ammData = await accountNamespace.amm.fetch(pool.amm);
            const poolPda = await getPoolPda(pool.amm, pool.mintA, pool.mintB);
            
            try {
              const authorityPda = await getAuthorityPda(pool.amm, pool.mintA, pool.mintB);
              const poolAccountA = getAssociatedTokenAddressSync(pool.mintA, authorityPda, true);
              const poolAccountB = getAssociatedTokenAddressSync(pool.mintB, authorityPda, true);
              
              const accountA = await getAccount(connection, poolAccountA);
              const accountB = await getAccount(connection, poolAccountB);
              const mintAInfo = await getCachedMint(connection, pool.mintA);
              const mintBInfo = await getCachedMint(connection, pool.mintB);
              
              const reserveA = (Number(accountA.amount) / Math.pow(10, mintAInfo.decimals)).toFixed(6);
              const reserveB = (Number(accountB.amount) / Math.pow(10, mintBInfo.decimals)).toFixed(6);
              
              return {
                ...pool,
                ammIndex: ammData.index,
                poolPda,
                reserveA,
                reserveB,
                fee: ammData.fee,
              };
            } catch (error) {
              return {
                ...pool,
                ammIndex: ammData.index,
                poolPda,
                reserveA: "N/A",
                reserveB: "N/A",
                fee: ammData.fee,
              };
            }
          } catch (error) {
            console.error("Error fetching AMM data:", error);
            return null;
          }
        })
      );

      const validPools = poolsWithIndex.filter((pool) => pool !== null) as PoolWithIndex[];
      setPools(validPools);
    } catch (error) {
      console.error("Error fetching pools:", error);
      setPools([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (publicKey && signTransaction) {
      fetchPools();
    } else {
      setPools([]);
      setLoading(false);
    }
  }, [publicKey, signTransaction, connection]);

  return (
    <PoolsContext.Provider value={{ pools, loading, refreshPools: fetchPools }}>
      {children}
    </PoolsContext.Provider>
  );
}

export function usePools() {
  const context = useContext(PoolsContext);
  if (context === undefined) {
    throw new Error("usePools must be used within a PoolsProvider");
  }
  return context;
}

