"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";

import {
  getNetworkByChainId,
  getTargetNetwork,
  type NetworkConfig,
} from "@/lib/network-config";

declare global {
  interface Window {
    ethereum?: {
      isMiniPay?: boolean;
      isMetaMask?: boolean;
      request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

export type WalletRuntime = "minipay" | "browser" | "none";

export type WalletAdapterState = {
  address?: `0x${string}`;
  chainId?: number;
  currentNetwork?: NetworkConfig;
  targetNetwork: NetworkConfig;
  runtime: WalletRuntime;
  isMiniPay: boolean;
  isMetaMask: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  isCorrectNetwork: boolean;
  hasProvider: boolean;
  connectBrowserWallet: () => void;
  disconnectWallet: () => void;
  switchToTargetNetwork: () => void;
};

export function useWalletAdapter(): WalletAdapterState {
  const [runtime, setRuntime] = useState<WalletRuntime>("none");
  const [isMetaMask, setIsMetaMask] = useState(false);
  const [hasAttemptedMiniPayConnect, setHasAttemptedMiniPayConnect] =
    useState(false);

  const { address, isConnected, isConnecting } = useAccount();
  const chainId = useChainId();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const targetNetwork = getTargetNetwork();
  const currentNetwork = getNetworkByChainId(chainId);

  useEffect(() => {
    const provider = window.ethereum;
    setIsMetaMask(provider?.isMetaMask === true);

    if (provider?.isMiniPay) {
      setRuntime("minipay");
      return;
    }

    setRuntime(provider ? "browser" : "none");
  }, []);

  const injectedConnector = useMemo(
    () => connectors.find((connector) => connector.id === "injected"),
    [connectors]
  );

  useEffect(() => {
    if (
      runtime !== "minipay" ||
      hasAttemptedMiniPayConnect ||
      !injectedConnector
    ) {
      return;
    }

    connect({ connector: injectedConnector });
    setHasAttemptedMiniPayConnect(true);
  }, [connect, hasAttemptedMiniPayConnect, injectedConnector, runtime]);

  const connectBrowserWallet = () => {
    const connector = injectedConnector ?? connectors[0];
    if (!connector) return;
    connect({ connector });
  };

  const switchToTargetNetwork = () => {
    switchChain({ chainId: targetNetwork.chainId });
  };

  return {
    address,
    chainId,
    currentNetwork,
    targetNetwork,
    runtime,
    isMiniPay: runtime === "minipay",
    isMetaMask,
    isConnected,
    isConnecting,
    isCorrectNetwork: chainId === targetNetwork.chainId,
    hasProvider: runtime !== "none",
    connectBrowserWallet,
    disconnectWallet: disconnect,
    switchToTargetNetwork,
  };
}
