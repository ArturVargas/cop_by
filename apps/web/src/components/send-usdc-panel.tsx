"use client";

import { FormEvent, useEffect, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { StellarReceipt } from "@/components/stellar-receipt";
import type { StellarReceiptData } from "@/components/shareable-receipt";
import { useStellarWallet } from "@/hooks/use-stellar-wallet";
import { formatUsdcAmount } from "@/lib/format-usdc";
import { CAVOS_NETWORK } from "@/lib/cavos-config";
import {
  getSavedRecipients,
  removeSavedRecipient,
  saveSavedRecipient,
  type SavedRecipient,
} from "@/lib/saved-recipients";
import {
  MEMO_TEXT_MAX_BYTES,
  normalizeMemoText,
  sendUsdc,
  prepareUsdcSend,
  usdcToStroops,
  type PreparedUsdcSend,
} from "@/lib/send-usdc";
import {
  formatShortStellarGAddress,
  isStellarGAddress,
  normalizeStellarGAddress,
} from "@/lib/stellar-address";

type SendStep = "form" | "preparing" | "confirm" | "sending" | "done" | "error";

function humanizeSendError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("quote_expired") || lower.includes("path_moved") || lower.includes("re-quote")) return "El costo cambió o venció. Pulsa Continuar para revisarlo antes de confirmar.";
  if (lower.includes("trustline") || lower.includes("op_no_trust")) return "El destinatario necesita habilitar USDC en su cuenta. Pídele que lo revise antes de reintentar.";
  if (lower.includes("underfunded") || lower.includes("balance")) return "No tienes saldo suficiente para cubrir el envío y su costo.";
  if (lower.includes("reject") || lower.includes("denied")) return "No se autorizó la firma. Puedes revisar el envío e intentarlo de nuevo.";
  if (lower.includes("no_path") || lower.includes("path")) return "No pudimos calcular el costo del envío. Reintenta más tarde.";
  if (lower.includes("bootstrap_busy")) return "La red está ocupada preparando cuentas. Reintenta en unos segundos.";
  if (/^(No pudimos|Saldo insuficiente|Revisa la cuenta|La cuenta cambió|El monto|Usa un monto|Con memo|El memo)/.test(message)) return message;
  return "No pudimos confirmar el resultado. Revisa tu historial antes de intentar otro envío.";
}

