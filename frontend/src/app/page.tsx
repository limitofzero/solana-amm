"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useState } from "react";
import CreateAmm from "@/components/CreateAmm";
import CreatePool from "@/components/CreatePool";
import AddLiquidity from "@/components/AddLiquidity";
import Swap from "@/components/Swap";
import PoolList from "@/components/PoolList";
import DevTools from "@/components/DevTools";

export default function Home() {
  const { connected } = useWallet();
  const [activeTab, setActiveTab] = useState<"create-amm" | "create-pool" | "add-liquidity" | "swap" | "pools" | "dev-tools">("pools");
  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-2xl p-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold text-gray-800">AMM DEX</h1>
            <WalletMultiButton />
          </div>

          {!connected ? (
            <div className="text-center py-12">
              <p className="text-xl text-gray-600 mb-4">Please connect your wallet to continue</p>
            </div>
          ) : (
            <>
              <div className="flex space-x-4 mb-8 border-b">
                <button
                  onClick={() => setActiveTab("pools")}
                  className={`px-4 py-2 font-semibold ${
                    activeTab === "pools"
                      ? "border-b-2 border-blue-500 text-blue-600"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  Pools
                </button>
                <button
                  onClick={() => setActiveTab("create-amm")}
                  className={`px-4 py-2 font-semibold ${
                    activeTab === "create-amm"
                      ? "border-b-2 border-blue-500 text-blue-600"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  Create AMM
                </button>
                <button
                  onClick={() => setActiveTab("create-pool")}
                  className={`px-4 py-2 font-semibold ${
                    activeTab === "create-pool"
                      ? "border-b-2 border-blue-500 text-blue-600"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  Create Pool
                </button>
                <button
                  onClick={() => setActiveTab("add-liquidity")}
                  className={`px-4 py-2 font-semibold ${
                    activeTab === "add-liquidity"
                      ? "border-b-2 border-blue-500 text-blue-600"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  Add Liquidity
                </button>
                <button
                  onClick={() => setActiveTab("swap")}
                  className={`px-4 py-2 font-semibold ${
                    activeTab === "swap"
                      ? "border-b-2 border-blue-500 text-blue-600"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  Swap
                </button>
                {isDev && (
                  <button
                    onClick={() => setActiveTab("dev-tools")}
                    className={`px-4 py-2 font-semibold ${
                      activeTab === "dev-tools"
                        ? "border-b-2 border-blue-500 text-blue-600"
                        : "text-gray-600 hover:text-gray-800"
                    }`}
                  >
                    Dev Tools
                  </button>
                )}
              </div>

              <div className="mt-8">
                {activeTab === "pools" && <PoolList />}
                {activeTab === "create-amm" && <CreateAmm />}
                {activeTab === "create-pool" && <CreatePool />}
                {activeTab === "add-liquidity" && <AddLiquidity />}
                {activeTab === "swap" && <Swap />}
                {activeTab === "dev-tools" && isDev && <DevTools />}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

