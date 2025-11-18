"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useSavedMints } from "@/hooks/useSavedMints";
import StatusMessage from "./StatusMessage";
import { getProgram, getAmmPda, getPoolPda, getAuthorityPda, getMintLiquidityPda } from "@/lib/program";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { SystemProgram } from "@solana/web3.js";

export default function CreatePool() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const { savedMints } = useSavedMints();
  const [ammIndex, setAmmIndex] = useState<string>("1");
  const [mintA, setMintA] = useState<string>("");
  const [mintB, setMintB] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");

  const handleCreatePool = async () => {
    if (!publicKey || !signTransaction) {
      setStatus("Please connect your wallet");
      return;
    }

    if (!mintA || !mintB) {
      setStatus("Please provide both mint addresses");
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const program = getProgram(connection, { publicKey, signTransaction, signAllTransactions } as any);
      const ammPda = await getAmmPda(parseInt(ammIndex));
      const mintAPubkey = new PublicKey(mintA);
      const mintBPubkey = new PublicKey(mintB);

      if (mintAPubkey.equals(mintBPubkey)) {
        setStatus("Mint A and Mint B must be different");
        setLoading(false);
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

      setStatus(`Success! Pool created. Transaction: ${tx}`);
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
      <h2 className="text-2xl font-bold mb-4">Create Pool</h2>
      <div className="space-y-4">
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
            />
            {savedMints.length > 0 && (
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
            />
            {savedMints.length > 0 && (
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
        </div>
        <button
          onClick={handleCreatePool}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creating..." : "Create Pool"}
        </button>
        <StatusMessage
          status={status}
          onClose={() => setStatus("")}
        />
      </div>
    </div>
  );
}

