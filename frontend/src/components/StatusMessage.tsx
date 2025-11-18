"use client";

import { useState, useEffect } from "react";

export interface StatusMessageProps {
  status: string | null;
  onClose?: () => void;
}

export default function StatusMessage({ status, onClose }: StatusMessageProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (status) {
      setIsVisible(true);
      // Auto-hide after 10 seconds for success messages
      if (status.includes("Success") || status.includes("success")) {
        const timer = setTimeout(() => {
          setIsVisible(false);
          onClose?.();
        }, 10000);
        return () => clearTimeout(timer);
      }
    } else {
      setIsVisible(false);
    }
  }, [status, onClose]);

  if (!status || !isVisible) return null;

  const isError = status.includes("Error") || status.includes("error") || status.includes("Failed");
  const isSuccess = status.includes("Success") || status.includes("success");

  // Extract transaction signature if present
  const txMatch = status.match(/Transaction:?\s*([A-Za-z0-9]{32,})/);
  const txSignature = txMatch ? txMatch[1] : null;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
  const explorerUrl = txSignature
    ? `https://explorer.solana.com/tx/${txSignature}?cluster=${cluster}`
    : null;

  return (
    <div
      className={`p-4 rounded-lg border-2 ${
        isError
          ? "bg-red-50 border-red-200 text-red-800"
          : isSuccess
          ? "bg-green-50 border-green-200 text-green-800"
          : "bg-blue-50 border-blue-200 text-blue-800"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {isError ? (
              <svg
                className="w-5 h-5 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            ) : isSuccess ? (
              <svg
                className="w-5 h-5 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5 text-blue-600 animate-spin"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            )}
            <span className="font-semibold">
              {isError ? "Error" : isSuccess ? "Success" : "Processing"}
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap break-words">{status}</p>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium underline hover:opacity-80"
            >
              View on Explorer
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          )}
        </div>
        {onClose && (
          <button
            onClick={() => {
              setIsVisible(false);
              onClose();
            }}
            className="ml-4 text-gray-500 hover:text-gray-700"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

