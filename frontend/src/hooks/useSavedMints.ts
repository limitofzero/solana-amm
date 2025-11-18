"use client";

import { useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";

const STORAGE_KEY = "amm_dev_saved_mints";

export interface SavedMint {
  address: string;
  name?: string;
  decimals: number;
  createdAt: number;
}

export function useSavedMints() {
  const [savedMints, setSavedMints] = useState<SavedMint[]>([]);

  useEffect(() => {
    // Load from localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setSavedMints(JSON.parse(stored));
      } catch (error) {
        console.error("Failed to load saved mints:", error);
      }
    }
  }, []);

  const saveMint = (mint: SavedMint) => {
    const updated = [...savedMints, mint];
    setSavedMints(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const removeMint = (address: string) => {
    const updated = savedMints.filter((m) => m.address !== address);
    setSavedMints(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const updateMintName = (address: string, name: string) => {
    const updated = savedMints.map((m) =>
      m.address === address ? { ...m, name } : m
    );
    setSavedMints(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  return {
    savedMints,
    saveMint,
    removeMint,
    updateMintName,
  };
}

