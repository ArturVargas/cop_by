import { CAVOS_NETWORK, getStellarHorizonUrl, getStellarUsdc } from "./cavos-config";

export type StellarActivityItem = {
  kind?: "conversion" | "claimable";
  id: string;
  direction: "sent" | "received";
  amount: string;
  from: string;
  to: string;
  createdAt: string;
  txHash: string;
  memo?: string;
};

type AssetMovement = {
  asset_code?: string;
  asset_issuer?: string;
  type?: string;
  from?: string;
  to?: string;
  amount?: string;
};

type HorizonOperation = AssetMovement & {
  source_amount?: string;
  source_asset_code?: string;
  source_asset_issuer?: string;
  source_account?: string;
  asset?: string;
  claimants?: { destination: string }[];
  id: string;
  paging_token?: string;
  transaction_successful: boolean;
  created_at: string;
  transaction_hash: string;
  transaction?: { memo?: string; memo_type?: string };
  asset_balance_changes?: AssetMovement[];
};

export type StellarActivityPage = {
  items: StellarActivityItem[];
  nextCursor: string | null;
  network: typeof CAVOS_NETWORK;
};

export function stellarTransactionUrl(hash: string) {
  const network = CAVOS_NETWORK === "mainnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${network}/tx/${hash}`;
}

export function mapStellarOperations(
  operations: HorizonOperation[],
  address: string,
  asset: { code: string; issuer: string }
): StellarActivityItem[] {
  return operations.flatMap((operation) => {
    if (!operation.transaction_successful) return [];
    let movements: (AssetMovement & { direction?: "sent" | "received"; kind?: "conversion" | "claimable" })[] = [];
    if (operation.type === "invoke_host_function") {
      movements = (operation.asset_balance_changes ?? []).filter((change) => change.type === "transfer");
    } else if (operation.type === "payment") {
      movements = [operation];
    } else if (operation.type?.startsWith("path_payment_")) {
      const kind = "conversion" as const;
      if (operation.from === address) movements.push({
        ...operation, kind, direction: "sent",
        asset_code: operation.source_asset_code,
        asset_issuer: operation.source_asset_issuer,
        amount: operation.source_amount,
      });
      if (operation.to === address) movements.push({ ...operation, kind, direction: "received" });
    } else if (operation.type === "create_claimable_balance" && operation.asset === `${asset.code}:${asset.issuer}`) {
      const destinations = operation.claimants?.filter((claimant) => claimant.destination !== operation.source_account) ?? [];
      // Reserve creates one recipient claimant plus a sender reclaim claimant.
      if (destinations.length === 1) movements = [{
        ...operation, kind: "claimable", from: operation.source_account,
        to: destinations[0].destination, asset_code: asset.code, asset_issuer: asset.issuer,
      }];
    }

    return movements.flatMap((movement, index) => {
      const { from, to, amount } = movement;
      if (
        movement.asset_code !== asset.code || movement.asset_issuer !== asset.issuer ||
        !from || !to || (from === to && movement.kind !== "conversion") || (from !== address && to !== address) ||
        typeof amount !== "string" || !/^\d+(\.\d{1,7})?$/.test(amount)
      ) return [];

      return [{
        id: `${operation.id}:${index}`,
        direction: movement.direction ?? (from === address ? "sent" as const : "received" as const),
        kind: movement.kind,
        amount,
        from,
        to,
        createdAt: operation.created_at,
        txHash: operation.transaction_hash,
        memo: operation.transaction?.memo,
      }];
    });
  });
}

export async function loadStellarActivity(address: string, cursor?: string): Promise<StellarActivityPage> {
  const params = new URLSearchParams({ order: "desc", limit: "100", join: "transactions" });
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`${getStellarHorizonUrl()}/accounts/${address}/operations?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return { items: [], nextCursor: null, network: CAVOS_NETWORK };
  if (!response.ok) throw new Error("No pudimos consultar Stellar. Intenta de nuevo.");
  const data = await response.json() as { _embedded?: { records?: HorizonOperation[] } };
  const operations = data._embedded?.records;
  if (!Array.isArray(operations)) throw new Error("La respuesta de Stellar no está disponible.");
  return {
    items: mapStellarOperations(operations, address, getStellarUsdc()),
    nextCursor: operations.length === 100 ? operations.at(-1)?.paging_token ?? null : null,
    network: CAVOS_NETWORK,
  };
}
