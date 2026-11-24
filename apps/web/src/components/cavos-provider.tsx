"use client";

import { CavosProvider } from "@cavos/kit/react";

import {
  CAVOS_APP_ID,
  CAVOS_APP_SALT,
  CAVOS_ENVIRONMENT,
  CAVOS_NETWORK,
  CAVOS_REDIRECT_URI,
  isCavosConfigured,
} from "@/lib/cavos-config";

/**
 * Always mounts CavosProvider so `useCavos` is safe under the tree.
 * Without NEXT_PUBLIC_CAVOS_APP_ID, login/relayer will not work — UI shows setup.
 */
export function AppCavosProvider({ children }: { children: React.ReactNode }) {
  const appId = isCavosConfigured() ? CAVOS_APP_ID : "unconfigured";

  return (
    <CavosProvider
      config={{
        appId,
        chains: ["stellar"],
        defaultChain: "stellar",
        network: CAVOS_NETWORK,
        appSalt: CAVOS_APP_SALT,
        socialRecovery: true,
        deviceApproval: "enclave",
        environment: CAVOS_ENVIRONMENT,
        redirectUri: CAVOS_REDIRECT_URI,
      }}
      modal={{
        appName: "COP By",
        theme: "light",
        primaryColor: "#0E7C4F",
        providers: ["google", "apple", "email"],
      }}
    >
      {children}
    </CavosProvider>
  );
}
