"use client";

import { Wallet, WifiOff } from "lucide-react";
import { erc20Abi, formatUnits } from "viem";
import { useReadContract } from "wagmi";

import { useWalletAdapter } from "@/hooks/use-wallet-adapter";

const COPM_ICON_URL = "https://app.mento.org/tokens/COPm.svg";

function formatCopmBalance(value?: bigint, decimals = 18) {
  if (value === undefined) return "0";

  const amount = Math.floor(Number(formatUnits(value, decimals)));
  if (!Number.isFinite(amount) || amount <= 0) return "0";
  if (amount > 99_999_999) return "99,999,999+";

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(amount);
}

export function ConnectButton() {
  const {
    address,
    currentNetwork,
    hasProvider,
    isConnected,
    isConnecting,
    isCorrectNetwork,
    isMiniPay,
    targetNetwork,
    connectBrowserWallet,
    switchToTargetNetwork,
  } = useWalletAdapter();
  const activeNetwork = currentNetwork ?? targetNetwork;
  const copmToken = activeNetwork.tokens.copm;
  const copmBalance = useReadContract({
    address: copmToken.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(isConnected && isCorrectNetwork && address && copmToken.address),
      refetchInterval: 10_000,
    },
  });

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
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-9 max-w-[132px] items-center gap-1.5 truncate rounded-full border border-[#DDD2F3] bg-[#F2ECFF] px-2.5 text-[11px] font-semibold text-[#6D45B8]">
          <img
            src={COPM_ICON_URL}
            alt="COPm"
            className="h-4 w-4 shrink-0 rounded-full"
          />
          <span className="truncate">
            {formatCopmBalance(copmBalance.data, copmToken.decimals)}
          </span>
        </span>
        <span className="inline-flex h-9 items-center rounded-full border border-[#DDE4DC] bg-white px-3 text-xs font-semibold text-[#17211B]">
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </span>
      </div>
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
