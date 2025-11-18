"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import { useSavedMints } from "@/hooks/useSavedMints";
import { usePools, PoolWithIndex } from "@/contexts/PoolsContext";
import { getProgram, getPoolPda, getAmmPda, getAuthorityPda } from "@/lib/program";
import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, getAccount, getMint } from "@solana/spl-token";
import { SystemProgram } from "@solana/web3.js";
import StatusMessage from "./StatusMessage";


export default function Swap() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const { savedMints } = useSavedMints();
  const { pools, loading: loadingPools, refreshPools } = usePools();
  const [selectedPool, setSelectedPool] = useState<string>("");
  const [ammIndex, setAmmIndex] = useState<string>("1");
  const [mintA, setMintA] = useState<string>("");
  const [mintB, setMintB] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [isSwapA, setIsSwapA] = useState<boolean>(true);
  const [minOut, setMinOut] = useState<string>("0");
  const [balanceA, setBalanceA] = useState<string>("");
  const [balanceB, setBalanceB] = useState<string>("");
  const [poolReserveA, setPoolReserveA] = useState<string>("");
  const [poolReserveB, setPoolReserveB] = useState<string>("");
  const [poolFee, setPoolFee] = useState<number>(0);
  const [estimatedOutput, setEstimatedOutput] = useState<string>("");
  const [slippage, setSlippage] = useState<string>("");
  const [recommendedMinOut, setRecommendedMinOut] = useState<string>("");
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
      // Use reserves from context if available
      if (pool.reserveA && pool.reserveB && pool.reserveA !== "N/A" && pool.reserveB !== "N/A") {
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
      
      // Use fee from context if available
      if (pool.fee !== undefined) {
        setPoolFee(pool.fee);
      } else {
        // Fetch AMM fee
        try {
          const program = getProgram(connection, { publicKey, signTransaction, signAllTransactions } as any);
          const accountNamespace = program.account as unknown as {
            amm: {
              fetch: (address: PublicKey) => Promise<{ index: number; fee: number; admin: PublicKey }>;
            };
          };
          const ammData = await accountNamespace.amm.fetch(pool.amm);
          setPoolFee(ammData.fee);
        } catch (error) {
          console.error("Error fetching AMM fee:", error);
          setPoolFee(0);
        }
      }
    } catch (error) {
      console.error("Error fetching pool reserves:", error);
      setPoolReserveA("N/A");
      setPoolReserveB("N/A");
    }
  };

  const calculateSwapOutput = async (swapAmount: string, isSwapA: boolean, pool: PoolWithIndex) => {
    if (!swapAmount || parseFloat(swapAmount) <= 0 || !pool || poolReserveA === "N/A" || poolReserveB === "N/A") {
      setEstimatedOutput("");
      setSlippage("");
      setRecommendedMinOut("");
      return;
    }

    try {
      const mintAInfo = await getMint(connection, pool.mintA);
      const mintBInfo = await getMint(connection, pool.mintB);
      
      // Get raw reserves from pool accounts
      const authorityPda = await getAuthorityPda(pool.amm, pool.mintA, pool.mintB);
      const poolAccountA = getAssociatedTokenAddressSync(pool.mintA, authorityPda, true);
      const poolAccountB = getAssociatedTokenAddressSync(pool.mintB, authorityPda, true);
      
      const accountA = await getAccount(connection, poolAccountA);
      const accountB = await getAccount(connection, poolAccountB);
      
      // Raw reserves (in token's native units)
      const inputReserveRaw = isSwapA ? accountA.amount : accountB.amount;
      const outputReserveRaw = isSwapA ? accountB.amount : accountA.amount;
      const inputDecimals = isSwapA ? mintAInfo.decimals : mintBInfo.decimals;
      const outputDecimals = isSwapA ? mintBInfo.decimals : mintAInfo.decimals;
      
      if (inputReserveRaw === BigInt(0) || outputReserveRaw === BigInt(0)) {
        setEstimatedOutput("");
        setSlippage("");
        setRecommendedMinOut("");
        return;
      }

      const amount = parseFloat(swapAmount);
      const amountRaw = BigInt(Math.floor(amount * Math.pow(10, inputDecimals)));
      
      // Calculate effective amount after fee
      const feeBps = poolFee;
      const percent = BigInt(10000 - feeBps);
      const amountEff = (amountRaw * percent) / BigInt(10000);
      
      // Constant product formula: k = x * y
      const k = inputReserveRaw * outputReserveRaw;
      
      // New input reserve after swap
      const newInputReserve = inputReserveRaw + amountEff;
      
      // New output reserve
      const newOutputReserve = k / newInputReserve;
      
      // Output amount (in raw format)
      const outputAmountRaw = outputReserveRaw - newOutputReserve;
      const outputAmount = Number(outputAmountRaw) / Math.pow(10, outputDecimals);
      
      setEstimatedOutput(outputAmount.toFixed(6));
      
      // Calculate slippage
      const inputReserveUI = Number(inputReserveRaw) / Math.pow(10, inputDecimals);
      const outputReserveUI = Number(outputReserveRaw) / Math.pow(10, outputDecimals);
      const spotPrice = outputReserveUI / inputReserveUI;
      const expectedOutput = amount * spotPrice;
      const slippagePercent = ((expectedOutput - outputAmount) / expectedOutput) * 100;
      
      setSlippage(slippagePercent.toFixed(2));
      
      // Recommend min_out with 1% slippage tolerance
      const recommendedMin = outputAmount * 0.99; // 1% slippage tolerance
      setRecommendedMinOut(recommendedMin.toFixed(6));
    } catch (error) {
      console.error("Error calculating swap output:", error);
      setEstimatedOutput("Error");
      setSlippage("Error");
      setRecommendedMinOut("");
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
      setPoolFee(0);
      setBalanceA("");
      setBalanceB("");
      setEstimatedOutput("");
      setSlippage("");
      setRecommendedMinOut("");
      return;
    }

    const pool = pools.find((p) => p.poolPda.toString() === poolAddress);

    if (pool) {
      setSelectedPool(poolAddress);
      setAmmIndex(pool.ammIndex.toString());
      setMintA(pool.mintA.toString());
      setMintB(pool.mintB.toString());
      
      // Fetch pool reserves and fee
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

  useEffect(() => {
    if (selectedPool && amount && parseFloat(amount) > 0) {
      const pool = pools.find((p) => p.poolPda.toString() === selectedPool);
      if (pool && poolReserveA && poolReserveB && poolReserveA !== "N/A" && poolReserveB !== "N/A") {
        calculateSwapOutput(amount, isSwapA, pool);
      }
    } else {
      setEstimatedOutput("");
      setSlippage("");
      setRecommendedMinOut("");
    }
  }, [amount, isSwapA, selectedPool, poolReserveA, poolReserveB, poolFee, pools, connection]);

  const handleSwap = async () => {
    if (!publicKey || !signTransaction) {
      setStatus("Please connect your wallet");
      return;
    }

    if (!mintA || !mintB || !amount) {
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
      
      const inputDecimals = isSwapA ? mintAInfo.decimals : mintBInfo.decimals;
      const outputDecimals = isSwapA ? mintBInfo.decimals : mintAInfo.decimals;
      
      const amountBN = new BN(Math.floor(parseFloat(amount) * Math.pow(10, inputDecimals)));
      const minOutBN = new BN(Math.floor(parseFloat(minOut || "0") * Math.pow(10, outputDecimals)));

      const authorityPda = await getAuthorityPda(ammPda, mintAPubkey, mintBPubkey);
      const poolAccountA = getAssociatedTokenAddressSync(mintAPubkey, authorityPda, true);
      const poolAccountB = getAssociatedTokenAddressSync(mintBPubkey, authorityPda, true);
      const traderAccountA = getAssociatedTokenAddressSync(mintAPubkey, publicKey, false);
      const traderAccountB = getAssociatedTokenAddressSync(mintBPubkey, publicKey, false);

      const tx = await program.methods
        .swap(isSwapA, amountBN, minOutBN)
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

      setStatus(`Success! Swap completed.\nTransaction: ${tx}`);
      
      // Refresh pools after successful operation
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
      setStatus(`Error: ${detailedError}`);
    } finally {
      setLoading(false);
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
              <p className="text-sm font-medium text-blue-900 mb-2">Pool Reserves:</p>
              <p className="text-sm text-blue-700 mb-2">
                Token A: {poolReserveA} | Token B: {poolReserveB}
              </p>
              {poolReserveA !== "N/A" && poolReserveB !== "N/A" && parseFloat(poolReserveA) > 0 && parseFloat(poolReserveB) > 0 && (
                <div className="mt-2 pt-2 border-t border-blue-300">
                  <p className="text-sm font-medium text-blue-900 mb-1">Exchange Rate:</p>
                  <p className="text-sm text-blue-700">
                    1 Token A = {((parseFloat(poolReserveB) / parseFloat(poolReserveA))).toFixed(6)} Token B
                  </p>
                  <p className="text-sm text-blue-700">
                    1 Token B = {((parseFloat(poolReserveA) / parseFloat(poolReserveB))).toFixed(6)} Token A
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
            Swap Direction
          </label>
          <select
            value={isSwapA ? "A to B" : "B to A"}
            onChange={(e) => setIsSwapA(e.target.value === "A to B")}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          >
            <option value="A to B">A to B</option>
            <option value="B to A">B to A</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="0.0"
            step="0.000000001"
          />
        </div>
        {amount && parseFloat(amount) > 0 && estimatedOutput && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm font-medium text-green-900 mb-2">Estimated Output:</p>
            <p className="text-sm text-green-700 mb-1">
              You will receive: <span className="font-semibold">{estimatedOutput}</span> {isSwapA ? "Token B" : "Token A"}
            </p>
            {slippage && (
              <p className="text-sm text-green-700 mb-1">
                Slippage: <span className={`font-semibold ${parseFloat(slippage) > 5 ? "text-red-600" : parseFloat(slippage) > 2 ? "text-yellow-600" : ""}`}>{slippage}%</span>
              </p>
            )}
            {recommendedMinOut && (
              <div className="mt-2 pt-2 border-t border-green-300">
                <p className="text-sm font-medium text-green-900 mb-1">Recommended Min Output:</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={minOut}
                    onChange={(e) => setMinOut(e.target.value)}
                    className="flex-1 px-3 py-1 text-sm border border-green-300 rounded-md focus:ring-2 focus:ring-green-500"
                    placeholder={recommendedMinOut}
                    step="0.000000001"
                  />
                  <button
                    onClick={() => setMinOut(recommendedMinOut)}
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
            value={minOut}
            onChange={(e) => setMinOut(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder={recommendedMinOut || "0.0"}
            step="0.000000001"
          />
        </div>
        <button
          onClick={handleSwap}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Swapping..." : "Swap"}
        </button>
        <StatusMessage
          status={status}
          onClose={() => setStatus("")}
        />
      </div>
    </div>
  );
}


