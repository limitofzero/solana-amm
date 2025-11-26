"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import { useSavedMints } from "@/hooks/useSavedMints";
import { usePools, PoolWithIndex } from "@/contexts/PoolsContext";
import { getProgram, getPoolPda, getAmmPda, getAuthorityPda, getMintLiquidityPda } from "@/lib/program";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAccount } from "@solana/spl-token";
import { getCachedMint } from "@/lib/mintCache";
import { BN } from "@coral-xyz/anchor";
import { SystemProgram } from "@solana/web3.js";
import StatusMessage from "./StatusMessage";
import CopyableAddress from "./CopyableAddress";
import { PoolState, BalancesState, UIState } from "@/types/componentState";

interface ExtendedPoolState extends PoolState {
  userShare: string;
}

interface AmountsState {
  amountA: string;
  amountB: string;
  recommendedAmountB: string;
}

export default function AddLiquidity() {
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
    userShare: "",
  });

  const [amounts, setAmounts] = useState<AmountsState>({
    amountA: "",
    amountB: "",
    recommendedAmountB: "",
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

  const fetchUserShare = async (pool: PoolWithIndex) => {
    if (!publicKey || !pool) {
      setPoolState(prev => ({ ...prev, userShare: "" }));
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
        userLpAmount = BigInt(0);
      }

      const mintInfo = await getCachedMint(connection, mintLiquidityPda);
      const totalSupply = mintInfo.supply;

      if (totalSupply === BigInt(0)) {
        setPoolState(prev => ({ ...prev, userShare: "0.00" }));
        return;
      }

      const share = (Number(userLpAmount) / Number(totalSupply)) * 100;
      setPoolState(prev => ({ ...prev, userShare: share.toFixed(2) }));
    } catch (error) {
      console.error("Error fetching user share:", error);
      setPoolState(prev => ({ ...prev, userShare: "N/A" }));
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
        userShare: "",
      });
      setBalances({ balanceA: "", balanceB: "" });
      setAmounts({ amountA: "", amountB: "", recommendedAmountB: "" });
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
        userShare: "",
      });
      
      if (pool.reserveA && pool.reserveB && pool.reserveA !== "N/A" && pool.reserveB !== "N/A") {
        setPoolState(prev => ({ ...prev, poolReserveA: pool.reserveA || "", poolReserveB: pool.reserveB || "" }));
      } else {
        await fetchPoolReserves(pool);
      }
      
      await fetchTokenBalance(pool.mintA.toString(), "balanceA");
      await fetchTokenBalance(pool.mintB.toString(), "balanceB");
      await fetchUserShare(pool);
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
    if (!amounts.amountA || parseFloat(amounts.amountA) <= 0) {
      setAmounts(prev => ({ ...prev, recommendedAmountB: "" }));
      return;
    }

    if (poolState.selectedPool && poolState.poolReserveA && poolState.poolReserveB && poolState.poolReserveA !== "N/A" && poolState.poolReserveB !== "N/A") {
      const reserveA = parseFloat(poolState.poolReserveA);
      const reserveB = parseFloat(poolState.poolReserveB);
      
      if (reserveA > 0 && reserveB > 0) {
        const recommendedB = (parseFloat(amounts.amountA) * reserveB) / reserveA;
        setAmounts(prev => ({ ...prev, recommendedAmountB: recommendedB.toFixed(6) }));
      } else {
        setAmounts(prev => ({ ...prev, recommendedAmountB: "" }));
      }
    } else {
      setAmounts(prev => ({ ...prev, recommendedAmountB: amounts.amountA }));
    }
  }, [amounts.amountA, poolState.selectedPool, poolState.poolReserveA, poolState.poolReserveB]);

  const handleAddLiquidity = async () => {
    if (!publicKey || !signTransaction) {
      setUIState(prev => ({ ...prev, status: "Please connect your wallet" }));
      return;
    }

    if (!poolState.mintA || !poolState.mintB || !amounts.amountA || !amounts.amountB) {
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
      
      const amountABN = new BN(Math.floor(parseFloat(amounts.amountA) * Math.pow(10, mintAInfo.decimals)));
      const amountBBN = new BN(Math.floor(parseFloat(amounts.amountB) * Math.pow(10, mintBInfo.decimals)));

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

      setUIState(prev => ({ ...prev, status: `Success! Liquidity added.\nTransaction: ${tx}` }));
      
      await refreshPools();
      
      const pool = pools.find((p) => p.poolPda.toString() === poolState.selectedPool);
      if (pool) {
        await fetchUserShare(pool);
      }
      
      setAmounts(prev => ({ ...prev, amountA: "", amountB: "" }));
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
      <h2 className="text-2xl font-bold mb-4">Add Liquidity</h2>
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
          {poolState.selectedPool && (poolState.poolReserveA || poolState.poolReserveB) && (
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm font-medium text-blue-900 mb-1">Pool Reserves:</p>
              <p className="text-sm text-blue-700 mb-1">
                {getTokenName(poolState.mintA) || "Token A"}: {poolState.poolReserveA} | {getTokenName(poolState.mintB) || "Token B"}: {poolState.poolReserveB}
              </p>
              {poolState.userShare && poolState.userShare !== "N/A" && (
                <p className="text-sm text-blue-700">
                  Your Share: <span className="font-semibold text-blue-900">{poolState.userShare}%</span>
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
            Amount {getTokenName(poolState.mintA) ? `(${getTokenName(poolState.mintA)})` : "A"}
          </label>
          <input
            type="number"
            value={amounts.amountA}
            onChange={(e) => setAmounts(prev => ({ ...prev, amountA: e.target.value }))}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="0.0"
            step="0.000000001"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount {getTokenName(poolState.mintB) ? `(${getTokenName(poolState.mintB)})` : "B"}
          </label>
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="number"
                value={amounts.amountB}
                onChange={(e) => setAmounts(prev => ({ ...prev, amountB: e.target.value }))}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="0.0"
                step="0.000000001"
              />
              {amounts.recommendedAmountB && (
                <button
                  onClick={() => setAmounts(prev => ({ ...prev, amountB: prev.recommendedAmountB }))}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm whitespace-nowrap"
                  title="Use recommended amount based on pool ratio"
                >
                  Use Recommended
                </button>
              )}
            </div>
            {amounts.recommendedAmountB && amounts.amountA && parseFloat(amounts.amountA) > 0 && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-800">
                  <span className="font-semibold">Recommended:</span> {amounts.recommendedAmountB} {getTokenName(poolState.mintB) || "Token B"}
                  {poolState.selectedPool && poolState.poolReserveA && poolState.poolReserveB && poolState.poolReserveA !== "N/A" && poolState.poolReserveB !== "N/A" ? (
                    <span className="text-xs block mt-1 text-green-700">
                      Based on current pool ratio ({poolState.poolReserveA} {getTokenName(poolState.mintA) || "Token A"} : {poolState.poolReserveB} {getTokenName(poolState.mintB) || "Token B"})
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
          disabled={uiState.loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uiState.loading ? "Adding..." : "Add Liquidity"}
        </button>
        <StatusMessage
          status={uiState.status}
          onClose={() => setUIState(prev => ({ ...prev, status: "" }))}
        />
      </div>
    </div>
  );
}


