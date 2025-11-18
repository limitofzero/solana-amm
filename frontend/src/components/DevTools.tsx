"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useSavedMints } from "@/hooks/useSavedMints";
import {
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { SystemProgram, Keypair, Transaction } from "@solana/web3.js";
import StatusMessage from "./StatusMessage";

export default function DevTools() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const { savedMints, saveMint, removeMint, updateMintName } = useSavedMints();
  const [solAmount, setSolAmount] = useState<string>("1");
  const [tokenName, setTokenName] = useState<string>("");
  const [tokenDecimals, setTokenDecimals] = useState<string>("9");
  const [tokenSupply, setTokenSupply] = useState<string>("1000000");
  const [mintAddress, setMintAddress] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");

  const handleAirdrop = async () => {
    if (!publicKey) {
      setStatus("Please connect your wallet");
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const amount = parseFloat(solAmount) * LAMPORTS_PER_SOL;
      const signature = await connection.requestAirdrop(publicKey, amount);
      await connection.confirmTransaction(signature, "confirmed");
      setStatus(`Success! Airdropped ${solAmount} SOL.\nSignature: ${signature}`);
    } catch (error: any) {
      const errorMessage = error.message || error.toString();
      setStatus(`Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMint = async () => {
    if (!publicKey || !signTransaction) {
      setStatus("Please connect your wallet");
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const decimals = parseInt(tokenDecimals);
      if (isNaN(decimals) || decimals < 0 || decimals > 9) {
        setStatus("Decimals must be between 0 and 9");
        setLoading(false);
        return;
      }

      // Calculate rent for mint account
      const lamports = await getMinimumBalanceForRentExemptMint(connection);

      // Generate keypair for mint (we'll create the account)
      const mintKeypair = Keypair.generate();
      const mint = mintKeypair.publicKey;

      // Create transaction
      const transaction = new Transaction().add(
        // Create account
        SystemProgram.createAccount({
          fromPubkey: publicKey,
          newAccountPubkey: mint,
          space: MINT_SIZE,
          lamports,
          programId: TOKEN_PROGRAM_ID,
        }),
        // Initialize mint
        createInitializeMintInstruction(
          mint,
          decimals,
          publicKey, // mint authority
          null, // freeze authority
          TOKEN_PROGRAM_ID
        )
      );

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Sign with mint keypair (for account creation)
      transaction.partialSign(mintKeypair);

      // Sign with wallet
      const signed = await signTransaction(transaction);
      
      // Send transaction
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(signature, "confirmed");

      const mintStr = mint.toString();
      setMintAddress(mintStr);
      
      // Save to localStorage
      saveMint({
        address: mintStr,
        name: tokenName || undefined,
        decimals,
        createdAt: Date.now(),
      });
      
      setStatus(`Success! Created mint: ${mintStr}`);
    } catch (error: any) {
      const errorMessage = error.message || error.toString();
      let detailedError = errorMessage;
      if (error.logs && Array.isArray(error.logs)) {
        detailedError += `\n\nLogs:\n${error.logs.join("\n")}`;
      }
      setStatus(`Error: ${detailedError}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMintTokens = async () => {
    if (!publicKey || !signTransaction) {
      setStatus("Please connect your wallet");
      return;
    }

    if (!mintAddress) {
      setStatus("Please create a mint first or enter mint address");
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const mint = new PublicKey(mintAddress);
      const decimals = parseInt(tokenDecimals) || 9;
      const supply = parseFloat(tokenSupply);
      const amount = BigInt(Math.floor(supply * Math.pow(10, decimals)));

      // Get associated token account address
      const tokenAccount = getAssociatedTokenAddressSync(
        mint,
        publicKey, // owner
        false, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // Check if token account exists
      let accountExists = false;
      try {
        await getAccount(connection, tokenAccount);
        accountExists = true;
      } catch (error) {
        // Account doesn't exist, we'll create it
        accountExists = false;
      }

      // Create transaction
      const transaction = new Transaction();
      
      // Add create ATA instruction if needed
      if (!accountExists) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey, // payer
            tokenAccount,
            publicKey, // owner
            mint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }
      
      // Add mintTo instruction
      transaction.add(
        createMintToInstruction(
          mint,
          tokenAccount,
          publicKey, // mint authority
          Number(amount),
          [], // multiSigners (empty since we sign with wallet)
          TOKEN_PROGRAM_ID
        )
      );

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Sign with wallet (mint authority)
      const signed = await signTransaction(transaction);
      
      // Send transaction
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(signature, "confirmed");
      
      setStatus(`Success! Minted ${tokenSupply} tokens.\nSignature: ${signature}`);
    } catch (error: any) {
      const errorMessage = error.message || error.toString();
      let detailedError = errorMessage;
      if (error.logs && Array.isArray(error.logs)) {
        detailedError += `\n\nLogs:\n${error.logs.join("\n")}`;
      }
      setStatus(`Error: ${detailedError}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-50 p-6 rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Dev Tools</h2>
      <p className="text-sm text-gray-600 mb-6">Development utilities for testing</p>

      <div className="space-y-6">
        {/* Airdrop SOL */}
        <div className="border-b pb-6">
          <h3 className="text-lg font-semibold mb-3">Airdrop SOL</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount (SOL)
              </label>
              <input
                type="number"
                value={solAmount}
                onChange={(e) => setSolAmount(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="1"
                step="0.1"
              />
            </div>
            <button
              onClick={handleAirdrop}
              disabled={loading}
              className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? "Processing..." : "Airdrop SOL"}
            </button>
          </div>
        </div>

        {/* Create Mint */}
        <div className="border-b pb-6">
          <h3 className="text-lg font-semibold mb-3">Create Token Mint</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Token Name (optional)
              </label>
              <input
                type="text"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="My Token"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Decimals (0-9)
              </label>
              <input
                type="number"
                value={tokenDecimals}
                onChange={(e) => setTokenDecimals(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="9"
                min="0"
                max="9"
              />
            </div>
            <button
              onClick={handleCreateMint}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Mint"}
            </button>
            {mintAddress && (
              <div className="mt-2 p-3 bg-blue-50 rounded-md">
                <p className="text-sm text-gray-700">
                  <strong>Mint Address:</strong> {mintAddress}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Mint Tokens */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Mint Tokens</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mint Address (or use created mint above)
              </label>
              <input
                type="text"
                value={mintAddress}
                onChange={(e) => setMintAddress(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="Enter mint address"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Supply (max amount to mint)
              </label>
              <input
                type="number"
                value={tokenSupply}
                onChange={(e) => setTokenSupply(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="1000000"
                step="0.000000001"
              />
            </div>
            <button
              onClick={handleMintTokens}
              disabled={loading}
              className="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? "Minting..." : "Mint Tokens"}
            </button>
          </div>
        </div>

        {/* Saved Mints */}
        {savedMints.length > 0 && (
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-3">Saved Mints</h3>
            <div className="space-y-2">
              {savedMints.map((mint) => (
                <div
                  key={mint.address}
                  className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-md"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={mint.name || ""}
                        onChange={(e) => updateMintName(mint.address, e.target.value)}
                        placeholder="Token name"
                        className="text-sm font-medium border-none bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded"
                      />
                      <span className="text-xs text-gray-500">
                        ({mint.decimals} decimals)
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1 font-mono">
                      {mint.address.slice(0, 8)}...{mint.address.slice(-8)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setMintAddress(mint.address)}
                      className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      Use
                    </button>
                    <button
                      onClick={() => removeMint(mint.address)}
                      className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status */}
        <StatusMessage
          status={status}
          onClose={() => setStatus("")}
        />
      </div>
    </div>
  );
}

