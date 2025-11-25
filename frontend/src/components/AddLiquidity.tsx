"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import { useSavedMints } from "@/hooks/useSavedMints";
import { usePools, PoolWithIndex } from "@/contexts/PoolsContext";
import { getProgram, getPoolPda, getAmmPda, getAuthorityPda, getMintLiquidityPda } from "@/lib/program";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAccount, getMint } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { SystemProgram } from "@solana/web3.js";
import StatusMessage from "./StatusMessage";
import CopyableAddress from "./CopyableAddress";

export default function AddLiquidity() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const { savedMints } = useSavedMints();
  const { pools, loading: loadingPools, refreshPools } = usePools();

  // Helper to get token name from saved mints
  const getTokenName = (mintAddress: string): string | undefined => {
    const savedMint = savedMints.find((m) => m.address === mintAddress);
    return savedMint?.name;
  };
  const [selectedPool, setSelectedPool] = useState<string>("");
  const [ammIndex, setAmmIndex] = useState<string>("1");
  const [mintA, setMintA] = useState<string>("");
  const [mintB, setMintB] = useState<string>("");
  const [amountA, setAmountA] = useState<string>("");
  const [amountB, setAmountB] = useState<string>("");
  const [balanceA, setBalanceA] = useState<string>("");
  const [balanceB, setBalanceB] = useState<string>("");
  const [poolReserveA, setPoolReserveA] = useState<string>("");
  const [poolReserveB, setPoolReserveB] = useState<string>("");
  const [recommendedAmountB, setRecommendedAmountB] = useState<string>("");
  const [userShare, setUserShare] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");

  const fetchTokenBalance = async (mintAddress: string, setBalance: (value: string) => void) => {
    if (!publicKey || !mintAddress) {
      setBalance("");
      return;
    }

    try {
      const mintPubkey = new PublicKey(mintAddress);
      const tokenAccount = getAssociatedTokenAddressSync(mintPubkey, publicKey, false);
      
      try {
        const account = await getAccount(connection, tokenAccount);
        const mintInfo = await getMint(connection, mintPubkey);
        const balance = (Number(account.amount) / Math.pow(10, mintInfo.decimals)).toFixed(6);
        setBalance(balance);
      } catch (error) {
        // Token account doesn't exist
        setBalance("0.000000");
      }
    } catch (error) {
      console.error("Error fetching token balance:", error);
      setBalance("Error");
    }
  };

  const fetchPoolReserves = async (pool: PoolWithIndex) => {
    if (!pool) {
      setPoolReserveA("");
      setPoolReserveB("");
      return;
    }

    try {
      if (pool.reserveA && pool.reserveB) {
        setPoolReserveA(pool.reserveA);
        setPoolReserveB(pool.reserveB);
      } else {
        const authorityPda = await getAuthorityPda(pool.amm, pool.mintA, pool.mintB);
        const poolAccountA = getAssociatedTokenAddressSync(pool.mintA, authorityPda, true);
        const poolAccountB = getAssociatedTokenAddressSync(pool.mintB, authorityPda, true);
        
        const accountA = await getAccount(connection, poolAccountA);
        const accountB = await getAccount(connection, poolAccountB);
        const mintAInfo = await getMint(connection, pool.mintA);
        const mintBInfo = await getMint(connection, pool.mintB);
        
        const reserveA = (Number(accountA.amount) / Math.pow(10, mintAInfo.decimals)).toFixed(6);
        const reserveB = (Number(accountB.amount) / Math.pow(10, mintBInfo.decimals)).toFixed(6);
        
        setPoolReserveA(reserveA);
        setPoolReserveB(reserveB);
      }
    } catch (error) {
      console.error("Error fetching pool reserves:", error);
      setPoolReserveA("N/A");
      setPoolReserveB("N/A");
    }
  };

  const fetchUserShare = async (pool: PoolWithIndex) => {
    if (!publicKey || !pool) {
      setUserShare("");
      return;
    }

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
        setUserShare("0.00");
        return;
      }

      const share = (Number(userLpAmount) / Number(totalSupply)) * 100;
      setUserShare(share.toFixed(2));
    } catch (error) {
      console.error("Error fetching user share:", error);
      setUserShare("N/A");
    }
  };

  const handlePoolSelect = async (poolAddress: string) => {
    if (!poolAddress) {
      setSelectedPool("");
      setAmmIndex("1");
      setMintA("");
      setMintB("");
      setPoolReserveA("");
      setPoolReserveB("");
      setBalanceA("");
      setBalanceB("");
      setAmountA("");
      setAmountB("");
      setRecommendedAmountB("");
      setUserShare("");
      return;
    }

    const pool = pools.find((p) => p.poolPda.toString() === poolAddress);

    if (pool) {
      setSelectedPool(poolAddress);
      setAmmIndex(pool.ammIndex.toString());
      setMintA(pool.mintA.toString());
      setMintB(pool.mintB.toString());
      
      // Use reserves from context if available, otherwise fetch
      if (pool.reserveA && pool.reserveB && pool.reserveA !== "N/A" && pool.reserveB !== "N/A") {
        setPoolReserveA(pool.reserveA);
        setPoolReserveB(pool.reserveB);
      } else {
        await fetchPoolReserves(pool);
      }
      
      // Fetch user balances
      await fetchTokenBalance(pool.mintA.toString(), setBalanceA);
      await fetchTokenBalance(pool.mintB.toString(), setBalanceB);
      
      // Fetch user share
      await fetchUserShare(pool);
    }
  };

  useEffect(() => {
    if (mintA && !selectedPool) {
      fetchTokenBalance(mintA, setBalanceA);
    } else if (!mintA) {
      setBalanceA("");
    }
  }, [mintA, selectedPool, publicKey, connection]);

  useEffect(() => {
    if (mintB && !selectedPool) {
      fetchTokenBalance(mintB, setBalanceB);
    } else if (!mintB) {
      setBalanceB("");
    }
  }, [mintB, selectedPool, publicKey, connection]);

  // Calculate recommended amount B based on amount A and pool reserves
  useEffect(() => {
    if (!amountA || parseFloat(amountA) <= 0) {
      setRecommendedAmountB("");
      return;
    }

    // If pool is selected and has reserves, calculate based on pool ratio
    if (selectedPool && poolReserveA && poolReserveB && poolReserveA !== "N/A" && poolReserveB !== "N/A") {
      const reserveA = parseFloat(poolReserveA);
      const reserveB = parseFloat(poolReserveB);
      
      if (reserveA > 0 && reserveB > 0) {
        // Calculate required B: amountB = amountA * reserveB / reserveA
        const recommendedB = (parseFloat(amountA) * reserveB) / reserveA;
        setRecommendedAmountB(recommendedB.toFixed(6));
      } else {
        setRecommendedAmountB("");
      }
    } else {
      // For new pools, suggest 1:1 ratio
      setRecommendedAmountB(amountA);
    }
  }, [amountA, selectedPool, poolReserveA, poolReserveB]);

  const handleAddLiquidity = async () => {
    if (!publicKey || !signTransaction) {
      setStatus("Please connect your wallet");
      return;
    }

    if (!mintA || !mintB || !amountA || !amountB) {
      setStatus("Please fill all fields");
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const program = getProgram(connection, { publicKey, signTransaction, signAllTransactions } as any);
      const ammPda = await getAmmPda(parseInt(ammIndex));
      const mintAPubkey = new PublicKey(mintA);
      const mintBPubkey = new PublicKey(mintB);
      const poolPda = await getPoolPda(ammPda, mintAPubkey, mintBPubkey);

      // Get actual decimals from mints
      const mintAInfo = await getMint(connection, mintAPubkey);
      const mintBInfo = await getMint(connection, mintBPubkey);
      
      const amountABN = new BN(Math.floor(parseFloat(amountA) * Math.pow(10, mintAInfo.decimals)));
      const amountBBN = new BN(Math.floor(parseFloat(amountB) * Math.pow(10, mintBInfo.decimals)));

      const authorityPda = await getAuthorityPda(ammPda, mintAPubkey, mintBPubkey);
      const mintLiquidityPda = await getMintLiquidityPda(ammPda, mintAPubkey, mintBPubkey);
      
      const depositorAccountA = getAssociatedTokenAddressSync(mintAPubkey, publicKey, false);
      const depositorAccountB = getAssociatedTokenAddressSync(mintBPubkey, publicKey, false);
      const depositorAccountLiquidity = getAssociatedTokenAddressSync(mintLiquidityPda, publicKey, false);
      const poolAccountA = getAssociatedTokenAddressSync(mintAPubkey, authorityPda, true);
      const poolAccountB = getAssociatedTokenAddressSync(mintBPubkey, authorityPda, true);

      const tx = await program.methods
        .addLiquidity(amountABN, amountBBN)
        .accounts({
          pool: poolPda,
          mintA: mintAPubkey,
          mintB: mintBPubkey,
          authority: authorityPda,
          mintLiquidity: mintLiquidityPda,
          poolAccountA: poolAccountA,
          poolAccountB: poolAccountB,
          depositor: publicKey,
          depositorAccountLiquidity: depositorAccountLiquidity,
          depositorAccountA: depositorAccountA,
          depositorAccountB: depositorAccountB,
          payer: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      setStatus(`Success! Liquidity added.\nTransaction: ${tx}`);
      
      // Refresh pools after successful operation
      await refreshPools();
      
      // Refresh user share
      const pool = pools.find((p) => p.poolPda.toString() === selectedPool);
      if (pool) {
        await fetchUserShare(pool);
      }
      
      // Clear amounts
      setAmountA("");
      setAmountB("");
    } catch (error: any) {
      const errorMessage = error.message || error.toString();
      let detailedError = errorMessage;
      if (error.logs && Array.isArray(error.logs)) {
        detailedError += `\n\nLogs:\n${error.logs.join("\n")}`;
      }
      if (error.error) {
        detailedError += `\n\nError Code: ${error.error.code || "Unknown"}`;
        detailedError += `\nError Name: ${error.error.name || "Unknown"}`;
      }
      setStatus(`Error: ${detailedError}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-50 p-6 rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Add Liquidity</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Pool
          </label>
          <select
            value={selectedPool}
            onChange={(e) => handlePoolSelect(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 bg-white"
            disabled={loadingPools}
          >
            <option value="">
              {loadingPools ? "Loading pools..." : "Select a pool..."}
            </option>
            {pools.map((pool) => {
              const mintAName = getTokenName(pool.mintA.toString());
              const mintBName = getTokenName(pool.mintB.toString());
              const displayA = mintAName || `${pool.mintA.toString().slice(0, 8)}...`;
              const displayB = mintBName || `${pool.mintB.toString().slice(0, 8)}...`;
              return (
                <option key={pool.poolPda.toString()} value={pool.poolPda.toString()}>
                  {displayA} / {displayB} (AMM #{pool.ammIndex})
                </option>
              );
            })}
          </select>
          {pools.length === 0 && !loadingPools && (
            <p className="mt-1 text-sm text-gray-500">No pools found. Create a pool first.</p>
          )}
          {selectedPool && (poolReserveA || poolReserveB) && (
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm font-medium text-blue-900 mb-1">Pool Reserves:</p>
              <p className="text-sm text-blue-700 mb-1">
                {getTokenName(mintA) || "Token A"}: {poolReserveA} | {getTokenName(mintB) || "Token B"}: {poolReserveB}
              </p>
              {userShare && userShare !== "N/A" && (
                <p className="text-sm text-blue-700">
                  Your Share: <span className="font-semibold text-blue-900">{userShare}%</span>
                </p>
              )}
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            AMM Index
          </label>
          <input
            type="number"
            value={ammIndex}
            onChange={(e) => setAmmIndex(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="1"
            disabled={!!selectedPool}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {getTokenName(mintA) ? `Token A (${getTokenName(mintA)})` : "Mint A Address"}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={mintA}
              onChange={(e) => setMintA(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="Enter mint A public key"
              disabled={!!selectedPool}
            />
            {mintA && (
              <CopyableAddress 
                address={mintA} 
                short={false} 
                className="flex-shrink-0"
                displayName={getTokenName(mintA)}
              />
            )}
            {savedMints.length > 0 && !selectedPool && (
              <select
                onChange={(e) => {
                  if (e.target.value) setMintA(e.target.value);
                }}
                className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50 focus:ring-2 focus:ring-blue-500"
                value=""
              >
                <option value="">Select saved...</option>
                {savedMints.map((mint) => (
                  <option key={mint.address} value={mint.address}>
                    {mint.name || mint.address.slice(0, 8)}...
                  </option>
                ))}
              </select>
            )}
          </div>
          {balanceA && (
            <p className="mt-1 text-sm text-gray-600">
              Your balance: <span className="font-semibold">{balanceA}</span>
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {getTokenName(mintB) ? `Token B (${getTokenName(mintB)})` : "Mint B Address"}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={mintB}
              onChange={(e) => setMintB(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="Enter mint B public key"
              disabled={!!selectedPool}
            />
            {mintB && (
              <CopyableAddress 
                address={mintB} 
                short={false} 
                className="flex-shrink-0"
                displayName={getTokenName(mintB)}
              />
            )}
            {savedMints.length > 0 && !selectedPool && (
              <select
                onChange={(e) => {
                  if (e.target.value) setMintB(e.target.value);
                }}
                className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50 focus:ring-2 focus:ring-blue-500"
                value=""
              >
                <option value="">Select saved...</option>
                {savedMints.map((mint) => (
                  <option key={mint.address} value={mint.address}>
                    {mint.name || mint.address.slice(0, 8)}...
                  </option>
                ))}
              </select>
            )}
          </div>
          {balanceB && (
            <p className="mt-1 text-sm text-gray-600">
              Your balance: <span className="font-semibold">{balanceB}</span>
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount {getTokenName(mintA) ? `(${getTokenName(mintA)})` : "A"}
          </label>
          <input
            type="number"
            value={amountA}
            onChange={(e) => setAmountA(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="0.0"
            step="0.000000001"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount {getTokenName(mintB) ? `(${getTokenName(mintB)})` : "B"}
          </label>
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="number"
                value={amountB}
                onChange={(e) => setAmountB(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="0.0"
                step="0.000000001"
              />
              {recommendedAmountB && (
                <button
                  onClick={() => setAmountB(recommendedAmountB)}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm whitespace-nowrap"
                  title="Use recommended amount based on pool ratio"
                >
                  Use Recommended
                </button>
              )}
            </div>
            {recommendedAmountB && amountA && parseFloat(amountA) > 0 && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-800">
                  <span className="font-semibold">Recommended:</span> {recommendedAmountB} {getTokenName(mintB) || "Token B"}
                  {selectedPool && poolReserveA && poolReserveB && poolReserveA !== "N/A" && poolReserveB !== "N/A" ? (
                    <span className="text-xs block mt-1 text-green-700">
                      Based on current pool ratio ({poolReserveA} {getTokenName(mintA) || "Token A"} : {poolReserveB} {getTokenName(mintB) || "Token B"})
                    </span>
                  ) : (
                    <span className="text-xs block mt-1 text-green-700">
                      For new pools, 1:1 ratio is recommended
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={handleAddLiquidity}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Adding..." : "Add Liquidity"}
        </button>
        <StatusMessage
          status={status}
          onClose={() => setStatus("")}
        />
      </div>
    </div>
  );
}


