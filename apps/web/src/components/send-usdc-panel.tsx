"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useStellarWallet } from "@/hooks/use-stellar-wallet";
import { CAVOS_NETWORK } from "@/lib/cavos-config";
import {
  getSavedRecipients,
  removeSavedRecipient,
  saveSavedRecipient,
  type SavedRecipient,
} from "@/lib/saved-recipients";
import { sendUsdc } from "@/lib/send-usdc";
import {
  isStellarGAddress,
  normalizeStellarGAddress,
} from "@/lib/stellar-address";

type SendStep = "form" | "confirm" | "sending" | "done" | "error";

function humanizeSendError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("trustline") || lower.includes("op_no_trust")) {
    return "El destinatario necesita trustline USDC, o tu cuenta no tiene USDC listo.";
  }
  if (lower.includes("underfunded") || lower.includes("balance")) {
    return "Saldo USDC insuficiente para este envio.";
  }
  if (lower.includes("reject") || lower.includes("denied")) {
    return "Firma rechazada. Intenta de nuevo.";
  }
  if (lower.includes("path_moved") || lower.includes("re-quote")) {
    return "La ruta de network fee se movio en testnet. Intenta de nuevo en unos segundos.";
  }
  if (lower.includes("path") || lower.includes("no_path")) {
    return "No hay ruta para la network fee en USDC. Intenta mas tarde.";
  }
  if (lower.includes("bootstrap_busy")) {
    return "La red esta ocupada creando cuentas. Reintenta en unos segundos.";
  }
  if (message.startsWith("kit/") || message.startsWith("reserve")) {
    return "No se pudo completar el envio. Revisa el destino e intenta de nuevo.";
  }
  return message;
}

function explorerTxUrl(hash: string) {
  const base =
    CAVOS_NETWORK === "mainnet"
      ? "https://stellar.expert/explorer/public/tx/"
      : "https://stellar.expert/explorer/testnet/tx/";
  return `${base}${hash}`;
}

