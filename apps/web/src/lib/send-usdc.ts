import { Address, nativeToScVal } from "@stellar/stellar-sdk";
import { Reserve, ReserveError } from "@cavos/reserve";

import { CAVOS_NETWORK, getStellarUsdc } from "@/lib/cavos-config";

type StellarWallet = {
  chain: "stellar";
  address: string;
  signXdr: (xdr: string) => Promise<string>;
  invokeContract: (params: {
    contractId: string;
    method: string;
    args?: unknown[];
  }) => Promise<string>;
};

const RETRYABLE = new Set([
  "path_moved",
  "quote_expired",
  "bootstrap_busy",
  "no_path",
]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** USDC amount string/number -> i128 stroops (7 decimals). */
export function usdcToStroops(amount: string | number): bigint {
  const normalized =
    typeof amount === "number"
      ? amount.toFixed(7)
      : Number(amount).toFixed(7);
  const [whole, frac = ""] = normalized.split(".");
  return BigInt(whole) * 10_000_000n + BigInt(frac.padEnd(7, "0").slice(0, 7));
}

function isRetryableReserveError(err: unknown) {
  if (err instanceof ReserveError) return RETRYABLE.has(err.code);
  if (err instanceof Error) {
    const lower = err.message.toLowerCase();
    return (
      lower.includes("path_moved") ||
      lower.includes("quote_expired") ||
      lower.includes("bootstrap_busy") ||
      lower.includes("no_path") ||
      lower.includes("re-quote")
    );
  }
  return false;
}

/**
 * Preferred path for Cavos kit wallets with appId: Soroban SAC transfer.
 * Relayer pays XLM fees - no DEX USDC->XLM path, so no path_moved.
 */
export async function sendUsdcViaKitSac(input: {
  wallet: StellarWallet;
  destination: string;
  amount: string;
}): Promise<string> {
  const usdc = getStellarUsdc();
  const stroops = usdcToStroops(input.amount);

  return input.wallet.invokeContract({
    contractId: usdc.sac,
    method: "transfer",
    args: [
      Address.fromString(input.wallet.address).toScVal(),
      Address.fromString(input.destination).toScVal(),
      nativeToScVal(stroops, { type: "i128" }),
    ],
  });
}

/**
 * Reserve.pay: fee in USDC via SDEX. Needed when dest cannot receive a Payment
 * yet (claimable), or as fallback. Retries path_moved / quote_expired.
 */
export async function sendUsdcViaReserve(input: {
  wallet: StellarWallet;
  destination: string;
  amount: string;
  maxAttempts?: number;
}): Promise<string> {
  const usdc = getStellarUsdc();
  const token = `${usdc.code}:${usdc.issuer}`;
  const reserve = await Reserve.connect(CAVOS_NETWORK);
  const maxAttempts = input.maxAttempts ?? 4;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { hash } = await reserve.pay(
        {
          source: input.wallet.address,
          destination: input.destination,
          amount: input.amount,
          token,
          maxSend: "1",
        },
        (xdr) => input.wallet.signXdr(xdr)
      );
      return hash;
    } catch (err) {
      lastError = err;
      if (!isRetryableReserveError(err) || attempt === maxAttempts - 1) throw err;
      await sleep(400 * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Error al enviar USDC");
}

/**
 * Kit SAC when dest can receive USDC; Reserve (with retry) otherwise / on SAC fail
 * that looks like trustline missing.
 */
export async function sendUsdc(input: {
  wallet: StellarWallet;
  destination: string;
  amount: string;
}): Promise<string> {
  const usdc = getStellarUsdc();
  const token = `${usdc.code}:${usdc.issuer}`;
  const amount = Number(input.amount).toFixed(7).replace(/\.?0+$/, "") || "0";

  const reserve = await Reserve.connect(CAVOS_NETWORK);
  let destReady = false;
  try {
    destReady = await reserve.destinationReady(input.destination, token);
  } catch {
    destReady = false;
  }

  if (destReady) {
    try {
      return await sendUsdcViaKitSac({
        wallet: input.wallet,
        destination: input.destination,
        amount,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      // Fall back to Reserve if Soroban path is unavailable; still retry DEX fee.
      if (
        msg.includes("trust") ||
        msg.includes("auth") ||
        msg.includes("invoke") ||
        msg.includes("soroban")
      ) {
        return sendUsdcViaReserve({
          wallet: input.wallet,
          destination: input.destination,
          amount,
        });
      }
      throw err;
    }
  }

  return sendUsdcViaReserve({
    wallet: input.wallet,
    destination: input.destination,
    amount,
  });
}
