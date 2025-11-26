"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import { useSavedMints } from "@/hooks/useSavedMints";
import { usePools, PoolWithIndex } from "@/contexts/PoolsContext";
import { getProgram, getPoolPda, getAmmPda, getAuthorityPda } from "@/lib/program";
import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import { getCachedMint } from "@/lib/mintCache";
import { SystemProgram } from "@solana/web3.js";
import StatusMessage from "./StatusMessage";
import CopyableAddress from "./CopyableAddress";
import { PoolState, BalancesState, UIState } from "@/types/componentState";

interface ExtendedPoolState extends PoolState {
  poolFee: number;
}

interface SwapState {
  amount: string;
  isSwapA: boolean;
  minOut: string;
  estimatedOutput: string;
  slippage: string;
  recommendedMinOut: string;
}

export default function Swap() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const { savedMints } = useSavedMints();
  const { pools, loading: loadingPools, refreshPools } = usePools();

  const getTokenName = (mintAddress: string): string | undefined => {
    const savedMint = savedMints.find((m) => m.address === mintAddress);
    return savedMint?.name;
  };

  const [poolState, setPoolState] = useState<ExtendedPoolState>({
    selectedPool: "",
    ammIndex: "1",
    mintA: "",
    mintB: "",
    poolReserveA: "",
    poolReserveB: "",
    poolFee: 0,
  });

  const [swapState, setSwapState] = useState<SwapState>({
    amount: "",
    isSwapA: true,
    minOut: "0",
    estimatedOutput: "",
    slippage: "",
    recommendedMinOut: "",
  });

  const [balances, setBalances] = useState<BalancesState>({
    balanceA: "",
    balanceB: "",
  });

  const [uiState, setUIState] = useState<UIState>({
    loading: false,
    status: "",
  });


  const fetchTokenBalance = async (mintAddress: string, tokenKey: "balanceA" | "balanceB") => {
    if (!publicKey || !mintAddress) {
      setBalances(prev => ({ ...prev, [tokenKey]: "" }));
      return;
    }

    try {
      const mintPubkey = new PublicKey(mintAddress);
      const tokenAccount = getAssociatedTokenAddressSync(mintPubkey, publicKey, false);
      
      try {
        const account = await getAccount(connection, tokenAccount);
        const mintInfo = await getCachedMint(connection, mintPubkey);
        const balance = (Number(account.amount) / Math.pow(10, mintInfo.decimals)).toFixed(6);
        setBalances(prev => ({ ...prev, [tokenKey]: balance }));
      } catch (error) {
        setBalances(prev => ({ ...prev, [tokenKey]: "0.000000" }));
      }
    } catch (error) {
      console.error("Error fetching token balance:", error);
      setBalances(prev => ({ ...prev, [tokenKey]: "Error" }));
    }
  };

  const fetchPoolReserves = async (pool: PoolWithIndex) => {
    if (!pool) {
      setPoolState(prev => ({ ...prev, poolReserveA: "", poolReserveB: "" }));
      return;
    }

    try {
      if (pool.reserveA && pool.reserveB && pool.reserveA !== "N/A" && pool.reserveB !== "N/A") {
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
      
      if (pool.fee !== undefined) {
        setPoolState(prev => ({ ...prev, poolFee: pool.fee || 0 }));
      } else {
        try {
          const program = getProgram(connection, { publicKey, signTransaction, signAllTransactions } as any);
          const accountNamespace = program.account as unknown as {
            amm: {
              fetch: (address: PublicKey) => Promise<{ index: number; fee: number; admin: PublicKey }>;
            };
          };
          const ammData = await accountNamespace.amm.fetch(pool.amm);
          setPoolState(prev => ({ ...prev, poolFee: ammData.fee }));
        } catch (error) {
          console.error("Error fetching AMM fee:", error);
          setPoolState(prev => ({ ...prev, poolFee: 0 }));
        }
      }
    } catch (error) {
      console.error("Error fetching pool reserves:", error);
      setPoolState(prev => ({ ...prev, poolReserveA: "N/A", poolReserveB: "N/A" }));
    }
  };

  const calculateSwapOutput = async (swapAmount: string, isSwapA: boolean, pool: PoolWithIndex) => {
    if (!swapAmount || parseFloat(swapAmount) <= 0 || !pool || poolState.poolReserveA === "N/A" || poolState.poolReserveB === "N/A") {
      setSwapState(prev => ({ ...prev, estimatedOutput: "", slippage: "", recommendedMinOut: "" }));
      return;
    }

    try {
      const mintAInfo = await getCachedMint(connection, pool.mintA);
      const mintBInfo = await getCachedMint(connection, pool.mintB);
      
      const authorityPda = await getAuthorityPda(pool.amm, pool.mintA, pool.mintB);
      const poolAccountA = getAssociatedTokenAddressSync(pool.mintA, authorityPda, true);
      const poolAccountB = getAssociatedTokenAddressSync(pool.mintB, authorityPda, true);
      
      const accountA = await getAccount(connection, poolAccountA);
      const accountB = await getAccount(connection, poolAccountB);
      
      const inputReserveRaw = isSwapA ? accountA.amount : accountB.amount;
      const outputReserveRaw = isSwapA ? accountB.amount : accountA.amount;
      const inputDecimals = isSwapA ? mintAInfo.decimals : mintBInfo.decimals;
      const outputDecimals = isSwapA ? mintBInfo.decimals : mintAInfo.decimals;
      
      if (inputReserveRaw === BigInt(0) || outputReserveRaw === BigInt(0)) {
        setSwapState(prev => ({ ...prev, estimatedOutput: "", slippage: "", recommendedMinOut: "" }));
        return;
      }

      const amount = parseFloat(swapAmount);
      const amountRaw = BigInt(Math.floor(amount * Math.pow(10, inputDecimals)));
      
      const feeBps = poolState.poolFee;
      const percent = BigInt(10000 - feeBps);
      const amountEff = (amountRaw * percent) / BigInt(10000);
      
      const k = inputReserveRaw * outputReserveRaw;
      const newInputReserve = inputReserveRaw + amountEff;
      const newOutputReserve = k / newInputReserve;
      const outputAmountRaw = outputReserveRaw - newOutputReserve;
      const outputAmount = Number(outputAmountRaw) / Math.pow(10, outputDecimals);
      
      const inputReserveUI = Number(inputReserveRaw) / Math.pow(10, inputDecimals);
      const outputReserveUI = Number(outputReserveRaw) / Math.pow(10, outputDecimals);
      const spotPrice = outputReserveUI / inputReserveUI;
      const expectedOutput = amount * spotPrice;
      const slippagePercent = ((expectedOutput - outputAmount) / expectedOutput) * 100;
      const recommendedMin = outputAmount * 0.99;
      
      setSwapState(prev => ({
        ...prev,
        estimatedOutput: outputAmount.toFixed(6),
        slippage: slippagePercent.toFixed(2),
        recommendedMinOut: recommendedMin.toFixed(6),
      }));
    } catch (error) {
      console.error("Error calculating swap output:", error);
      setSwapState(prev => ({ ...prev, estimatedOutput: "Error", slippage: "Error", recommendedMinOut: "" }));
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
        poolFee: 0,
      });
      setBalances({ balanceA: "", balanceB: "" });
      setSwapState(prev => ({ ...prev, estimatedOutput: "", slippage: "", recommendedMinOut: "" }));
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
        poolFee: 0,
      });
      
      await fetchPoolReserves(pool);
      await fetchTokenBalance(pool.mintA.toString(), "balanceA");
      await fetchTokenBalance(pool.mintB.toString(), "balanceB");
    }
  };

  useEffect(() => {
    if (poolState.mintA && !poolState.selectedPool) {
      fetchTokenBalance(poolState.mintA, "balanceA");
    } else if (!poolState.mintA) {
      setBalances(prev => ({ ...prev, balanceA: "" }));
    }
  }, [poolState.mintA, poolState.selectedPool, publicKey, connection]);

  useEffect(() => {
    if (poolState.mintB && !poolState.selectedPool) {
      fetchTokenBalance(poolState.mintB, "balanceB");
    } else if (!poolState.mintB) {
      setBalances(prev => ({ ...prev, balanceB: "" }));
    }
  }, [poolState.mintB, poolState.selectedPool, publicKey, connection]);

  useEffect(() => {
    if (poolState.selectedPool && swapState.amount && parseFloat(swapState.amount) > 0) {
      const pool = pools.find((p) => p.poolPda.toString() === poolState.selectedPool);
      if (pool && poolState.poolReserveA && poolState.poolReserveB && poolState.poolReserveA !== "N/A" && poolState.poolReserveB !== "N/A") {
        calculateSwapOutput(swapState.amount, swapState.isSwapA, pool);
      }
    } else {
      setSwapState(prev => ({ ...prev, estimatedOutput: "", slippage: "", recommendedMinOut: "" }));
    }
  }, [swapState.amount, swapState.isSwapA, poolState.selectedPool, poolState.poolReserveA, poolState.poolReserveB, poolState.poolFee, pools, connection]);

  const handleSwap = async () => {
    if (!publicKey || !signTransaction) {
      setUIState(prev => ({ ...prev, status: "Please connect your wallet" }));
      return;
    }

    if (!poolState.mintA || !poolState.mintB || !swapState.amount) {
      setUIState(prev => ({ ...prev, status: "Please fill all fields" }));
      return;
    }

    setUIState({ loading: true, status: "" });

    try {
      const program = getProgram(connection, { publicKey, signTransaction, signAllTransactions } as any);
      const ammPda = await getAmmPda(parseInt(poolState.ammIndex));
      const mintAPubkey = new PublicKey(poolState.mintA);
      const mintBPubkey = new PublicKey(poolState.mintB);
      const poolPda = await getPoolPda(ammPda, mintAPubkey, mintBPubkey);

      const mintAInfo = await getCachedMint(connection, mintAPubkey);
      const mintBInfo = await getCachedMint(connection, mintBPubkey);
      
      const inputDecimals = swapState.isSwapA ? mintAInfo.decimals : mintBInfo.decimals;
      const outputDecimals = swapState.isSwapA ? mintBInfo.decimals : mintAInfo.decimals;
      
      const amountBN = new BN(Math.floor(parseFloat(swapState.amount) * Math.pow(10, inputDecimals)));
      const minOutBN = new BN(Math.floor(parseFloat(swapState.minOut || "0") * Math.pow(10, outputDecimals)));

      const authorityPda = await getAuthorityPda(ammPda, mintAPubkey, mintBPubkey);
      const poolAccountA = getAssociatedTokenAddressSync(mintAPubkey, authorityPda, true);
      const poolAccountB = getAssociatedTokenAddressSync(mintBPubkey, authorityPda, true);
      const traderAccountA = getAssociatedTokenAddressSync(mintAPubkey, publicKey, false);
      const traderAccountB = getAssociatedTokenAddressSync(mintBPubkey, publicKey, false);

      const tx = await program.methods
        .swap(swapState.isSwapA, amountBN, minOutBN)
        .accounts({
          amm: ammPda,
          pool: poolPda,
          authority: authorityPda,
          trader: publicKey,
          mintA: mintAPubkey,
          mintB: mintBPubkey,
          poolAccountA: poolAccountA,
          poolAccountB: poolAccountB,
          traderAccountA: traderAccountA,
          traderAccountB: traderAccountB,
          payer: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setUIState(prev => ({ ...prev, status: `Success! Swap completed.\nTransaction: ${tx}` }));
      await refreshPools();
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
      <h2 className="text-2xl font-bold mb-4">Swap Tokens</h2>
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
              <p className="text-sm font-medium text-blue-900 mb-2">Pool Reserves:</p>
              <p className="text-sm text-blue-700 mb-2">
                {getTokenName(poolState.mintA) || "Token A"}: {poolState.poolReserveA} | {getTokenName(poolState.mintB) || "Token B"}: {poolState.poolReserveB}
              </p>
              {poolState.poolReserveA !== "N/A" && poolState.poolReserveB !== "N/A" && parseFloat(poolState.poolReserveA) > 0 && parseFloat(poolState.poolReserveB) > 0 && (
                <div className="mt-2 pt-2 border-t border-blue-300">
                  <p className="text-sm font-medium text-blue-900 mb-1">Exchange Rate:</p>
                  <p className="text-sm text-blue-700">
                    1 {getTokenName(poolState.mintA) || "Token A"} = {((parseFloat(poolState.poolReserveB) / parseFloat(poolState.poolReserveA))).toFixed(6)} {getTokenName(poolState.mintB) || "Token B"}
                  </p>
                  <p className="text-sm text-blue-700">
                    1 {getTokenName(poolState.mintB) || "Token B"} = {((parseFloat(poolState.poolReserveA) / parseFloat(poolState.poolReserveB))).toFixed(6)} {getTokenName(poolState.mintA) || "Token A"}
                  </p>
                </div>
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
            value={poolState.ammIndex}
            onChange={(e) => setPoolState(prev => ({ ...prev, ammIndex: e.target.value }))}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="1"
            disabled={!!poolState.selectedPool}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {getTokenName(poolState.mintA) ? `Token A (${getTokenName(poolState.mintA)})` : "Mint A Address"}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={poolState.mintA}
              onChange={(e) => setPoolState(prev => ({ ...prev, mintA: e.target.value }))}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="Enter mint A public key"
              disabled={!!poolState.selectedPool}
            />
            {poolState.mintA && (
              <CopyableAddress 
                address={poolState.mintA} 
                short={false} 
                className="flex-shrink-0"
                displayName={getTokenName(poolState.mintA)}
              />
            )}
            {savedMints.length > 0 && !poolState.selectedPool && (
              <select
                onChange={(e) => {
                  if (e.target.value) setPoolState(prev => ({ ...prev, mintA: e.target.value }));
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
          {balances.balanceA && (
            <p className="mt-1 text-sm text-gray-600">
              Your balance: <span className="font-semibold">{balances.balanceA}</span>
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {getTokenName(poolState.mintB) ? `Token B (${getTokenName(poolState.mintB)})` : "Mint B Address"}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={poolState.mintB}
              onChange={(e) => setPoolState(prev => ({ ...prev, mintB: e.target.value }))}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="Enter mint B public key"
              disabled={!!poolState.selectedPool}
            />
            {poolState.mintB && (
              <CopyableAddress 
                address={poolState.mintB} 
                short={false} 
                className="flex-shrink-0"
                displayName={getTokenName(poolState.mintB)}
              />
            )}
            {savedMints.length > 0 && !poolState.selectedPool && (
              <select
                onChange={(e) => {
                  if (e.target.value) setPoolState(prev => ({ ...prev, mintB: e.target.value }));
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
          {balances.balanceB && (
            <p className="mt-1 text-sm text-gray-600">
              Your balance: <span className="font-semibold">{balances.balanceB}</span>
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Swap Direction
          </label>
          <select
            value={swapState.isSwapA ? "A to B" : "B to A"}
            onChange={(e) => setSwapState(prev => ({ ...prev, isSwapA: e.target.value === "A to B" }))}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          >
            <option value="A to B">
              {getTokenName(poolState.mintA) || "Token A"} → {getTokenName(poolState.mintB) || "Token B"}
            </option>
            <option value="B to A">
              {getTokenName(poolState.mintB) || "Token B"} → {getTokenName(poolState.mintA) || "Token A"}
            </option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount {swapState.isSwapA ? (getTokenName(poolState.mintA) ? `(${getTokenName(poolState.mintA)})` : "A") : (getTokenName(poolState.mintB) ? `(${getTokenName(poolState.mintB)})` : "B")}
          </label>
          <input
            type="number"
            value={swapState.amount}
            onChange={(e) => setSwapState(prev => ({ ...prev, amount: e.target.value }))}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="0.0"
            step="0.000000001"
          />
        </div>
        {swapState.amount && parseFloat(swapState.amount) > 0 && swapState.estimatedOutput && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm font-medium text-green-900 mb-2">Estimated Output:</p>
            <p className="text-sm text-green-700 mb-1">
              You will receive: <span className="font-semibold">{swapState.estimatedOutput}</span> {swapState.isSwapA ? (getTokenName(poolState.mintB) || "Token B") : (getTokenName(poolState.mintA) || "Token A")}
            </p>
            {swapState.slippage && (
              <p className="text-sm text-green-700 mb-1">
                Slippage: <span className={`font-semibold ${parseFloat(swapState.slippage) > 5 ? "text-red-600" : parseFloat(swapState.slippage) > 2 ? "text-yellow-600" : ""}`}>{swapState.slippage}%</span>
              </p>
            )}
            {swapState.recommendedMinOut && (
              <div className="mt-2 pt-2 border-t border-green-300">
                <p className="text-sm font-medium text-green-900 mb-1">Recommended Min Output:</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={swapState.minOut}
                    onChange={(e) => setSwapState(prev => ({ ...prev, minOut: e.target.value }))}
                    className="flex-1 px-3 py-1 text-sm border border-green-300 rounded-md focus:ring-2 focus:ring-green-500"
                    placeholder={swapState.recommendedMinOut}
                    step="0.000000001"
                  />
                  <button
                    onClick={() => setSwapState(prev => ({ ...prev, minOut: prev.recommendedMinOut }))}
                    className="px-3 py-1 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    Use Recommended
                  </button>
                </div>
                <p className="text-xs text-green-600 mt-1">
                  Based on 1% slippage tolerance
                </p>
              </div>
            )}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Minimum Output (optional)
          </label>
          <input
            type="number"
            value={swapState.minOut}
            onChange={(e) => setSwapState(prev => ({ ...prev, minOut: e.target.value }))}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder={swapState.recommendedMinOut || "0.0"}
            step="0.000000001"
          />
        </div>
        <button
          onClick={handleSwap}
          disabled={uiState.loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uiState.loading ? "Swapping..." : "Swap"}
        </button>
        <StatusMessage
          status={uiState.status}
          onClose={() => setUIState(prev => ({ ...prev, status: "" }))}
        />
      </div>
    </div>
  );
}


