"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import { useSavedMints } from "@/hooks/useSavedMints";
import { getProgram, getPoolPda, getAmmPda, getAuthorityPda, getMintLiquidityPda, getAllPools, AmmPool } from "@/lib/program";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAccount, getMint } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { SystemProgram } from "@solana/web3.js";
import StatusMessage from "./StatusMessage";

interface PoolWithIndex extends AmmPool {
  ammIndex: number;
  poolPda: PublicKey;
  reserveA?: string;
  reserveB?: string;
}

export default function AddLiquidity() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const { savedMints } = useSavedMints();
  const [pools, setPools] = useState<PoolWithIndex[]>([]);
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
  const [loading, setLoading] = useState(false);
  const [loadingPools, setLoadingPools] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [status, setStatus] = useState<string>("");

  const fetchPools = async () => {
    if (!publicKey || !signTransaction) {
      return;
    }

    setLoadingPools(true);
    try {
      const program = getProgram(connection, { publicKey, signTransaction, signAllTransactions } as any);
      const allPools = await getAllPools(program);
      
      // Fetch AMM data to get index for each pool
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
              };
            } catch (error) {
              // If can't fetch reserves, still return pool without reserves
              return {
                ...pool,
                ammIndex: ammData.index,
                poolPda,
                reserveA: "N/A",
                reserveB: "N/A",
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
    } finally {
      setLoadingPools(false);
    }
  };

  useEffect(() => {
    if (publicKey && signTransaction) {
      fetchPools();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, signTransaction]);

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
      return;
    }

    const pool = pools.find((p) => p.poolPda.toString() === poolAddress);

    if (pool) {
      setSelectedPool(poolAddress);
      setAmmIndex(pool.ammIndex.toString());
      setMintA(pool.mintA.toString());
      setMintB(pool.mintB.toString());
      
      // Fetch pool reserves
      await fetchPoolReserves(pool);
      
      // Fetch user balances
      await fetchTokenBalance(pool.mintA.toString(), setBalanceA);
      await fetchTokenBalance(pool.mintB.toString(), setBalanceB);
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

      const decimals = 9; // Assuming 9 decimals
      const amountABN = new BN(parseFloat(amountA) * Math.pow(10, decimals));
      const amountBBN = new BN(parseFloat(amountB) * Math.pow(10, decimals));

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
          depositor: publicKey,
          depositorAccountA: depositorAccountA,
          depositorAccountB: depositorAccountB,
          payer: publicKey,
        })
        .rpc();

      setStatus(`Success! Liquidity added.\nTransaction: ${tx}`);
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
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Select Pool
            </label>
            <button
              onClick={fetchPools}
              disabled={loadingPools}
              className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
            >
              {loadingPools ? "Loading..." : "Refresh"}
            </button>
          </div>
          <select
            value={selectedPool}
            onChange={(e) => handlePoolSelect(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 bg-white"
            disabled={loadingPools}
          >
            <option value="">
              {loadingPools ? "Loading pools..." : "Select a pool..."}
            </option>
            {pools.map((pool) => (
              <option key={pool.poolPda.toString()} value={pool.poolPda.toString()}>
                {pool.mintA.toString().slice(0, 8)}... / {pool.mintB.toString().slice(0, 8)}... (AMM #{pool.ammIndex})
              </option>
            ))}
          </select>
          {pools.length === 0 && !loadingPools && (
            <p className="mt-1 text-sm text-gray-500">No pools found. Create a pool first.</p>
          )}
          {selectedPool && (poolReserveA || poolReserveB) && (
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm font-medium text-blue-900 mb-1">Pool Reserves:</p>
              <p className="text-sm text-blue-700">
                Token A: {poolReserveA} | Token B: {poolReserveB}
              </p>
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
            Mint A Address
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
            Mint B Address
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
            Amount A
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
            Amount B
          </label>
          <input
            type="number"
            value={amountB}
            onChange={(e) => setAmountB(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="0.0"
            step="0.000000001"
          />
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

