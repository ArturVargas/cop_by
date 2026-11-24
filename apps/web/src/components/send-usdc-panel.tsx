"use client";

import { FormEvent, useEffect, useId, useMemo, useState } from "react";

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
  formatShortStellarGAddress,
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

  const formId = useId().replace(/:/g, "");
  const amountId = `${formId}-amount`;
  const destId = `${formId}-dest`;
  const aliasId = `${formId}-alias`;
  const amountErrorId = `${formId}-amount-error`;
  const destErrorId = `${formId}-dest-error`;
  const formErrorId = `${formId}-form-error`;

  const [destination, setDestination] = useState("");
  const [alias, setAlias] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<SendStep>("form");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<SavedRecipient[]>([]);
  const [amountTouched, setAmountTouched] = useState(false);
  const [destTouched, setDestTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setRecipients(getSavedRecipients());
  }, []);

  const normalizedDest = useMemo(
    () => (destination ? normalizeStellarGAddress(destination) : ""),
    [destination]
  );

  const amountNumber = Number(amount);
  const balanceNumber = usdcBalance === null ? NaN : Number(usdcBalance);

  const amountError = (() => {
    if (!amount.trim()) return "Ingresa un monto.";
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      return "El monto debe ser mayor a 0.";
    }
    if (Number.isFinite(balanceNumber) && amountNumber > balanceNumber) {
      return "Saldo USDC insuficiente.";
    }
    return null;
  })();

  const destError = (() => {
    if (!destination.trim()) return "Ingresa una cuenta G…";
    if (!isStellarGAddress(normalizedDest)) return "Cuenta Stellar invalida.";
    if (address && normalizedDest === address) {
      return "No puedes enviarte a ti mismo.";
    }
    return null;
  })();

  const showAmountError = (amountTouched || submitted) && !!amountError;
  const showDestError = (destTouched || submitted) && !!destError;

  const canSend =
    status === "ready" &&
    trustlineReady &&
    !!wallet &&
    !amountError &&
    !destError;

  const onPickRecipient = (item: SavedRecipient) => {
    setDestination(item.address);
    setAlias(item.alias);
    setDestTouched(true);
    setError(null);
  };

  const onConfirmSend = async () => {
    if (!wallet || wallet.chain !== "stellar" || !canSend) return;

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

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    if (amountError || destError) return;
    setStep("confirm");
  };

  if (status !== "ready") {
    return (
      <p className="text-sm text-[#66736B]" role="status">
        Entra y prepara tu cuenta para enviar USDC.
      </p>
    );
  }

  if (!trustlineReady) {
    return (
      <p className="text-sm text-[#66736B]" role="status">
        Preparando cuenta USDC…
      </p>
    );
  }

  if (step === "done" && txHash) {
    return (
      <div className="flex flex-col gap-4">
        <div
          className="rounded-[8px] border border-[#D5EADF] bg-[#E6F4EE] p-4"
          role="status"
        >
          <p className="text-sm font-semibold text-[#0E7C4F]">Envio completado</p>
          <p className="mt-1 text-sm text-[#17211B]">
            {amount} USDC enviados
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
            setSubmitted(false);
            setAmountTouched(false);
          }}
        >
          Enviar otro
        </Button>
      </div>
    );
  }

  if (step === "confirm" || step === "sending") {
    return (
      <div className="flex flex-col gap-4" aria-busy={step === "sending"}>
        <div className="rounded-[8px] border border-[#DDE4DC] bg-white p-4">
          <p className="text-xs font-semibold text-[#66736B]">Confirmas enviar</p>
          <p className="mt-2 text-2xl font-bold text-[#17211B]">
            {amount} <span className="text-base text-[#66736B]">USDC</span>
          </p>
          <p className="mt-3 text-xs font-semibold text-[#66736B]">A</p>
          <p
            className="mt-1 break-all font-mono text-xs text-[#17211B]"
            title={normalizedDest}
          >
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
        {step === "sending" ? (
          <p className="text-sm text-[#66736B]" role="status">
            Firmando envio…
          </p>
        ) : null}
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
    <form className="flex flex-col gap-4" onSubmit={onFormSubmit} noValidate>
      <div>
        <label htmlFor={amountId} className="text-xs font-semibold text-[#66736B]">
          Monto USDC <span aria-hidden="true">*</span>
        </label>
        <input
          id={amountId}
          name="amount"
          inputMode="decimal"
          enterKeyHint="next"
          required
          aria-invalid={showAmountError}
          aria-describedby={showAmountError ? amountErrorId : undefined}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value.replace(/[^0-9.]/g, ""));
            setError(null);
          }}
          onBlur={() => setAmountTouched(true)}
          placeholder="0.00"
          className="mt-1 h-12 w-full rounded-[8px] border border-[#DDE4DC] bg-white px-3 text-base text-[#17211B] outline-none focus:border-[#0E7C4F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E7C4F] aria-[invalid=true]:border-[#9B1C1C]"
        />
        <button
          type="button"
          className="mt-1 text-xs font-semibold text-[#0E7C4F]"
          onClick={() => {
            if (usdcBalance && Number(usdcBalance) > 0) {
              setAmount(usdcBalance);
              setAmountTouched(true);
            }
          }}
        >
          Usar todo ({usdcBalance ?? "0"} USDC)
        </button>
        {showAmountError ? (
          <p id={amountErrorId} className="mt-1 text-xs text-[#9B1C1C]" role="alert">
            {amountError}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor={destId} className="text-xs font-semibold text-[#66736B]">
          Destinatario (G…) <span aria-hidden="true">*</span>
        </label>
        <input
          id={destId}
          name="destination"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="next"
          required
          aria-invalid={showDestError}
          aria-describedby={showDestError ? destErrorId : undefined}
          value={destination}
          onChange={(e) => {
            setDestination(e.target.value);
            setError(null);
          }}
          onBlur={() => setDestTouched(true)}
          placeholder="G…"
          className="mt-1 h-12 w-full rounded-[8px] border border-[#DDE4DC] bg-white px-3 font-mono text-xs text-[#17211B] outline-none focus:border-[#0E7C4F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E7C4F] aria-[invalid=true]:border-[#9B1C1C]"
        />
        {showDestError ? (
          <p id={destErrorId} className="mt-1 text-xs text-[#9B1C1C]" role="alert">
            {destError}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor={aliasId} className="text-xs font-semibold text-[#66736B]">
          Alias (opcional)
        </label>
        <input
          id={aliasId}
          name="alias"
          value={alias}
          onChange={(e) => setAlias(e.target.value.slice(0, 24))}
          placeholder="Mama, Juan…"
          enterKeyHint="done"
          className="mt-1 h-11 w-full rounded-[8px] border border-[#DDE4DC] bg-white px-3 text-sm text-[#17211B] outline-none focus:border-[#0E7C4F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E7C4F]"
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
                  <p
                    className="font-mono text-[10px] text-[#66736B]"
                    title={item.address}
                  >
                    {formatShortStellarGAddress(item.address)}
                  </p>
                </button>
                <button
                  type="button"
                  className="min-h-9 shrink-0 px-1 text-[11px] font-semibold text-[#9B1C1C]"
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
        <p
          id={formErrorId}
          className="rounded-[8px] border border-[#F5C6CB] bg-[#FDECEE] px-3 py-2 text-xs text-[#9B1C1C]"
          role="alert"
        >
          {error}
        </p>
      )}

      <Button
        type="submit"
        className="h-12 w-full rounded-[8px] bg-[#0E7C4F] text-base font-semibold text-white hover:bg-[#0A5F3C]"
      >
        Continuar
      </Button>
    </form>
  );
}
