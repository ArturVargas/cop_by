import type { CavosNetwork } from "./cavos-config";

export async function shareStellarAccount(address: string, network: CavosNetwork): Promise<"shared" | "copied" | "cancelled"> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: "Recibir USDC · COP By",
        text: `Mi cuenta COP By para recibir USDC en Stellar ${network === "testnet" ? "Testnet (solo fondos de prueba)" : "Mainnet"}:\n${address}`,
      });
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return "cancelled";
      throw error;
    }
  }
  await navigator.clipboard.writeText(address);
  return "copied";
}
