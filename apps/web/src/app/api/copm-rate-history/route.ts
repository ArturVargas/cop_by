import { NextRequest, NextResponse } from "next/server";

const validIntervals = ["1h", "1d", "1w", "1m", "1y", "5y", "max"] as const;
type RateInterval = (typeof validIntervals)[number];

const intervalConfig: Record<
  RateInterval,
  { daysBack: number; points: number; revalidate: number }
> = {
  "1h": { daysBack: 1, points: 2, revalidate: 60 * 60 },
  "1d": { daysBack: 1, points: 2, revalidate: 60 * 60 },
  "1w": { daysBack: 7, points: 8, revalidate: 60 * 60 },
  "1m": { daysBack: 30, points: 16, revalidate: 12 * 60 * 60 },
  "1y": { daysBack: 365, points: 24, revalidate: 24 * 60 * 60 },
  "5y": { daysBack: 365 * 5, points: 36, revalidate: 24 * 60 * 60 },
  max: { daysBack: 365 * 10, points: 48, revalidate: 24 * 60 * 60 },
};

function isRateInterval(value: string | null): value is RateInterval {
  return validIntervals.includes(value as RateInterval);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getSampleDates(daysBack: number, points: number) {
  const today = new Date();
  const start = addDays(today, -daysBack);
  const step = daysBack / Math.max(points - 1, 1);

  return Array.from({ length: points }, (_, index) => {
    if (index === points - 1) return "latest";
    return formatDate(addDays(start, Math.round(index * step)));
  }).filter((date, index, dates) => dates.indexOf(date) === index);
}

async function fetchUsdCopRate(date: string) {
  const baseUrl =
    date === "latest"
      ? "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
      : `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.json`;
  const response = await fetch(baseUrl, {
    next: { revalidate: date === "latest" ? 60 * 60 : 24 * 60 * 60 },
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    date?: string;
    usd?: {
      cop?: number;
    };
  };
  const copPerUsd = data.usd?.cop;
  if (!copPerUsd || !Number.isFinite(copPerUsd)) return null;

  return {
    timestamp: new Date(`${data.date ?? date}T00:00:00.000Z`).getTime(),
    copPerUsd,
  };
}

export async function GET(request: NextRequest) {
  const intervalParam = request.nextUrl.searchParams.get("interval");
  const interval = isRateInterval(intervalParam) ? intervalParam : "1d";
  const config = intervalConfig[interval];
  const dates = getSampleDates(config.daysBack, config.points);
  const pointsByTimestamp = new Map<number, { timestamp: number; copPerUsd: number }>();
  (await Promise.all(dates.map((date) => fetchUsdCopRate(date))))
    .filter((point): point is { timestamp: number; copPerUsd: number } =>
      Boolean(point)
    )
    .forEach((point) => {
      pointsByTimestamp.set(point.timestamp, point);
    });
  const points = Array.from(pointsByTimestamp.values()).sort(
    (a, b) => a.timestamp - b.timestamp
  );

  if (!points.length) {
    return NextResponse.json(
      { error: "USD/COP history unavailable" },
      { status: 502 }
    );
  }
  if (points.length === 1) {
    points.unshift({
      ...points[0],
      timestamp: points[0].timestamp - config.daysBack * 24 * 60 * 60 * 1000,
    });
  }

  return NextResponse.json(
    {
      interval,
      points,
    },
    {
      headers: {
        "Cache-Control": `s-maxage=${config.revalidate}, stale-while-revalidate=${config.revalidate}`,
      },
    }
  );
}
