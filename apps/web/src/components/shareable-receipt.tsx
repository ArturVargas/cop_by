import { formatPesoAmountFromString } from "@/lib/format-peso";

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

function formatAddressPreview(address: string) {
  if (address.length <= 14) return address;
  return `${address.slice(0, 7)}...${address.slice(-4)}`;
}

export function ShareableReceipt({ data }: { data: ShareableReceiptData }) {
  const formattedDate = data.completedAt
    ? new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(data.completedAt))
    : null;
  const amount = formatPesoAmountFromString(data.receivedCopm);
  const destination = data.recipientAddress
    ? data.recipientAlias
      ? `${data.recipientAlias} (${formatAddressPreview(data.recipientAddress)})`
      : formatAddressPreview(data.recipientAddress)
    : "Mi wallet";

  return (
    <div
      className="w-[360px] overflow-hidden rounded-[12px] border border-[#DDE4DC] bg-white"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      <div className="bg-[#6D45B8] px-6 py-5 text-white">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-[8px] bg-white text-xs font-bold text-[#6D45B8]">
            COP
          </div>
          <div>
            <p className="text-lg font-bold leading-none">COP By</p>
            <p className="mt-1 text-xs text-white/80">Comprobante de operación</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-5">
        <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#E6F4EE] text-[#0E7C4F]">
          <span className="text-lg font-bold">✓</span>
        </div>
        <h2 className="text-xl font-bold text-[#17211B]">{data.title}</h2>
        <p className="mt-1 text-sm text-[#66736B]">{data.amountLabel}</p>
        <p className="mt-3 text-4xl font-bold leading-none text-[#0E7C4F]">
          {amount} <span className="text-lg font-semibold">pesos</span>
        </p>
        <p className="mt-1 text-xs text-[#66736B]">Equivalente en COPm onchain</p>

        <div className="mt-5 space-y-3 rounded-[8px] bg-[#F7F8F5] p-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#66736B]">
              {data.variant === "transfer" ? "Destinatario" : "Destino"}
            </p>
            <p className="mt-1 font-semibold text-[#17211B]">{destination}</p>
          </div>
          {formattedDate && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#66736B]">
                Fecha
              </p>
              <p className="mt-1 font-semibold text-[#17211B]">{formattedDate}</p>
            </div>
          )}
          {data.variant === "swap" && data.copmBalance && data.copmBalance !== "No disponible" && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#66736B]">
                Balance final
              </p>
              <p className="mt-1 font-semibold text-[#17211B]">
                {formatPesoAmountFromString(data.copmBalance)} pesos
              </p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#66736B]">
              Transacción
            </p>
            <p className="mt-1 break-all font-mono text-xs font-semibold text-[#0E7C4F]">
              {formatAddressPreview(data.txHash)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
