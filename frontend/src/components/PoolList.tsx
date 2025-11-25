"use client";

import { usePools } from "@/contexts/PoolsContext";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount, getMint } from "@solana/spl-token";
import { getMintLiquidityPda } from "@/lib/program";
import CopyableAddress from "./CopyableAddress";
import { useSavedMints } from "@/hooks/useSavedMints";

interface PoolShare {
  poolPda: string;
  share: string;
}

export default function PoolList() {
  const { pools, loading, refreshPools } = usePools();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const { savedMints } = useSavedMints();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [poolShares, setPoolShares] = useState<PoolShare[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);

  // Helper to get token name from saved mints
  const getTokenName = (mintAddress: string): string | undefined => {
    const savedMint = savedMints.find((m) => m.address === mintAddress);
    return savedMint?.name;
  };

  const fetchPoolShares = async () => {
    if (!publicKey || pools.length === 0) {
      setPoolShares([]);
      return;
    }

    setLoadingShares(true);
    try {
      const shares = await Promise.all(
        pools.map(async (pool) => {
          try {
            const mintLiquidityPda = await getMintLiquidityPda(pool.amm, pool.mintA, pool.mintB);
            const userLpAccount = getAssociatedTokenAddressSync(mintLiquidityPda, publicKey, false);
            
            let userLpAmount = BigInt(0);
            try {
              const userAccount = await getAccount(connection, userLpAccount);
              userLpAmount = userAccount.amount;
            } catch (error) {
              // User doesn't have LP tokens
              userLpAmount = BigInt(0);
            }

            const mintInfo = await getMint(connection, mintLiquidityPda);
            const totalSupply = mintInfo.supply;

            if (totalSupply === BigInt(0)) {
              return { poolPda: pool.poolPda.toString(), share: "0.00" };
            }

            const share = (Number(userLpAmount) / Number(totalSupply)) * 100;
            return { poolPda: pool.poolPda.toString(), share: share.toFixed(2) };
          } catch (error) {
            console.error("Error fetching pool share:", error);
            return { poolPda: pool.poolPda.toString(), share: "N/A" };
          }
        })
      );

      setPoolShares(shares);
    } catch (error) {
      console.error("Error fetching pool shares:", error);
    } finally {
      setLoadingShares(false);
    }
  };

  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      refreshPools();
    }, 60000); // Refresh every 1 minute
    
    return () => clearInterval(interval);
  }, [autoRefresh, refreshPools]);

  useEffect(() => {
    if (publicKey && pools.length > 0) {
      fetchPoolShares();
    } else {
      setPoolShares([]);
    }
  }, [publicKey, pools]);

  if (loading) {
    return (
      <div className="bg-gray-50 p-6 rounded-lg">
        <h2 className="text-2xl font-bold mb-4">All Pools</h2>
        <p className="text-gray-600">Loading pools...</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 p-6 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">All Pools</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 rounded-md ${
              autoRefresh
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-gray-300 text-gray-700 hover:bg-gray-400"
            }`}
          >
            {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
          </button>
          <button
            onClick={refreshPools}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>
      {pools.length === 0 ? (
        <p className="text-gray-600">No pools found. Create a pool to get started!</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white rounded-lg shadow">
            <thead className="bg-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Mint A
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Mint B
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Reserve A
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Reserve B
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Fee
                </th>
                {publicKey && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Your Share
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pools.map((pool, index) => {
                const share = poolShares.find((s) => s.poolPda === pool.poolPda.toString());
                const mintAName = getTokenName(pool.mintA.toString());
                const mintBName = getTokenName(pool.mintB.toString());
                return (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <CopyableAddress 
                        address={pool.mintA.toString()} 
                        short={true}
                        displayName={mintAName}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <CopyableAddress 
                        address={pool.mintB.toString()} 
                        short={true}
                        displayName={mintBName}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {pool.reserveA ? `${pool.reserveA} ${mintAName ? `(${mintAName})` : ""}` : "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {pool.reserveB ? `${pool.reserveB} ${mintBName ? `(${mintBName})` : ""}` : "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {pool.fee ? (pool.fee / 100).toFixed(2) + "%" : "N/A"}
                    </td>
                    {publicKey && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {loadingShares ? (
                          <span className="text-gray-400">Loading...</span>
                        ) : share ? (
                          <span className={parseFloat(share.share) > 0 ? "font-semibold text-green-600" : ""}>
                            {share.share}%
                          </span>
                        ) : (
                          "N/A"
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

