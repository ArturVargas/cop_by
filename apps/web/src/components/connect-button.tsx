"use client";

import { useState } from "react";
import { Wallet, WifiOff } from "lucide-react";
import { erc20Abi } from "viem";
import { useReadContract } from "wagmi";

import { useWalletAdapter } from "@/hooks/use-wallet-adapter";
import { formatPesoAmountFromBigInt } from "@/lib/format-peso";

const COPM_ICON_URL = "https://app.mento.org/tokens/COPm.svg";

function formatCopmBalance(value?: bigint, decimals = 18) {
  if (value === undefined) return "0";
  return formatPesoAmountFromBigInt(value, decimals);
}

function formatAddressPreview(address: string) {
  if (address.length <= 14) return address;
  return `${address.slice(0, 7)}...${address.slice(-4)}`;
}

export function CopmBalanceBadge() {
  const {
    address,
    currentNetwork,
    isConnected,
    isCorrectNetwork,
    targetNetwork,
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

  if (!isConnected || !isCorrectNetwork) return null;

  return (
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
  );
}

export function AddressBadge() {
  const { address, isConnected } = useWalletAdapter();
  const [copied, setCopied] = useState(false);

  if (!isConnected || !address) return null;

  const copyAddress = () => {
    void navigator.clipboard?.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={copyAddress}
        aria-label="Copiar address conectado"
        className="inline-flex h-9 max-w-[128px] items-center rounded-full border border-[#DDE4DC] bg-white px-2.5 text-[11px] font-semibold text-[#17211B]"
      >
        <span className="truncate">{formatAddressPreview(address)}</span>
      </button>
      {copied && (
        <span className="absolute right-0 top-10 rounded-full bg-[#17211B] px-2 py-1 text-[10px] font-semibold text-white shadow-sm">
          Copied
        </span>
      )}
    </div>
  );
}

export function ConnectButton() {
  const {
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
      <div className="flex items-center gap-1.5">
        <CopmBalanceBadge />
        <AddressBadge />
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
