"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import { usePools, PoolWithIndex } from "@/contexts/PoolsContext";
import { getProgram, getPoolPda, getAmmPda, getAuthorityPda, getMintLiquidityPda } from "@/lib/program";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAccount } from "@solana/spl-token";
import { getCachedMint } from "@/lib/mintCache";
import { BN } from "@coral-xyz/anchor";
import StatusMessage from "./StatusMessage";
import { useSavedMints } from "@/hooks/useSavedMints";
import { PoolState, UIState } from "@/types/componentState";

interface WithdrawState {
  lpBalance: string;
  lpAmount: string;
  estimatedA: string;
  estimatedB: string;
  totalLp: string;
}

export default function WithdrawLiquidity() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const { pools, loading: loadingPools, refreshPools } = usePools();
  const { savedMints } = useSavedMints();

  const getTokenName = (mintAddress: string): string | undefined => {
    const savedMint = savedMints.find((m) => m.address === mintAddress);
    return savedMint?.name;
  };

  const [poolState, setPoolState] = useState<PoolState>({
    selectedPool: "",
    ammIndex: "1",
    mintA: "",
    mintB: "",
    poolReserveA: "",
    poolReserveB: "",
  });

  const [withdrawState, setWithdrawState] = useState<WithdrawState>({
    lpBalance: "",
    lpAmount: "",
    estimatedA: "",
    estimatedB: "",
    totalLp: "",
  });

  const [uiState, setUIState] = useState<UIState>({
    loading: false,
    status: "",
  });

  const fetchLpBalance = async (pool: PoolWithIndex) => {
    if (!publicKey || !pool) {
      setWithdrawState(prev => ({ ...prev, lpBalance: "", totalLp: "" }));
      return;
    }

    try {
      const mintLiquidityPda = await getMintLiquidityPda(pool.amm, pool.mintA, pool.mintB);
      const lpAccount = getAssociatedTokenAddressSync(mintLiquidityPda, publicKey, false);
      
      try {
        const account = await getAccount(connection, lpAccount);
        const mintInfo = await getCachedMint(connection, mintLiquidityPda);
        const balance = (Number(account.amount) / Math.pow(10, mintInfo.decimals)).toFixed(6);
        const totalSupply = (Number(mintInfo.supply) / Math.pow(10, mintInfo.decimals)).toFixed(6);
        setWithdrawState(prev => ({ ...prev, lpBalance: balance, totalLp: totalSupply }));
      } catch (error) {
        setWithdrawState(prev => ({ ...prev, lpBalance: "0.000000", totalLp: "0.000000" }));
      }
    } catch (error) {
      console.error("Error fetching LP balance:", error);
      setWithdrawState(prev => ({ ...prev, lpBalance: "Error" }));
    }
  };

  const fetchPoolReserves = async (pool: PoolWithIndex) => {
    if (!pool) {
      setPoolState(prev => ({ ...prev, poolReserveA: "", poolReserveB: "" }));
      return;
    }

    try {
      if (pool.reserveA && pool.reserveB) {
        setPoolState(prev => ({ ...prev, poolReserveA: pool.reserveA || "", poolReserveB: pool.reserveB || "" }));
      } else {
        const authorityPda = await getAuthorityPda(pool.amm, pool.mintA, pool.mintB);
        const poolAccountA = getAssociatedTokenAddressSync(pool.mintA, authorityPda, true);
        const poolAccountB = getAssociatedTokenAddressSync(pool.mintB, authorityPda, true);
        
        const accountA = await getAccount(connection, poolAccountA);
        const accountB = await getAccount(connection, poolAccountB);
        const mintAInfo = await getCachedMint(connection, pool.mintA);
        const mintBInfo = await getCachedMint(connection, pool.mintB);
        
        const reserveA = (Number(accountA.amount) / Math.pow(10, mintAInfo.decimals)).toFixed(6);
        const reserveB = (Number(accountB.amount) / Math.pow(10, mintBInfo.decimals)).toFixed(6);
        
        setPoolState(prev => ({ ...prev, poolReserveA: reserveA, poolReserveB: reserveB }));
      }
    } catch (error) {
      console.error("Error fetching pool reserves:", error);
      setPoolState(prev => ({ ...prev, poolReserveA: "N/A", poolReserveB: "N/A" }));
    }
  };

  const calculateEstimatedOutput = async (lpAmountToBurn: string, pool: PoolWithIndex) => {
    if (!lpAmountToBurn || parseFloat(lpAmountToBurn) <= 0 || !pool) {
      setWithdrawState(prev => ({ ...prev, estimatedA: "", estimatedB: "" }));
      return;
    }

    try {
      const mintLiquidityPda = await getMintLiquidityPda(pool.amm, pool.mintA, pool.mintB);
      const mintLiquidityInfo = await getCachedMint(connection, mintLiquidityPda);
      const totalLpSupply = new BN(mintLiquidityInfo.supply.toString());
      
      const authorityPda = await getAuthorityPda(pool.amm, pool.mintA, pool.mintB);
      const poolAccountA = getAssociatedTokenAddressSync(pool.mintA, authorityPda, true);
      const poolAccountB = getAssociatedTokenAddressSync(pool.mintB, authorityPda, true);
      
      const accountA = await getAccount(connection, poolAccountA);
      const accountB = await getAccount(connection, poolAccountB);
      const mintAInfo = await getCachedMint(connection, pool.mintA);
      const mintBInfo = await getCachedMint(connection, pool.mintB);
      
      const reserveA = new BN(accountA.amount.toString());
      const reserveB = new BN(accountB.amount.toString());
      
      const lpAmountBN = new BN(Math.floor(parseFloat(lpAmountToBurn) * Math.pow(10, mintLiquidityInfo.decimals)));
      const amountAOut = lpAmountBN.mul(reserveA).div(totalLpSupply);
      const amountBOut = lpAmountBN.mul(reserveB).div(totalLpSupply);
      
      const estimatedAValue = (Number(amountAOut.toString()) / Math.pow(10, mintAInfo.decimals)).toFixed(6);
      const estimatedBValue = (Number(amountBOut.toString()) / Math.pow(10, mintBInfo.decimals)).toFixed(6);
      
      setWithdrawState(prev => ({ ...prev, estimatedA: estimatedAValue, estimatedB: estimatedBValue }));
    } catch (error) {
      console.error("Error calculating estimated output:", error);
      setWithdrawState(prev => ({ ...prev, estimatedA: "Error", estimatedB: "Error" }));
    }
  };

  const handlePoolSelect = async (poolAddress: string) => {
    if (!poolAddress) {
      setPoolState({
        selectedPool: "",
        ammIndex: "1",
        mintA: "",
        mintB: "",
        poolReserveA: "",
        poolReserveB: "",
      });
      setWithdrawState({
        lpBalance: "",
        lpAmount: "",
        estimatedA: "",
        estimatedB: "",
        totalLp: "",
      });
      return;
    }

    const pool = pools.find((p) => p.poolPda.toString() === poolAddress);

    if (pool) {
      setPoolState({
        selectedPool: poolAddress,
        ammIndex: pool.ammIndex.toString(),
        mintA: pool.mintA.toString(),
        mintB: pool.mintB.toString(),
        poolReserveA: "",
        poolReserveB: "",
      });
      await fetchLpBalance(pool);
      await fetchPoolReserves(pool);
    }
  };

  useEffect(() => {
    if (poolState.selectedPool && withdrawState.lpAmount) {
      const pool = pools.find((p) => p.poolPda.toString() === poolState.selectedPool);
      if (pool) {
        calculateEstimatedOutput(withdrawState.lpAmount, pool);
      }
    } else {
      setWithdrawState(prev => ({ ...prev, estimatedA: "", estimatedB: "" }));
    }
  }, [withdrawState.lpAmount, poolState.selectedPool, pools, connection]);

  const handleWithdrawLiquidity = async () => {
    if (!publicKey || !signTransaction) {
      setUIState(prev => ({ ...prev, status: "Please connect your wallet" }));
      return;
    }

    if (!poolState.selectedPool || !withdrawState.lpAmount || parseFloat(withdrawState.lpAmount) <= 0) {
      setUIState(prev => ({ ...prev, status: "Please select a pool and enter LP amount to withdraw" }));
      return;
    }

    const pool = pools.find((p) => p.poolPda.toString() === poolState.selectedPool);
    if (!pool) {
      setUIState(prev => ({ ...prev, status: "Pool not found" }));
      return;
    }

    if (parseFloat(withdrawState.lpAmount) > parseFloat(withdrawState.lpBalance)) {
      setUIState(prev => ({ ...prev, status: `Insufficient LP balance. You have ${withdrawState.lpBalance} LP tokens.` }));
      return;
    }

    setUIState({ loading: true, status: "" });

    try {
      const program = getProgram(connection, { publicKey, signTransaction, signAllTransactions } as any);
      const ammPda = await getAmmPda(parseInt(poolState.ammIndex));
      const mintAPubkey = new PublicKey(poolState.mintA);
      const mintBPubkey = new PublicKey(poolState.mintB);
      const poolPda = await getPoolPda(ammPda, mintAPubkey, mintBPubkey);
      const mintLiquidityPda = await getMintLiquidityPda(ammPda, mintAPubkey, mintBPubkey);

      const mintLiquidityInfo = await getCachedMint(connection, mintLiquidityPda);
      const lpAmountBN = new BN(Math.floor(parseFloat(withdrawState.lpAmount) * Math.pow(10, mintLiquidityInfo.decimals)));

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

      setUIState(prev => ({ ...prev, status: `Success! Liquidity withdrawn.\nTransaction: ${tx}` }));
      
      await refreshPools();
      await fetchLpBalance(pool);
      await fetchPoolReserves(pool);
      setWithdrawState(prev => ({ ...prev, lpAmount: "" }));
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
      setUIState(prev => ({ ...prev, status: `Error: ${detailedError}` }));
    } finally {
      setUIState(prev => ({ ...prev, loading: false }));
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
            value={poolState.selectedPool}
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
          {poolState.selectedPool && (poolState.poolReserveA || poolState.poolReserveB) && (
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm font-medium text-blue-900 mb-1">Pool Reserves:</p>
              <p className="text-sm text-blue-700">
                {getTokenName(poolState.mintA) || "Token A"}: {poolState.poolReserveA} | {getTokenName(poolState.mintB) || "Token B"}: {poolState.poolReserveB}
              </p>
              {withdrawState.totalLp && (
                <p className="text-sm text-blue-700 mt-1">
                  Total LP Supply: {withdrawState.totalLp}
                </p>
              )}
            </div>
          )}
        </div>
        {poolState.selectedPool && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your LP Token Balance
              </label>
              <div className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-md">
                <p className="text-lg font-semibold text-gray-800">
                  {withdrawState.lpBalance || "Loading..."} LP
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                LP Amount to Withdraw
              </label>
              <input
                type="number"
                value={withdrawState.lpAmount}
                onChange={(e) => setWithdrawState(prev => ({ ...prev, lpAmount: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="0.0"
                step="0.000000001"
                max={withdrawState.lpBalance}
              />
              {withdrawState.lpBalance && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setWithdrawState(prev => ({ ...prev, lpAmount: (parseFloat(prev.lpBalance) * 0.25).toFixed(6) }))}
                    className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded-md"
                  >
                    25%
                  </button>
                  <button
                    onClick={() => setWithdrawState(prev => ({ ...prev, lpAmount: (parseFloat(prev.lpBalance) * 0.5).toFixed(6) }))}
                    className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded-md"
                  >
                    50%
                  </button>
                  <button
                    onClick={() => setWithdrawState(prev => ({ ...prev, lpAmount: (parseFloat(prev.lpBalance) * 0.75).toFixed(6) }))}
                    className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded-md"
                  >
                    75%
                  </button>
                  <button
                    onClick={() => setWithdrawState(prev => ({ ...prev, lpAmount: prev.lpBalance }))}
                    className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded-md"
                  >
                    100%
                  </button>
                </div>
              )}
            </div>
            {withdrawState.lpAmount && parseFloat(withdrawState.lpAmount) > 0 && (withdrawState.estimatedA || withdrawState.estimatedB) && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm font-medium text-green-900 mb-2">Estimated Output:</p>
                <p className="text-sm text-green-700">
                  {getTokenName(poolState.mintA) || "Token A"}: <span className="font-semibold">{withdrawState.estimatedA}</span>
                </p>
                <p className="text-sm text-green-700">
                  {getTokenName(poolState.mintB) || "Token B"}: <span className="font-semibold">{withdrawState.estimatedB}</span>
                </p>
              </div>
            )}
            <button
              onClick={handleWithdrawLiquidity}
              disabled={uiState.loading || !withdrawState.lpAmount || parseFloat(withdrawState.lpAmount) <= 0}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uiState.loading ? "Withdrawing..." : "Withdraw Liquidity"}
            </button>
          </>
        )}
        <StatusMessage
          status={uiState.status}
          onClose={() => setUIState(prev => ({ ...prev, status: "" }))}
        />
      </div>
    </div>
  );
}

