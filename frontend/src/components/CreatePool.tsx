"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import { useSavedMints } from "@/hooks/useSavedMints";
import { usePools } from "@/contexts/PoolsContext";
import StatusMessage from "./StatusMessage";
import CopyableAddress from "./CopyableAddress";
import { getProgram, getAmmPda, getPoolPda, getAuthorityPda, getMintLiquidityPda } from "@/lib/program";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import { getCachedMint } from "@/lib/mintCache";
import { SystemProgram } from "@solana/web3.js";
import { BalancesState, UIState } from "@/types/componentState";

interface PoolCreationState {
  ammIndex: string;
  mintA: string;
  mintB: string;
}

export default function CreatePool() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const { savedMints } = useSavedMints();
  const { refreshPools } = usePools();

  const [poolState, setPoolState] = useState<PoolCreationState>({
    ammIndex: "1",
    mintA: "",
    mintB: "",
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

  useEffect(() => {
    if (poolState.mintA) {
      fetchTokenBalance(poolState.mintA, "balanceA");
    } else {
      setBalances(prev => ({ ...prev, balanceA: "" }));
    }
  }, [poolState.mintA, publicKey, connection]);

  useEffect(() => {
    if (poolState.mintB) {
      fetchTokenBalance(poolState.mintB, "balanceB");
    } else {
      setBalances(prev => ({ ...prev, balanceB: "" }));
    }
  }, [poolState.mintB, publicKey, connection]);

  const handleCreatePool = async () => {
    if (!publicKey || !signTransaction) {
      setUIState(prev => ({ ...prev, status: "Please connect your wallet" }));
      return;
    }

    if (!poolState.mintA || !poolState.mintB) {
      setUIState(prev => ({ ...prev, status: "Please provide both mint addresses" }));
      return;
    }

    setUIState({ loading: true, status: "" });

    try {
      const program = getProgram(connection, { publicKey, signTransaction, signAllTransactions } as any);
      const ammPda = await getAmmPda(parseInt(poolState.ammIndex));
      const mintAPubkey = new PublicKey(poolState.mintA);
      const mintBPubkey = new PublicKey(poolState.mintB);

      if (mintAPubkey.equals(mintBPubkey)) {
        setUIState(prev => ({ ...prev, status: "Mint A and Mint B must be different", loading: false }));
        return;
      }

      const poolPda = await getPoolPda(ammPda, mintAPubkey, mintBPubkey);
      const authorityPda = await getAuthorityPda(ammPda, mintAPubkey, mintBPubkey);
      const mintLiquidityPda = await getMintLiquidityPda(ammPda, mintAPubkey, mintBPubkey);

      const poolAccountA = getAssociatedTokenAddressSync(mintAPubkey, authorityPda, true);
      const poolAccountB = getAssociatedTokenAddressSync(mintBPubkey, authorityPda, true);

      const tx = await program.methods
        .createPool()
        .accounts({
          amm: ammPda,
          pool: poolPda,
          mintLiquidity: mintLiquidityPda,
          poolAccountA: poolAccountA,
          poolAccountB: poolAccountB,
          authority: authorityPda,
          mintA: mintAPubkey,
          mintB: mintBPubkey,
          signer: publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      setUIState(prev => ({ ...prev, status: `Success! Pool created. Transaction: ${tx}` }));
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
      <h2 className="text-2xl font-bold mb-4">Create Pool</h2>
      <div className="space-y-4">
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
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Mint A Address
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={poolState.mintA}
              onChange={(e) => setPoolState(prev => ({ ...prev, mintA: e.target.value }))}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="Enter mint A public key"
            />
            {poolState.mintA && (
              <CopyableAddress address={poolState.mintA} short={false} className="flex-shrink-0" />
            )}
            {savedMints.length > 0 && (
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
            Mint B Address
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={poolState.mintB}
              onChange={(e) => setPoolState(prev => ({ ...prev, mintB: e.target.value }))}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="Enter mint B public key"
            />
            {poolState.mintB && (
              <CopyableAddress address={poolState.mintB} short={false} className="flex-shrink-0" />
            )}
            {savedMints.length > 0 && (
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
        <button
          onClick={handleCreatePool}
          disabled={uiState.loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uiState.loading ? "Creating..." : "Create Pool"}
        </button>
        <StatusMessage
          status={uiState.status}
          onClose={() => setUIState(prev => ({ ...prev, status: "" }))}
        />
      </div>
    </div>
  );
}

