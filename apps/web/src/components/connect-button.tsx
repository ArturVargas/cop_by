"use client";

import { Wallet, WifiOff } from "lucide-react";

import { useWalletAdapter } from "@/hooks/use-wallet-adapter";

export function ConnectButton() {
  const {
    address,
    hasProvider,
    isConnected,
    isConnecting,
    isCorrectNetwork,
    isMiniPay,
    targetNetwork,
    connectBrowserWallet,
    switchToTargetNetwork,
  } = useWalletAdapter();

  if (isMiniPay) return null;

  if (!hasProvider) {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#DDE4DC] bg-white px-3 text-xs font-semibold text-[#66736B]">
        <WifiOff className="h-3.5 w-3.5" />
        Wallet
      </span>
    );
  }

  if (isConnected && !isCorrectNetwork) {
    return (
      <button
        type="button"
        onClick={switchToTargetNetwork}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#F2C94C] bg-[#FFF6D8] px-3 text-xs font-semibold text-[#17211B]"
      >
        {targetNetwork.name}
      </button>
    );
  }

  if (isConnected) {
    return (
      <span className="inline-flex h-9 items-center rounded-full border border-[#DDE4DC] bg-white px-3 text-xs font-semibold text-[#17211B]">
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={connectBrowserWallet}
      disabled={isConnecting}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#DDE4DC] bg-white px-3 text-xs font-semibold text-[#17211B] disabled:opacity-60"
    >
      <Wallet className="h-3.5 w-3.5" />
      {isConnecting ? "Conectando" : "Conectar"}
    </button>
  );
}
