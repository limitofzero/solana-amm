"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getCachedMint } from "@/lib/mintCache";
import CopyableAddress from "./CopyableAddress";
import { useSavedMints } from "@/hooks/useSavedMints";

interface TokenBalance {
  mint: string;
  balance: string;
  decimals: number;
  uiAmount: number;
  tokenAccount: string;
}

export default function TokenBalance() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const { savedMints } = useSavedMints();
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getTokenName = (mintAddress: string): string | undefined => {
    const savedMint = savedMints.find((m) => m.address === mintAddress);
    return savedMint?.name;
  };

  const fetchTokenBalances = async () => {
    if (!publicKey) {
      setTokens([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        {
          programId: TOKEN_PROGRAM_ID,
        }
      );

      const tokenAccounts = response.value;
      const tokenData = await Promise.all(
        tokenAccounts.map(async (account) => {
          try {
            const parsedData = account.account.data as any;
            const tokenInfo = parsedData.parsed.info;
            const tokenAmount = tokenInfo.tokenAmount;
            
            let decimals = tokenAmount.decimals;
            try {
              const mintInfo = await getCachedMint(connection, tokenInfo.mint);
              decimals = mintInfo.decimals;
            } catch (err) {
            }
            
            const uiAmount = Number(tokenAmount.uiAmount) || 0;
            
            return {
              mint: tokenInfo.mint,
              balance: tokenAmount.amount,
              decimals: decimals,
              uiAmount: uiAmount,
              tokenAccount: account.pubkey.toString(),
            };
          } catch (err) {
            console.error("Error processing token account:", err);
            return null;
          }
        })
      );

      const validTokens = tokenData.filter((token): token is TokenBalance => token !== null);
      const nonZeroTokens = validTokens
        .filter((token) => token.uiAmount > 0)
        .sort((a, b) => b.uiAmount - a.uiAmount);

      setTokens(nonZeroTokens);
    } catch (err: any) {
      setError(err.message || "Failed to fetch token balances");
      console.error("Error fetching token balances:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokenBalances();
    const interval = setInterval(fetchTokenBalances, 10000);
    return () => clearInterval(interval);
  }, [publicKey, connection]);

  if (!publicKey) {
    return (
      <div className="bg-gray-50 p-6 rounded-lg">
        <h2 className="text-2xl font-bold mb-4">Token Balances</h2>
        <p className="text-gray-600">Please connect your wallet to view token balances</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 p-6 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Token Balances</h2>
        <button
          onClick={fetchTokenBalances}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          Error: {error}
        </div>
      )}

      {loading && tokens.length === 0 ? (
        <p className="text-gray-600">Loading token balances...</p>
      ) : tokens.length === 0 ? (
        <p className="text-gray-600">No tokens found in your wallet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white rounded-lg shadow">
            <thead className="bg-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Mint Address
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Balance
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Token Account
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tokens.map((token, index) => {
                const tokenName = getTokenName(token.mint);
                return (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <CopyableAddress 
                        address={token.mint} 
                        short={true} 
                        displayName={tokenName}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {token.uiAmount.toLocaleString(undefined, {
                          maximumFractionDigits: token.decimals,
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-xs font-mono text-gray-500">
                        {token.tokenAccount.slice(0, 8)}...{token.tokenAccount.slice(-8)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 text-xs text-gray-500">
        Showing {tokens.length} token{tokens.length !== 1 ? "s" : ""} with non-zero balance
      </div>
    </div>
  );
}

