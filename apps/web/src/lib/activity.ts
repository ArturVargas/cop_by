export type ActivityItem = {
  amount: string;
  createdAt: string;
  error: string | null;
  id: string;
  recipientAddress: string | null;
  status: string;
  swapType?: "buy" | "sell";
  txHash: string | null;
  type: "swap" | "transfer";
  updatedAt: string;
};

type SwapRow = {
  created_at: string;
  error: string | null;
  intent_id: string;
  recipient_address: string | null;
  requested_copm: string;
  status: string;
  swap_type?: string | null;
  swap_tx_hashes: unknown;
  updated_at: string;
  user_address: string;
};

type TransferRow = {
  copm_amount: string;
  created_at: string;
  error: string | null;
  recipient_address: string;
  status: string;
  transfer_id: string;
  tx_hash: string | null;
  updated_at: string;
};

function asTxHash(value: unknown) {
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

function mapSwap(row: SwapRow): ActivityItem {
  return {
    amount: row.requested_copm,
    createdAt: row.created_at,
    error: row.error,
    id: row.intent_id,
    recipientAddress: row.recipient_address,
    status: row.status,
    swapType: row.swap_type === "sell" ? "sell" : "buy",
    txHash: asTxHash(row.swap_tx_hashes),
    type: "swap",
    updatedAt: row.updated_at,
  };
}

function mapTransfer(row: TransferRow): ActivityItem {
  return {
    amount: row.copm_amount,
    createdAt: row.created_at,
    error: row.error,
    id: row.transfer_id,
    recipientAddress: row.recipient_address,
    status: row.status,
    txHash: row.tx_hash,
    type: "transfer",
    updatedAt: row.updated_at,
  };
}

export async function fetchUserActivity(userAddress: string, limit = 20) {
  const params = new URLSearchParams({
    limit: String(limit),
    userAddress,
  });

  const [swapsRes, transfersRes] = await Promise.all([
    fetch(`/api/swaps?${params}`),
    fetch(`/api/transfers?${new URLSearchParams({ limit: String(limit), senderAddress: userAddress })}`),
  ]);

  if (!swapsRes.ok || !transfersRes.ok) {
    throw new Error("No pudimos cargar tu actividad");
  }

  const swaps = ((await swapsRes.json()) as { items?: SwapRow[] }).items ?? [];
  const transfers =
    ((await transfersRes.json()) as { items?: TransferRow[] }).items ?? [];

  return [...swaps.map(mapSwap), ...transfers.map(mapTransfer)].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getActivityStatusLabel(status: string, error: string | null) {
  if (status === "failed" || error) return "Fallido";
  if (["created", "quoting"].includes(status)) return "Pendiente";
  if (["submitted", "processing", "buying"].includes(status)) return "Procesando";
  if (["confirmed", "logged", "complete"].includes(status)) return "Completado";
  return "Pendiente";
}

export function getActivityStatusTone(status: string, error: string | null) {
  const label = getActivityStatusLabel(status, error);
  if (label === "Completado") return "bg-[#E6F4EE] text-[#0E7C4F]";
  if (label === "Procesando") return "bg-[#EEF0FA] text-[#3D4FA8]";
  if (label === "Fallido") return "bg-[#FDECEC] text-[#8A1F1F]";
  return "bg-[#FFF6D8] text-[#92610a]";
}

export function formatActivityDate(value: string) {
  const date = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return "Hace un momento";
  if (diffHours < 24) return `Hace ${diffHours} h`;

  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
  }).format(date);
}
