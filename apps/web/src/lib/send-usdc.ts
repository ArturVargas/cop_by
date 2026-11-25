import {
  Address,
  Asset,
  BASE_FEE,
  Horizon,
  Memo,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import { Reserve, ReserveError } from "@cavos/reserve";

import {
  CAVOS_NETWORK,
  getStellarHorizonUrl,
  getStellarUsdc,
} from "@/lib/cavos-config";

/** MEMO_TEXT max length in bytes (Stellar protocol). */
export const MEMO_TEXT_MAX_BYTES = 28;

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

/** Cavos kit keeps these private in types but assigns them on the instance. */
type KitRelayInternals = {
  relayer?: {
    getSource: () => Promise<string>;
    submit: (kind: string, xdr: string) => Promise<string>;
  };
  adapter?: {
    wrapFeeBump: (
      inner: Transaction,
      feeSource: string
    ) => { toXDR: () => string };
    submit?: (inner: Transaction) => Promise<string>;
  };
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

function networkPassphrase() {
  return CAVOS_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
}

/** Trim and clamp to MEMO_TEXT byte limit. Empty string if blank. */
export function normalizeMemoText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const encoder = new TextEncoder();
  if (encoder.encode(trimmed).length <= MEMO_TEXT_MAX_BYTES) return trimmed;
  let out = trimmed;
  while (out.length > 0 && encoder.encode(out).length > MEMO_TEXT_MAX_BYTES) {
    out = out.slice(0, -1);
  }
  return out;
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

async function submitSponsoredClassic(
  wallet: StellarWallet,
  signedInner: Transaction
): Promise<string> {
  const kit = wallet as StellarWallet & KitRelayInternals;
  if (kit.relayer?.getSource && kit.adapter?.wrapFeeBump) {
    const feeSource = await kit.relayer.getSource();
    const bump = kit.adapter.wrapFeeBump(signedInner, feeSource);
    return kit.relayer.submit("fee-bump", bump.toXDR());
  }
  if (kit.adapter?.submit) {
    return kit.adapter.submit(signedInner);
  }
  const server = new Horizon.Server(getStellarHorizonUrl());
  const result = await server.submitTransaction(signedInner);
  return result.hash;
}

/**
 * Preferred path for Cavos kit wallets with appId: Soroban SAC transfer.
 * Relayer pays XLM fees - no DEX USDC->XLM path, so no path_moved.
 * Note: invokeContract has no memo API.
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
 * Classic Payment + Memo.text, signed via kit, submitted as relayer fee-bump.
 * Requires destination trustline (no claimable path with memo).
 */
export async function sendUsdcClassicWithMemo(input: {
  wallet: StellarWallet;
  destination: string;
  amount: string;
  memo: string;
}): Promise<string> {
  const memo = normalizeMemoText(input.memo);
  if (!memo) {
    throw new Error("Memo vacio");
  }

  const usdc = getStellarUsdc();
  const passphrase = networkPassphrase();
  const server = new Horizon.Server(getStellarHorizonUrl());
  const account = await server.loadAccount(input.wallet.address);
  const asset = new Asset(usdc.code, usdc.issuer);
  const amount =
    Number(input.amount).toFixed(7).replace(/\.?0+$/, "") || "0";

  const unsigned = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: passphrase,
  })
    .addOperation(
      Operation.payment({
        destination: input.destination,
        asset,
        amount,
      })
    )
    .addMemo(Memo.text(memo))
    .setTimeout(180)
    .build();

  const signedXdr = await input.wallet.signXdr(unsigned.toXDR());
  const signed = TransactionBuilder.fromXDR(signedXdr, passphrase);
  if (!(signed instanceof Transaction)) {
    throw new Error("Se esperaba una transaccion firmada, no fee-bump");
  }
  return submitSponsoredClassic(input.wallet, signed);
}

/**
 * Reserve.pay: fee in USDC via SDEX. Needed when dest cannot receive a Payment
 * yet (claimable), or as fallback. Retries path_moved / quote_expired.
 * No memo support.
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
 * With memo: classic Payment + Memo (kit fee-bump). Dest must hold USDC trustline.
 * Without memo: Kit SAC when dest ready; Reserve otherwise / on SAC fail.
 */
export async function sendUsdc(input: {
  wallet: StellarWallet;
  destination: string;
  amount: string;
  memo?: string;
}): Promise<string> {
  const usdc = getStellarUsdc();
  const token = `${usdc.code}:${usdc.issuer}`;
  const amount = Number(input.amount).toFixed(7).replace(/\.?0+$/, "") || "0";
  const memo = input.memo ? normalizeMemoText(input.memo) : "";

  if (memo) {
    const reserve = await Reserve.connect(CAVOS_NETWORK);
    let destReady = false;
    try {
      destReady = await reserve.destinationReady(input.destination, token);
    } catch {
      destReady = false;
    }
    if (!destReady) {
      throw new Error(
        "Memo requiere destino con trustline USDC (no se puede usar claimable)."
      );
    }
    return sendUsdcClassicWithMemo({
      wallet: input.wallet,
      destination: input.destination,
      amount,
      memo,
    });
  }

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
