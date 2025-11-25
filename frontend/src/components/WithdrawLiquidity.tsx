"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import { usePools, PoolWithIndex } from "@/contexts/PoolsContext";
import { getProgram, getPoolPda, getAmmPda, getAuthorityPda, getMintLiquidityPda } from "@/lib/program";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAccount, getMint } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { SystemProgram } from "@solana/web3.js";
import StatusMessage from "./StatusMessage";
import { useSavedMints } from "@/hooks/useSavedMints";

export default function WithdrawLiquidity() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const { pools, loading: loadingPools, refreshPools } = usePools();
  const { savedMints } = useSavedMints();

  // Helper to get token name from saved mints
  const getTokenName = (mintAddress: string): string | undefined => {
    const savedMint = savedMints.find((m) => m.address === mintAddress);
    return savedMint?.name;
  };
  const [selectedPool, setSelectedPool] = useState<string>("");
  const [ammIndex, setAmmIndex] = useState<string>("1");
  const [mintA, setMintA] = useState<string>("");
  const [mintB, setMintB] = useState<string>("");
  const [lpBalance, setLpBalance] = useState<string>("");
  const [lpAmount, setLpAmount] = useState<string>("");
  const [estimatedA, setEstimatedA] = useState<string>("");
  const [estimatedB, setEstimatedB] = useState<string>("");
  const [poolReserveA, setPoolReserveA] = useState<string>("");
  const [poolReserveB, setPoolReserveB] = useState<string>("");
  const [totalLp, setTotalLp] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");

  const fetchLpBalance = async (pool: PoolWithIndex) => {
    if (!publicKey || !pool) {
      setLpBalance("");
      return;
    }

    try {
      const mintLiquidityPda = await getMintLiquidityPda(pool.amm, pool.mintA, pool.mintB);
      const lpAccount = getAssociatedTokenAddressSync(mintLiquidityPda, publicKey, false);
      
      try {
        const account = await getAccount(connection, lpAccount);
        const mintInfo = await getMint(connection, mintLiquidityPda);
        const balance = (Number(account.amount) / Math.pow(10, mintInfo.decimals)).toFixed(6);
        setLpBalance(balance);
        
        // Also get total LP supply
        const totalSupply = (Number(mintInfo.supply) / Math.pow(10, mintInfo.decimals)).toFixed(6);
        setTotalLp(totalSupply);
      } catch (error) {
        setLpBalance("0.000000");
        setTotalLp("0.000000");
      }
    } catch (error) {
      console.error("Error fetching LP balance:", error);
      setLpBalance("Error");
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

  const calculateEstimatedOutput = async (lpAmountToBurn: string, pool: PoolWithIndex) => {
    if (!lpAmountToBurn || parseFloat(lpAmountToBurn) <= 0 || !pool) {
      setEstimatedA("");
      setEstimatedB("");
      return;
    }

    try {
      const mintLiquidityPda = await getMintLiquidityPda(pool.amm, pool.mintA, pool.mintB);
      const mintLiquidityInfo = await getMint(connection, mintLiquidityPda);
      const totalLpSupply = new BN(mintLiquidityInfo.supply.toString());
      
      const authorityPda = await getAuthorityPda(pool.amm, pool.mintA, pool.mintB);
      const poolAccountA = getAssociatedTokenAddressSync(pool.mintA, authorityPda, true);
      const poolAccountB = getAssociatedTokenAddressSync(pool.mintB, authorityPda, true);
      
      const accountA = await getAccount(connection, poolAccountA);
      const accountB = await getAccount(connection, poolAccountB);
      const mintAInfo = await getMint(connection, pool.mintA);
      const mintBInfo = await getMint(connection, pool.mintB);
      
      const reserveA = new BN(accountA.amount.toString());
      const reserveB = new BN(accountB.amount.toString());
      
      const lpAmountBN = new BN(Math.floor(parseFloat(lpAmountToBurn) * Math.pow(10, mintLiquidityInfo.decimals)));
      
      // Calculate: amount_out = (lp_to_burn * reserve) / total_lp
      const amountAOut = lpAmountBN.mul(reserveA).div(totalLpSupply);
      const amountBOut = lpAmountBN.mul(reserveB).div(totalLpSupply);
      
      const estimatedAValue = (Number(amountAOut.toString()) / Math.pow(10, mintAInfo.decimals)).toFixed(6);
      const estimatedBValue = (Number(amountBOut.toString()) / Math.pow(10, mintBInfo.decimals)).toFixed(6);
      
      setEstimatedA(estimatedAValue);
      setEstimatedB(estimatedBValue);
    } catch (error) {
      console.error("Error calculating estimated output:", error);
      setEstimatedA("Error");
      setEstimatedB("Error");
    }
  };

  const handlePoolSelect = async (poolAddress: string) => {
    if (!poolAddress) {
      setSelectedPool("");
      setAmmIndex("1");
      setMintA("");
      setMintB("");
      setLpBalance("");
      setLpAmount("");
      setEstimatedA("");
      setEstimatedB("");
      setPoolReserveA("");
      setPoolReserveB("");
      setTotalLp("");
      return;
    }

    const pool = pools.find((p) => p.poolPda.toString() === poolAddress);

    if (pool) {
      setSelectedPool(poolAddress);
      setAmmIndex(pool.ammIndex.toString());
      setMintA(pool.mintA.toString());
      setMintB(pool.mintB.toString());
      
      // Fetch LP balance and pool reserves
      await fetchLpBalance(pool);
      await fetchPoolReserves(pool);
    }
  };

  useEffect(() => {
    if (selectedPool && lpAmount) {
      const pool = pools.find((p) => p.poolPda.toString() === selectedPool);
      if (pool) {
        calculateEstimatedOutput(lpAmount, pool);
      }
    } else {
      setEstimatedA("");
      setEstimatedB("");
    }
  }, [lpAmount, selectedPool, pools, connection]);

  const handleWithdrawLiquidity = async () => {
    if (!publicKey || !signTransaction) {
      setStatus("Please connect your wallet");
      return;
    }

    if (!selectedPool || !lpAmount || parseFloat(lpAmount) <= 0) {
      setStatus("Please select a pool and enter LP amount to withdraw");
      return;
    }

    const pool = pools.find((p) => p.poolPda.toString() === selectedPool);
    if (!pool) {
      setStatus("Pool not found");
      return;
    }

    if (parseFloat(lpAmount) > parseFloat(lpBalance)) {
      setStatus(`Insufficient LP balance. You have ${lpBalance} LP tokens.`);
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
      const mintLiquidityPda = await getMintLiquidityPda(ammPda, mintAPubkey, mintBPubkey);

      const mintLiquidityInfo = await getMint(connection, mintLiquidityPda);
      const lpAmountBN = new BN(Math.floor(parseFloat(lpAmount) * Math.pow(10, mintLiquidityInfo.decimals)));

      const tx = await program.methods
        .withdrawLiquidity(lpAmountBN)
        .accounts({
          pool: poolPda,
          mintA: mintAPubkey,
          mintB: mintBPubkey,
          mintLiquidity: mintLiquidityPda,
          depositor: publicKey,
          payer: publicKey,
        })
        .rpc();

      setStatus(`Success! Liquidity withdrawn.\nTransaction: ${tx}`);
      
      // Refresh pools after successful operation
      await refreshPools();
      
      // Refresh LP balance and estimates
      await fetchLpBalance(pool);
      await fetchPoolReserves(pool);
      setLpAmount("");
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
      <h2 className="text-2xl font-bold mb-4">Withdraw Liquidity</h2>
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
              const poolMintAName = getTokenName(pool.mintA.toString());
              const poolMintBName = getTokenName(pool.mintB.toString());
              const displayA = poolMintAName || `${pool.mintA.toString().slice(0, 8)}...`;
              const displayB = poolMintBName || `${pool.mintB.toString().slice(0, 8)}...`;
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
              <p className="text-sm text-blue-700">
                {getTokenName(mintA) || "Token A"}: {poolReserveA} | {getTokenName(mintB) || "Token B"}: {poolReserveB}
              </p>
              {totalLp && (
                <p className="text-sm text-blue-700 mt-1">
                  Total LP Supply: {totalLp}
                </p>
              )}
            </div>
          )}
        </div>
        {selectedPool && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your LP Token Balance
              </label>
              <div className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-md">
                <p className="text-lg font-semibold text-gray-800">
                  {lpBalance || "Loading..."} LP
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                LP Amount to Withdraw
              </label>
              <input
                type="number"
                value={lpAmount}
                onChange={(e) => setLpAmount(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="0.0"
                step="0.000000001"
                max={lpBalance}
              />
              {lpBalance && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setLpAmount((parseFloat(lpBalance) * 0.25).toFixed(6))}
                    className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded-md"
                  >
                    25%
                  </button>
                  <button
                    onClick={() => setLpAmount((parseFloat(lpBalance) * 0.5).toFixed(6))}
                    className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded-md"
                  >
                    50%
                  </button>
                  <button
                    onClick={() => setLpAmount((parseFloat(lpBalance) * 0.75).toFixed(6))}
                    className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded-md"
                  >
                    75%
                  </button>
                  <button
                    onClick={() => setLpAmount(lpBalance)}
                    className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded-md"
                  >
                    100%
                  </button>
                </div>
              )}
            </div>
            {lpAmount && parseFloat(lpAmount) > 0 && (estimatedA || estimatedB) && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm font-medium text-green-900 mb-2">Estimated Output:</p>
                <p className="text-sm text-green-700">
                  {getTokenName(mintA) || "Token A"}: <span className="font-semibold">{estimatedA}</span>
                </p>
                <p className="text-sm text-green-700">
                  {getTokenName(mintB) || "Token B"}: <span className="font-semibold">{estimatedB}</span>
                </p>
              </div>
            )}
            <button
              onClick={handleWithdrawLiquidity}
              disabled={loading || !lpAmount || parseFloat(lpAmount) <= 0}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Withdrawing..." : "Withdraw Liquidity"}
            </button>
          </>
        )}
        <StatusMessage
          status={status}
          onClose={() => setStatus("")}
        />
      </div>
    </div>
  );
}