export function SendUsdcPanel() {
  const {
    status,
    address,
    usdcBalance,
    balanceError,
    trustlineReady,
    wallet,
    refreshUsdcBalance,
  } = useStellarWallet();

  const formId = useId().replace(/:/g, "");
  const amountId = `${formId}-amount`;
  const destId = `${formId}-dest`;
  const aliasId = `${formId}-alias`;
  const memoId = `${formId}-memo`;
  const amountErrorId = `${formId}-amount-error`;
  const destErrorId = `${formId}-dest-error`;
  const memoHintId = `${formId}-memo-hint`;
  const memoErrorId = `${formId}-memo-error`;
  const formErrorId = `${formId}-form-error`;

  const [destination, setDestination] = useState("");
  const [alias, setAlias] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [step, setStep] = useState<SendStep>("form");
  const [plan, setPlan] = useState<PreparedUsdcSend | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<StellarReceiptData | null>(null);
  const [recipients, setRecipients] = useState<SavedRecipient[]>([]);
  const [amountTouched, setAmountTouched] = useState(false);
  const [destTouched, setDestTouched] = useState(false);
  const [memoTouched, setMemoTouched] = useState(false);
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
    if (!/^\d+(?:\.\d{1,7})?$/.test(amount) || !Number.isFinite(amountNumber) || amountNumber <= 0) {
      return "Ingresa un monto mayor a 0, con hasta 7 decimales.";
    }
    if (Number.isFinite(balanceNumber) && amountNumber > balanceNumber) {
      return "Saldo USDC insuficiente.";
    }
    return null;
  })();

  const destError = (() => {
    if (!destination.trim()) return "Ingresa una cuenta G…";
    if (!isStellarGAddress(normalizedDest)) return "La cuenta Stellar no es válida. Revisa la dirección copiada.";
    if (address && normalizedDest === address) {
      return "No puedes enviarte a ti mismo.";
    }
    return null;
  })();

  const normalizedMemo = useMemo(() => normalizeMemoText(memo), [memo]);
  const memoError = (() => {
    if (!memo.trim()) return null;
    const bytes = new TextEncoder().encode(memo.trim()).length;
    if (bytes > MEMO_TEXT_MAX_BYTES) {
      return "El memo es demasiado largo. Acórtalo; algunos símbolos ocupan más espacio.";
    }
    return null;
  })();

  const showAmountError = (amountTouched || submitted) && !!amountError;
  const showDestError = (destTouched || submitted) && !!destError;
  const showMemoError = (memoTouched || submitted) && !!memoError;

  const canSend =
    status === "ready" &&
    trustlineReady &&
    !balanceError &&
    usdcBalance !== null &&
    !!wallet &&
    !amountError &&
    !destError &&
    !memoError;

  const onPickRecipient = (item: SavedRecipient) => {
    setDestination(item.address);
    setAlias(item.alias);
    setDestTouched(true);
    setError(null);
  };

  const onConfirmSend = async () => {
    if (!wallet || wallet.chain !== "stellar" || !canSend || !plan) return;

    setStep("sending");
    setError(null);
    setReceipt(null);

    try {
      const balance = await refreshUsdcBalance();
      if (balance === null) throw new Error("No pudimos verificar tu saldo. Reintenta antes de enviar.");
      if (usdcToStroops(balance) < usdcToStroops(plan.maxTotal)) throw new Error("Saldo insuficiente para cubrir el monto y el costo máximo.");
      const result = await sendUsdc({ wallet, plan });

      setReceipt({
        variant: "stellar-transfer",
        amount: plan.amount,
        senderAddress: wallet.address,
        recipientAddress: plan.destination,
        recipientAlias: alias.trim() || undefined,
        memo: plan.memo || undefined,
        network: CAVOS_NETWORK,
        completedAt: new Date().toISOString(),
        txHash: result.hash,
        delivery: result.delivery === "claimable" ? "claimable" : undefined,
      });
      setStep("done");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Error al enviar USDC";
      setError(humanizeSendError(raw));
      setStep("error");
      return;
    }
    try {
      saveSavedRecipient({ address: normalizedDest, alias });
      setRecipients(getSavedRecipients());
    } catch {
      // Local recipient storage must not turn a confirmed transfer into a failure.
    }
    void refreshUsdcBalance().catch(() => undefined);
  };

  const onFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    if (amountError || destError || memoError || !wallet || !canSend || step === "preparing") return;
    setStep("preparing");
    try {
      const prepared = await prepareUsdcSend({ source: wallet.address, destination: normalizedDest, amount, memo: normalizedMemo });
      if (usdcBalance === null || usdcToStroops(usdcBalance) < usdcToStroops(prepared.maxTotal)) throw new Error("Saldo insuficiente para cubrir el monto y el costo máximo.");
      setPlan(prepared);
      setStep("confirm");
    } catch (error) {
      setPlan(null);
      setError(humanizeSendError(error instanceof Error ? error.message : "No pudimos preparar el envío. Intenta de nuevo."));
      setStep("error");
    }
  };

  if (status !== "ready") {
    return (
      <p className="text-sm text-[#66736B]" role="status">
        Entra y prepara tu cuenta para enviar USDC.
      </p>
    );
  }

  if (balanceError || usdcBalance === null) {
    return <div className="space-y-3"><p className="text-sm text-[#66736B]" role="status">{balanceError ?? "Consultando tu saldo…"}</p>{balanceError && <Button type="button" variant="outline" onClick={() => void refreshUsdcBalance()}>Reintentar consulta</Button>}</div>;
  }

  if (!trustlineReady) {
    return (
      <p className="text-sm text-[#66736B]" role="status">
        Preparando cuenta USDC…
      </p>
    );
  }

  if (step === "done" && receipt) {
    return (
      <StellarReceipt
          data={receipt}
          doneLabel="Enviar otro"
          onDone={() => {
            setStep("form");
            setAmount("");
            setMemo("");
            setReceipt(null);
            setError(null);
            setSubmitted(false);
            setAmountTouched(false);
            setMemoTouched(false);
          }}
      />
    );
  }

  if ((step === "confirm" || step === "sending") && plan) {
    return (
      <div className="flex flex-col gap-4" aria-busy={step === "sending"}>
        <div className="rounded-[8px] border border-[#DDE4DC] bg-white p-4">
          <p className="text-xs font-semibold text-[#66736B]">Revisa tu envío</p>
          <p className="mt-2 text-2xl font-bold text-[#17211B]">
            {formatUsdcAmount(plan.amount)} <span className="text-base text-[#66736B]">USDC</span>
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
          {normalizedMemo ? (
            <>
              <p className="mt-3 text-xs font-semibold text-[#66736B]">Memo</p>
              <p className="mt-1 break-all font-mono text-xs text-[#17211B]">
                {normalizedMemo}
              </p>
            </>
          ) : null}
          <dl className="mt-4 space-y-2 text-sm text-[#17211B]">
            <div className="flex justify-between gap-3"><dt>Costo adicional máximo</dt><dd>{formatUsdcAmount(plan.maxFee)} USDC</dd></div>
            <div className="flex justify-between gap-3 font-semibold"><dt>Total máximo a descontar</dt><dd>{formatUsdcAmount(plan.maxTotal)} USDC</dd></div>
          </dl>
          <p className="mt-3 text-sm text-[#66736B]">
            {plan.delivery === "claimable"
              ? "El destinatario aún no puede recibir USDC. Los fondos quedarán reservados: deberá reclamarlos y podría tener costos de activación. Esto todavía no es un depósito en su saldo."
              : "El destinatario recibirá USDC en su cuenta. Cavos cubre el costo de red."}
          </p>
        </div>
        {step === "sending" ? (
          <p className="text-sm text-[#66736B]" role="status">
            Enviando USDC…
          </p>
        ) : null}
        <Button
          className="h-11 w-full rounded-[8px] bg-[#0E7C4F] text-sm font-semibold text-white hover:bg-[#0A5F3C] disabled:opacity-60"
          disabled={step === "sending"}
          onClick={() => void onConfirmSend()}
        >
          {step === "sending" ? "Enviando…" : "Confirmar envío"}
        </Button>
        <Button
          variant="outline"
          className="h-11 w-full rounded-[8px]"
          disabled={step === "sending"}
          onClick={() => setStep("form")}
        >
          Volver
        </Button>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void onFormSubmit(event)} noValidate aria-busy={step === "preparing"}>
      <fieldset disabled={step === "preparing"} className="flex min-w-0 flex-col gap-4">
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
          Cuenta Stellar del destinatario <span aria-hidden="true">*</span>
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
          placeholder="Mamá, Juan…"
          enterKeyHint="next"
          className="mt-1 h-11 w-full rounded-[8px] border border-[#DDE4DC] bg-white px-3 text-sm text-[#17211B] outline-none focus:border-[#0E7C4F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E7C4F]"
        />
      </div>

      <div>
        <label htmlFor={memoId} className="text-xs font-semibold text-[#66736B]">
          Memo (opcional)
        </label>
        <input
          id={memoId}
          name="memo"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          maxLength={MEMO_TEXT_MAX_BYTES}
          aria-invalid={showMemoError}
          aria-describedby={[memoHintId, showMemoError ? memoErrorId : null].filter(Boolean).join(" ")}
          value={memo}
          onChange={(e) => {
            setMemo(e.target.value.slice(0, MEMO_TEXT_MAX_BYTES));
            setError(null);
          }}
          onBlur={() => setMemoTouched(true)}
          placeholder="Referencia del destinatario"
          className="mt-1 h-11 w-full rounded-[8px] border border-[#DDE4DC] bg-white px-3 font-mono text-sm text-[#17211B] outline-none focus:border-[#0E7C4F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E7C4F] aria-[invalid=true]:border-[#9B1C1C]"
        />
        <p id={memoHintId} className="mt-1 text-[11px] text-[#66736B]">
          Añádelo solo si el destinatario te lo pide. Hasta {MEMO_TEXT_MAX_BYTES} caracteres simples; algunos símbolos ocupan más espacio. El destinatario debe tener USDC habilitado.
        </p>
        {showMemoError ? (
          <p id={memoErrorId} className="mt-1 text-xs text-[#9B1C1C]" role="alert">
            {memoError}
          </p>
        ) : null}
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
    </fieldset>
    </form>
  );
}
