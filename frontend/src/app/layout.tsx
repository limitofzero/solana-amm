"use client";

import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import { useMemo } from "react";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Determine network from environment variable or default to devnet
  const { network, endpoint } = useMemo(() => {
    const envNetwork = process.env.NEXT_PUBLIC_SOLANA_NETWORK;
    const customRpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    
    if (envNetwork === "mainnet") {
      return {
        network: WalletAdapterNetwork.Mainnet,
        endpoint: customRpcUrl || clusterApiUrl(WalletAdapterNetwork.Mainnet),
      };
    }
    if (envNetwork === "testnet") {
      return {
        network: WalletAdapterNetwork.Testnet,
        endpoint: customRpcUrl || clusterApiUrl(WalletAdapterNetwork.Testnet),
      };
    }
    if (envNetwork === "localnet" || envNetwork === "localhost") {
      return {
        network: WalletAdapterNetwork.Devnet, // Use Devnet enum for type compatibility
        endpoint: customRpcUrl || "http://127.0.0.1:8899",
      };
    }
    // Default to devnet
    return {
      network: WalletAdapterNetwork.Devnet,
      endpoint: customRpcUrl || clusterApiUrl(WalletAdapterNetwork.Devnet),
    };
  }, []);
  
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <html lang="en">
      <body>
        <ConnectionProvider endpoint={endpoint}>
          <WalletProvider wallets={wallets} autoConnect>
            <WalletModalProvider>
              {children}
            </WalletModalProvider>
          </WalletProvider>
        </ConnectionProvider>
      </body>
    </html>
  );
}

