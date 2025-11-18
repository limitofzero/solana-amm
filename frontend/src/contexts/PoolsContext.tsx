"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getProgram, getAllPools, AmmPool, getPoolPda, getAuthorityPda } from "@/lib/program";
import { getAccount, getMint, getAssociatedTokenAddressSync } from "@solana/spl-token";

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
      
      // Fetch AMM data to get index and fee for each pool
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
            
            // Get pool reserves
            try {
              const authorityPda = await getAuthorityPda(pool.amm, pool.mintA, pool.mintB);
              const poolAccountA = getAssociatedTokenAddressSync(pool.mintA, authorityPda, true);
              const poolAccountB = getAssociatedTokenAddressSync(pool.mintB, authorityPda, true);
              
              const accountA = await getAccount(connection, poolAccountA);
              const accountB = await getAccount(connection, poolAccountB);
              const mintAInfo = await getMint(connection, pool.mintA);
              const mintBInfo = await getMint(connection, pool.mintB);
              
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
              // If can't fetch reserves, still return pool without reserves
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

