"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { getProgram, getAmmPda } from "@/lib/program";
import { SystemProgram } from "@solana/web3.js";
import StatusMessage from "./StatusMessage";

export default function CreateAmm() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const [fee, setFee] = useState<string>("100");
  const [index, setIndex] = useState<string>("1");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");

  const handleCreateAmm = async () => {
    if (!publicKey || !signTransaction) {
      setStatus("Please connect your wallet");
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const program = getProgram(connection, { publicKey, signTransaction, signAllTransactions } as any);
      const ammPda = await getAmmPda(parseInt(index));
      const feeNum = parseInt(fee);

      if (feeNum >= 10000) {
        setStatus("Fee must be less than 10000 (100%)");
        setLoading(false);
        return;
      }

      const tx = await program.methods
        .createAmm(feeNum, parseInt(index))
        .accounts({
          amm: ammPda,
          adminAccount: publicKey,
          signer: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setStatus(`Success! AMM created.\nTransaction: ${tx}`);
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
      <h2 className="text-2xl font-bold mb-4">Create AMM</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Fee (basis points, max 9999 = 99.99%)
          </label>
          <input
            type="number"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Index (unique identifier)
          </label>
          <input
            type="number"
            value={index}
            onChange={(e) => setIndex(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="1"
          />
        </div>
        <button
          onClick={handleCreateAmm}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creating..." : "Create AMM"}
        </button>
        <StatusMessage
          status={status}
          onClose={() => setStatus("")}
        />
      </div>
    </div>
  );
}