export function SendUsdcPanel() {
  const {
    status,
    address,
    usdcBalance,
    trustlineReady,
    wallet,
    refreshUsdcBalance,
  } = useStellarWallet();

  const [destination, setDestination] = useState("");
  const [alias, setAlias] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<SendStep>("form");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<SavedRecipient[]>([]);

  useEffect(() => {
    setRecipients(getSavedRecipients());
  }, []);

  const normalizedDest = useMemo(
    () => (destination ? normalizeStellarGAddress(destination) : ""),
    [destination]
  );

  const amountNumber = Number(amount);
  const balanceNumber = usdcBalance === null ? NaN : Number(usdcBalance);

  const canSubmit =
    status === "ready" &&
    trustlineReady &&
    !!wallet &&
    isStellarGAddress(normalizedDest) &&
    normalizedDest !== address &&
    Number.isFinite(amountNumber) &&
    amountNumber > 0 &&
    (!Number.isFinite(balanceNumber) || amountNumber <= balanceNumber);

  const onPickRecipient = (item: SavedRecipient) => {
    setDestination(item.address);
    setAlias(item.alias);
  };

  const onConfirmSend = async () => {
    if (!wallet || wallet.chain !== "stellar" || !canSubmit) return;

    setStep("sending");
    setError(null);
    setTxHash(null);

    try {
      const hash = await sendUsdc({
        wallet,
        destination: normalizedDest,
        amount: amountNumber.toFixed(7).replace(/\.?0+$/, ""),
      });

      saveSavedRecipient({ address: normalizedDest, alias });
      setRecipients(getSavedRecipients());
      setTxHash(hash);
      setStep("done");
      await refreshUsdcBalance();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Error al enviar USDC";
      setError(humanizeSendError(raw));
      setStep("error");
    }
  };

  if (status !== "ready") {
    return (
      <p className="text-sm text-[#66736B]">
        Entra y prepara tu cuenta para enviar USDC.
      </p>
    );
  }

  if (!trustlineReady) {
    return (
      <p className="text-sm text-[#66736B]">
        Preparando trustline USDC…
      </p>
    );
  }

  if (step === "done" && txHash) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-[8px] border border-[#D5EADF] bg-[#E6F4EE] p-4">
          <p className="text-sm font-semibold text-[#0E7C4F]">Envio enviado</p>
          <p className="mt-1 text-sm text-[#17211B]">
            {amount} USDC → destinatario
          </p>
          <p className="mt-3 break-all font-mono text-[11px] text-[#66736B]">
            {txHash}
          </p>
        </div>
        <a
          href={explorerTxUrl(txHash)}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-[#0E7C4F] underline"
        >
          Ver en Stellar Expert
        </a>
        <Button
          className="h-11 w-full rounded-[8px] bg-[#0E7C4F] text-sm font-semibold text-white hover:bg-[#0A5F3C]"
          onClick={() => {
            setStep("form");
            setAmount("");
            setTxHash(null);
            setError(null);
          }}
        >
          Enviar otro
        </Button>
      </div>
    );
  }

  if (step === "confirm" || step === "sending") {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-[8px] border border-[#DDE4DC] bg-white p-4">
          <p className="text-xs font-semibold text-[#66736B]">Confirmas enviar</p>
          <p className="mt-2 text-2xl font-bold text-[#17211B]">
            {amount} <span className="text-base text-[#66736B]">USDC</span>
          </p>
          <p className="mt-3 text-xs font-semibold text-[#66736B]">A</p>
          <p className="mt-1 break-all font-mono text-xs text-[#17211B]">
            {normalizedDest}
          </p>
          {alias ? (
            <p className="mt-2 text-sm text-[#66736B]">Alias: {alias}</p>
          ) : null}
          <p className="mt-3 text-[11px] text-[#66736B]">
            Network fee la cubre Cavos (relayer). Si el destino no tiene
            trustline, se deja claimable via Reserve.
          </p>
        </div>
        {error && step === "sending" ? null : null}
        <Button
          className="h-11 w-full rounded-[8px] bg-[#0E7C4F] text-sm font-semibold text-white hover:bg-[#0A5F3C] disabled:opacity-60"
          disabled={step === "sending"}
          onClick={() => void onConfirmSend()}
        >
          {step === "sending" ? "Firmando…" : "Confirmar envio"}
        </Button>
        <Button
          variant="outline"
          className="h-11 w-full rounded-[8px]"
          disabled={step === "sending"}
          onClick={() => setStep("form")}
        >
          Atras
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs font-semibold text-[#66736B]">Monto USDC</label>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.00"
          className="mt-1 h-12 w-full rounded-[8px] border border-[#DDE4DC] bg-white px-3 text-base text-[#17211B] outline-none focus:border-[#0E7C4F]"
        />
        <button
          type="button"
          className="mt-1 text-xs font-semibold text-[#0E7C4F]"
          onClick={() => {
            if (usdcBalance && Number(usdcBalance) > 0) setAmount(usdcBalance);
          }}
        >
          Usar todo ({usdcBalance ?? "0"} USDC)
        </button>
      </div>

      <div>
        <label className="text-xs font-semibold text-[#66736B]">
          Destinatario (G…)
        </label>
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="G…"
          spellCheck={false}
          className="mt-1 h-12 w-full rounded-[8px] border border-[#DDE4DC] bg-white px-3 font-mono text-xs text-[#17211B] outline-none focus:border-[#0E7C4F]"
        />
        {destination && !isStellarGAddress(normalizedDest) && (
          <p className="mt-1 text-xs text-[#9B1C1C]">Cuenta Stellar invalida</p>
        )}
        {normalizedDest && address && normalizedDest === address && (
          <p className="mt-1 text-xs text-[#9B1C1C]">No puedes enviarte a ti mismo</p>
        )}
      </div>

      <div>
        <label className="text-xs font-semibold text-[#66736B]">
          Alias (opcional)
        </label>
        <input
          value={alias}
          onChange={(e) => setAlias(e.target.value.slice(0, 24))}
          placeholder="Mama, Juan…"
          className="mt-1 h-11 w-full rounded-[8px] border border-[#DDE4DC] bg-white px-3 text-sm text-[#17211B] outline-none focus:border-[#0E7C4F]"
        />
      </div>

      {recipients.length > 0 && (
        <div className="rounded-[8px] border border-[#DDE4DC] bg-white p-3">
          <p className="text-xs font-semibold text-[#66736B]">Guardados</p>
          <ul className="mt-2 space-y-2">
            {recipients.map((item) => (
              <li key={item.address} className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => onPickRecipient(item)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-sm font-semibold text-[#17211B]">
                    {item.alias || "Sin alias"}
                  </p>
                  <p className="break-all font-mono text-[10px] text-[#66736B]">
                    {item.address}
                  </p>
                </button>
                <button
                  type="button"
                  className="shrink-0 text-[11px] font-semibold text-[#9B1C1C]"
                  onClick={() => {
                    removeSavedRecipient(item.address);
                    setRecipients(getSavedRecipients());
                  }}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(step === "error" || error) && (
        <p className="rounded-[8px] border border-[#F5C6CB] bg-[#FDECEE] px-3 py-2 text-xs text-[#9B1C1C]">
          {error}
        </p>
      )}

      <Button
        className="h-12 w-full rounded-[8px] bg-[#0E7C4F] text-base font-semibold text-white hover:bg-[#0A5F3C] disabled:opacity-60"
        disabled={!canSubmit}
        onClick={() => {
          setError(null);
          setStep("confirm");
        }}
      >
        Continuar
      </Button>
    </div>
  );
}
