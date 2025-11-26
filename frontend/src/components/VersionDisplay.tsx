"use client";

import { APP_VERSION } from "@/lib/version";

export default function VersionDisplay() {
  return (
    <div className="fixed bottom-4 right-4 text-xs text-gray-500 bg-white/80 backdrop-blur-sm px-2 py-1 rounded border border-gray-200 shadow-sm">
      v{APP_VERSION}
    </div>
  );
}

