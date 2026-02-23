"use client";

import { useState } from "react";

export default function NpmInstall() {
  const [copied, setCopied] = useState(false);
  const cmd = "npm install @payspawn/sdk";

  function copy() {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={copy}
      className="group flex items-center gap-3 border border-white/10 hover:border-[#F65B1A]/50 bg-white/[0.02] hover:bg-[#F65B1A]/[0.04] transition-all px-4 py-3 font-mono text-sm w-fit"
    >
      <span className="text-[#F65B1A]/60">$</span>
      <span className="text-white/70 group-hover:text-white transition-colors">{cmd}</span>
      <span className="ml-2 text-xs text-white/30 group-hover:text-[#F65B1A]/60 transition-colors tracking-wider uppercase">
        {copied ? "Copied ✓" : "Copy"}
      </span>
    </button>
  );
}
