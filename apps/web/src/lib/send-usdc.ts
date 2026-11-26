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
  StrKey,
} from "@stellar/stellar-sdk";
import { Reserve, type Quote } from "@cavos/reserve";

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

/** Parse ledger amounts exactly; never round money through a float. */
export function usdcToStroops(amount: string | number): bigint {
  const value = String(amount);
  if (!/^\d+(?:\.\d{1,7})?$/.test(value)) throw new Error("Usa un monto válido con hasta 7 decimales.");
  const [whole, fraction = ""] = value.split(".");
  const units = BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0"));
  if (units > 9_223_372_036_854_775_807n) throw new Error("El monto supera el límite de Stellar.");
  return units;
}

function stroopsToUsdc(units: bigint): string {
  const fraction = (units % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return `${units / 10_000_000n}${fraction ? `.${fraction}` : ""}`;
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
  throw new Error("No pudimos confirmar el envío sin costo de red. Vuelve a intentarlo.");
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

type SendDetails = {
  source: string;
  destination: string;
  amount: string;
  memo: string;
  maxFee: string;
  maxTotal: string;
};

export type PreparedUsdcSend = SendDetails & (
  | { route: "sac" | "classic"; delivery: "payment" }
  | { route: "reserve"; delivery: "claimable"; client: Reserve; quote: Quote }
);

/** Prepare exactly what the user will review; failures never choose a paid fallback. */
export async function prepareUsdcSend(input: {
  source: string;
  destination: string;
  amount: string;
  memo?: string;
}): Promise<PreparedUsdcSend> {
  if (!StrKey.isValidEd25519PublicKey(input.source) || !StrKey.isValidEd25519PublicKey(input.destination) || input.source === input.destination) {
    throw new Error("Revisa la cuenta del destinatario.");
  }
  const units = usdcToStroops(input.amount);
  if (units === 0n) throw new Error("El monto debe ser mayor a 0.");
  const amount = stroopsToUsdc(units);
  const memo = input.memo?.trim() ?? "";
  if (new TextEncoder().encode(memo).length > MEMO_TEXT_MAX_BYTES) throw new Error("El memo supera los 28 bytes permitidos.");
  const usdc = getStellarUsdc();
  const token = `${usdc.code}:${usdc.issuer}`;
  const client = await Reserve.connect(CAVOS_NETWORK);
  const ready = await client.destinationReady(input.destination, token);
  const details = { source: input.source, destination: input.destination, amount, memo, maxFee: "0", maxTotal: amount };
  if (ready) return { ...details, route: memo ? "classic" : "sac", delivery: "payment" };
  if (memo) throw new Error("Con memo, el destinatario debe tener habilitado USDC en su cuenta.");
  const quote = await client.quote({
    source: input.source,
    feeToken: token,
    maxSend: "1",
    ops: [{ type: "create_claimable_balance", destination: input.destination, asset: token, amount }],
  });
  const maximumFee = quote.payload.send_max_stroops;
  if (!Number.isSafeInteger(maximumFee) || maximumFee < 0) throw new Error("No pudimos verificar el costo del envío. Intenta de nuevo.");
  const fee = BigInt(maximumFee);
  return { ...details, route: "reserve", delivery: "claimable", client, quote, maxFee: stroopsToUsdc(fee), maxTotal: stroopsToUsdc(units + fee) };
}

export async function sendUsdc({ wallet, plan }: {
  wallet: StellarWallet;
  plan: PreparedUsdcSend;
}): Promise<{ hash: string; delivery: "payment" | "claimable" }> {
  if (wallet.address !== plan.source) throw new Error("La cuenta cambió. Revisa el envío de nuevo.");
  let hash: string;
  if (plan.route === "reserve") {
    // Keep the reviewed quote; expiry or price changes require a new user confirmation.
    ({ hash } = await plan.client.send(plan.quote, (xdr) => wallet.signXdr(xdr)));
  } else if (plan.route === "classic") {
    hash = await sendUsdcClassicWithMemo({ wallet, destination: plan.destination, amount: plan.amount, memo: plan.memo });
  } else {
    hash = await sendUsdcViaKitSac({ wallet, destination: plan.destination, amount: plan.amount });
  }
  return { hash, delivery: plan.delivery };
}
