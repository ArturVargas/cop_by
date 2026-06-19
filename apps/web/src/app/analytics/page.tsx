import Link from "next/link";

import { ensureSwapTable, getSql } from "@/lib/db";
import { getTargetNetwork } from "@/lib/network-config";

export const dynamic = "force-dynamic";

type SwapRow = {
  chain_id: number;
  copm_received: string | null;
  created_at: string;
  error: string | null;
  fee_usd: string | null;
  intent_id: string;
  onchain_log_tx_hash: string | null;
  requested_copm: string;
  squid_request_ids: unknown;
  status: string;
  swap_tx_hashes: unknown;
  tokens_spent: unknown;
  user_address: string;
};

type TokenSpend = {
  amount?: string;
  amountUsd?: number;
  symbol?: string;
};

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function number(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function percent(value: number) {
  return `${number(value, 1)}%`;
}

function shortAddress(address?: string | null) {
  if (!address) return "Not set";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getTokensSpent(row: SwapRow) {
  return asArray(row.tokens_spent) as TokenSpend[];
}

function isCompleted(row: SwapRow) {
  return ["confirmed", "logged"].includes(row.status);
}

function getVolumeUsd(rows: SwapRow[]) {
  return rows.reduce(
    (sum, row) =>
      sum +
      getTokensSpent(row).reduce(
        (tokenSum, token) => tokenSum + Number(token.amountUsd ?? 0),
        0
      ),
    0
  );
}

async function getRows() {
  await ensureSwapTable();
  return (await getSql()`
    SELECT *
    FROM swap_intents
    ORDER BY created_at DESC
    LIMIT 5000
  `) as SwapRow[];
}

function StatCard({
  label,
  tone,
  value,
  sub,
}: {
  label: string;
  tone: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className={`rounded-[8px] p-5 ${tone}`}>
      <p className="text-xs font-bold uppercase text-[#808880]">{label}</p>
      <p className="mt-4 text-4xl font-bold tracking-normal text-[#2B2D2F]">
        {value}
      </p>
      {sub && <p className="mt-3 text-sm text-[#808880]">{sub}</p>}
    </div>
  );
}

export default async function AnalyticsPage() {
  const rows = await getRows();
  const targetNetwork = getTargetNetwork();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const total = rows.length;
  const completed = rows.filter(isCompleted);
  const logged = rows.filter((row) => row.status === "logged");
  const failed = rows.filter((row) => row.status === "failed" || row.error);
  const todayRows = completed.filter((row) => new Date(row.created_at) >= today);
  const wau = new Set(
    completed
      .filter((row) => new Date(row.created_at) >= sevenDaysAgo)
      .map((row) => row.user_address)
  ).size;
  const mau = new Set(
    completed
      .filter((row) => new Date(row.created_at) >= thirtyDaysAgo)
      .map((row) => row.user_address)
  ).size;
  const users = new Set(completed.map((row) => row.user_address)).size;
  const volumeUsd = getVolumeUsd(completed);
  const feeUsd = completed.reduce((sum, row) => sum + Number(row.fee_usd ?? 0), 0);
  const copmReceived = completed.reduce(
    (sum, row) => sum + Number(row.copm_received ?? 0),
    0
  );
  const multiToken = completed.filter((row) => getTokensSpent(row).length > 1).length;
  const txCount = completed.reduce(
    (sum, row) => sum + asArray(row.swap_tx_hashes).length,
    0
  );
  const tokenTable = Object.entries(
    completed.reduce<Record<string, { count: number; usd: number }>>((acc, row) => {
      getTokensSpent(row).forEach((token) => {
        if (!token.symbol) return;
        acc[token.symbol] ??= { count: 0, usd: 0 };
        acc[token.symbol].count += 1;
        acc[token.symbol].usd += Number(token.amountUsd ?? 0);
      });
      return acc;
    }, {})
  ).sort(([, a], [, b]) => b.usd - a.usd);
  const tokenTotalUsd = tokenTable.reduce((sum, [, token]) => sum + token.usd, 0);

  const contracts = [
    ["Purchase log", process.env.PURCHASE_LOG_CONTRACT_ADDRESS],
    ["COPm", targetNetwork.tokens.copm.address],
    ["Squid router", "0xce16F69375520ab01377ce7B88f5BA8C48F8D666"],
    ["Logger", "0x1f4D4b2820670B8ce7cC4E709fa06fa783F029d2"],
  ];

  return (
    <main className="min-h-screen bg-[#FAFAF8] px-5 py-8 text-[#2B2D2F]">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/"
          className="text-xs font-bold uppercase text-[#808880] hover:text-[#0E7C4F]"
        >
          ← Back
        </Link>
        <h1 className="mt-6 text-5xl font-black uppercase leading-none">Stats</h1>
        <p className="mt-5 font-mono text-lg text-[#808880]">
          Live · refresh to update
        </p>

        <section className="mt-16">
          <h2 className="text-3xl font-black uppercase">Today</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <StatCard
              label="Swaps today"
              tone="bg-[#E1F1EA]"
              value={number(todayRows.length)}
            />
            <StatCard
              label="Volume today"
              tone="bg-[#EEF0FA]"
              value={money(
                getVolumeUsd(todayRows)
              )}
            />
            <StatCard
              label="Fees today"
              tone="bg-[#FBE6E8]"
              value={money(
                todayRows.reduce((sum, row) => sum + Number(row.fee_usd ?? 0), 0)
              )}
            />
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-3xl font-black uppercase">Economy</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <StatCard
              label="Volume"
              tone="bg-[#E1F1EA]"
              value={money(volumeUsd)}
              sub="token input"
            />
            <StatCard
              label="Integrator fees"
              tone="bg-[#FFF8BE]"
              value={money(feeUsd)}
              sub="reported by Squid"
            />
            <StatCard
              label="COPm delivered"
              tone="bg-[#FFEAC8]"
              value={number(copmReceived, 2)}
              sub="confirmed swaps"
            />
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-3xl font-black uppercase">On-chain</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <StatCard
              label="Completed swaps"
              tone="bg-[#E1F1EA]"
              value={number(completed.length)}
              sub={`${number(total)} intents · ${number(users)} active addresses`}
            />
            <StatCard
              label="Swap txs"
              tone="bg-[#EEF0FA]"
              value={number(txCount)}
              sub={`${number(multiToken)} multi-token swaps`}
            />
            <StatCard
              label="On-chain logs"
              tone="bg-[#FFEAC8]"
              value={number(logged.length)}
              sub="confirmed swaps recorded"
            />
            <StatCard
              label="WAU"
              tone="bg-[#FFF8BE]"
              value={number(wau)}
              sub="last 7 days"
            />
            <StatCard
              label="MAU"
              tone="bg-[#F0E4F1]"
              value={number(mau)}
              sub="last 30 days"
            />
            <StatCard
              label="Failed rate"
              tone="bg-[#FBE6E8]"
              value={percent(total ? (failed.length / total) * 100 : 0)}
              sub={`${number(failed.length)} failed intents`}
            />
          </div>
        </section>

        <section className="mt-16 rounded-[8px] border border-[#E6E6E2] bg-white p-7">
          <h2 className="text-2xl font-black uppercase">Transactions by token</h2>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-[#ECECE8] text-xs uppercase text-[#808880]">
                <tr>
                  <th className="py-3">Token</th>
                  <th className="py-3 text-right">Count</th>
                  <th className="py-3 text-right">Volume</th>
                  <th className="py-3 text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {tokenTable.map(([symbol, token]) => (
                  <tr key={symbol} className="border-b border-[#F0F0EC]">
                    <td className="py-4 text-lg">{symbol}</td>
                    <td className="py-4 text-right">{number(token.count)}</td>
                    <td className="py-4 text-right">{money(token.usd)}</td>
                    <td className="py-4 text-right text-[#808880]">
                      {percent(tokenTotalUsd ? (token.usd / tokenTotalUsd) * 100 : 0)}
                    </td>
                  </tr>
                ))}
                {tokenTable.length === 0 && (
                  <tr>
                    <td className="py-6 text-[#808880]" colSpan={4}>
                      No swaps logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 rounded-[8px] border border-[#E6E6E2] bg-white p-7">
          <h2 className="text-2xl font-black uppercase">Contracts</h2>
          <div className="mt-6 space-y-3">
            {contracts.map(([label, address]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 text-sm"
              >
                <span className="font-bold uppercase text-[#808880]">{label}</span>
                <span className="font-mono text-[#0E7C4F]">
                  {shortAddress(address)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-[8px] border border-[#E6E6E2] bg-white p-7">
          <h2 className="text-2xl font-black uppercase">Recent swaps</h2>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-[#ECECE8] text-xs uppercase text-[#808880]">
                <tr>
                  <th className="py-3">User</th>
                  <th className="py-3">Status</th>
                  <th className="py-3 text-right">Requested</th>
                  <th className="py-3 text-right">Received</th>
                  <th className="py-3 text-right">Fee</th>
                </tr>
              </thead>
              <tbody>
                {completed.slice(0, 10).map((row) => (
                  <tr key={row.intent_id} className="border-b border-[#F0F0EC]">
                    <td className="py-4 font-mono text-sm">
                      {shortAddress(row.user_address)}
                    </td>
                    <td className="py-4">confirmed</td>
                    <td className="py-4 text-right">{row.requested_copm}</td>
                    <td className="py-4 text-right">
                      {row.copm_received ? number(Number(row.copm_received), 2) : "-"}
                    </td>
                    <td className="py-4 text-right">
                      {row.fee_usd ? money(Number(row.fee_usd)) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
