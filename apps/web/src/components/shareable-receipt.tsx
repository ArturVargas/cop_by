import { formatPesoAmountFromString } from "@/lib/format-peso";
import { formatUsdcAmount } from "@/lib/format-usdc";

export type ShareableReceiptData = {
  amountLabel: string;
  completedAt?: string;
  copmBalance?: string;
  receivedCopm: string;
  recipientAddress?: string;
  recipientAlias?: string;
  title: string;
  txHash: string;
  variant: "swap" | "transfer";
};

export type StellarReceiptData = {
  variant: "stellar-transfer";
  direction?: "sent" | "received";
  delivery?: "claimable";
  amount: string;
  completedAt: string;
  network: "mainnet" | "testnet";
  senderAddress: string;
  recipientAddress: string;
  recipientAlias?: string;
  memo?: string;
  txHash: string;
};

function formatAddressPreview(address: string) {
  if (address.length <= 14) return address;
  return `${address.slice(0, 7)}...${address.slice(-4)}`;
}

export function ShareableReceipt({ data }: { data: ShareableReceiptData | StellarReceiptData }) {
  const stellar = data.variant === "stellar-transfer";
  const formattedDate = data.completedAt
    ? new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(data.completedAt))
    : null;
  const amount = stellar
    ? formatUsdcAmount(data.amount)
    : formatPesoAmountFromString(data.receivedCopm);
  const title = stellar ? (data.delivery === "claimable" ? "Saldo reclamable creado" : data.direction === "received" ? "USDC recibido" : "Envío completado") : data.title;
  const amountLabel = stellar ? (data.delivery === "claimable" ? "Monto reservado" : data.direction === "received" ? "Recibiste" : "Enviaste") : data.amountLabel;
  const destination = data.recipientAddress
    ? stellar ? data.recipientAddress : data.recipientAlias
      ? `${data.recipientAlias} (${formatAddressPreview(data.recipientAddress)})`
      : formatAddressPreview(data.recipientAddress)
    : "Mi wallet";

  return (
    <div
      className="w-full max-w-[360px] overflow-hidden rounded-[12px] border border-wallet-border bg-wallet-card"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      <div className="bg-wallet-purple px-6 py-5 text-wallet-on-brand">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-[8px] bg-wallet-card text-xs font-bold text-wallet-purple">
            COP
          </div>
          <div>
            <p className="text-lg font-bold leading-none">COP By</p>
            <p className="mt-1 text-xs text-wallet-on-brand/80">Comprobante de operación</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-5">
        <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-wallet-positive-soft text-wallet-brand">
          <span className="text-lg font-bold">✓</span>
        </div>
        <h2 className="text-xl font-bold text-wallet-ink">{title}</h2>
        <p className="mt-1 text-sm text-wallet-muted">{amountLabel}</p>
        <p className="mt-3 break-words text-4xl font-bold leading-none text-wallet-brand">
          {amount} <span className="text-lg font-semibold">{stellar ? "USDC" : "pesos"}</span>
        </p>
        <p className="mt-2 text-xs text-wallet-muted">
          {stellar ? `Stellar ${data.network === "testnet" ? "Testnet · Fondos de prueba" : "Mainnet"}` : "Equivalente en COPm onchain"}
        </p>
        {stellar && data.delivery === "claimable" && <p className="mt-3 text-sm text-wallet-muted">La operación reservó estos fondos para su reclamación. Consulta su estado actual en Stellar Expert.</p>}

        <div className="mt-5 space-y-3 rounded-[8px] bg-wallet-surface p-4 text-sm">
          {stellar && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-wallet-muted">De</p>
              <p className="mt-1 break-all font-mono text-xs text-wallet-ink">{data.senderAddress}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-wallet-muted">
              {stellar || data.variant === "transfer" ? "Destinatario" : "Destino"}
            </p>
            {stellar && data.recipientAlias && <p className="mt-1 break-words font-semibold text-wallet-ink">{data.recipientAlias}</p>}
            <p className={stellar ? "mt-1 break-all font-mono text-xs text-wallet-ink" : "mt-1 font-semibold text-wallet-ink"}>{destination}</p>
          </div>
          {formattedDate && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-wallet-muted">
                Fecha
              </p>
              <p className="mt-1 font-semibold text-wallet-ink">{formattedDate}</p>
            </div>
          )}
          {data.variant === "swap" && data.copmBalance && data.copmBalance !== "No disponible" && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-wallet-muted">
                Balance final
              </p>
              <p className="mt-1 font-semibold text-wallet-ink">
                {formatPesoAmountFromString(data.copmBalance)} pesos
              </p>
            </div>
          )}
          {stellar && data.memo && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-wallet-muted">Memo</p>
              <p className="mt-1 break-words text-sm text-wallet-ink">{data.memo}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-wallet-muted">
              Transacción
            </p>
            <p className="mt-1 break-all font-mono text-xs font-semibold text-wallet-brand">
              {stellar ? data.txHash : formatAddressPreview(data.txHash)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
