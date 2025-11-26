"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
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
import CopyableAddress from "./CopyableAddress";
import { usePools } from "@/contexts/PoolsContext";
import { getCachedMint } from "@/lib/mintCache";

export default function DevTools() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const { savedMints, saveMint, removeMint, updateMintName, updateMintSymbol } = useSavedMints();
  const { pools } = usePools();
  const [tokenName, setTokenName] = useState<string>("");
  const [tokenSymbol, setTokenSymbol] = useState<string>("");
  const [tokenDecimals, setTokenDecimals] = useState<string>("9");
  const [tokenSupply, setTokenSupply] = useState<string>("1000000");
  const [mintAddress, setMintAddress] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");

  const poolTokens = Array.from(
    new Set(
      pools.flatMap((pool) => [
        pool.mintA.toString(),
        pool.mintB.toString(),
      ])
    )
  ).sort();

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

      const lamports = await getMinimumBalanceForRentExemptMint(connection);
      const mintKeypair = Keypair.generate();
      const mint = mintKeypair.publicKey;

      const transaction = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: publicKey,
          newAccountPubkey: mint,
          space: MINT_SIZE,
          lamports,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(
          mint,
          decimals,
          publicKey,
          null,
          TOKEN_PROGRAM_ID
        )
      );

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      transaction.partialSign(mintKeypair);
      const signed = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(signature, "confirmed");

      const mintStr = mint.toString();
      setMintAddress(mintStr);
      
      saveMint({
        address: mintStr,
        name: tokenName || undefined,
        symbol: tokenSymbol || undefined,
        decimals,
        createdAt: Date.now(),
      });
      
      setTokenName("");
      setTokenSymbol("");
      
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
      let decimals = parseInt(tokenDecimals) || 9;
      try {
        const mintInfo = await getCachedMint(connection, mint);
        decimals = mintInfo.decimals;
      } catch (error) {
        if (!tokenDecimals || isNaN(parseInt(tokenDecimals))) {
          setStatus("Please enter decimals for the mint");
          setLoading(false);
          return;
        }
        decimals = parseInt(tokenDecimals);
      }
      
      const supply = parseFloat(tokenSupply);
      const amount = BigInt(Math.floor(supply * Math.pow(10, decimals)));

      const tokenAccount = getAssociatedTokenAddressSync(
        mint,
        publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      let accountExists = false;
      try {
        await getAccount(connection, tokenAccount);
        accountExists = true;
      } catch (error) {
        accountExists = false;
      }

      const transaction = new Transaction();
      
      if (!accountExists) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            tokenAccount,
            publicKey,
            mint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }
      
      transaction.add(
        createMintToInstruction(
          mint,
          tokenAccount,
          publicKey,
          Number(amount),
          [],
          TOKEN_PROGRAM_ID
        )
      );

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      const signed = await signTransaction(transaction);
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
                Token Symbol (optional)
              </label>
              <input
                type="text"
                value={tokenSymbol}
                onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="MTK"
                maxLength={10}
              />
              <p className="mt-1 text-xs text-gray-500">
                Short symbol for the token (e.g., USDC, SOL, BTC)
              </p>
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
                <p className="text-sm text-gray-700 mb-2">
                  <strong>Mint Address:</strong>
                </p>
                <CopyableAddress address={mintAddress} />
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
              <div className="flex gap-2">
                <input
                  type="text"
                  value={mintAddress}
                  onChange={(e) => setMintAddress(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter mint address"
                />
                {poolTokens.length > 0 && (
                  <select
                    onChange={(e) => {
                      if (e.target.value) setMintAddress(e.target.value);
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50 focus:ring-2 focus:ring-blue-500"
                    value=""
                  >
                    <option value="">Select from pools...</option>
                    {poolTokens.map((token) => (
                      <option key={token} value={token}>
                        {token.slice(0, 8)}...{token.slice(-8)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {poolTokens.length > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  {poolTokens.length} token{poolTokens.length !== 1 ? "s" : ""} available in active pools
                </p>
              )}
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="text"
                        value={mint.name || ""}
                        onChange={(e) => updateMintName(mint.address, e.target.value)}
                        placeholder="Token name"
                        className="text-sm font-medium border-none bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded"
                      />
                      {mint.symbol && (
                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                          {mint.symbol}
                        </span>
                      )}
                      <input
                        type="text"
                        value={mint.symbol || ""}
                        onChange={(e) => updateMintSymbol(mint.address, e.target.value.toUpperCase())}
                        placeholder="Symbol"
                        className="text-xs font-medium border-none bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded w-16"
                        maxLength={10}
                      />
                      <span className="text-xs text-gray-500">
                        ({mint.decimals} decimals)
                      </span>
                    </div>
                    <div className="mt-1">
                      <CopyableAddress address={mint.address} short={true} className="text-xs" />
                    </div>
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

