import { NextResponse } from "next/server";

export const revalidate = 60;

export async function GET() {
  const apiKey = process.env.COIN_GECKO_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing CoinGecko API key" },
      { status: 500 }
    );
  }

  const response = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,usd-coin&vs_currencies=usd,cop&include_24hr_change=true",
    {
      headers: {
        "x-cg-demo-api-key": apiKey,
      },
      next: { revalidate },
    }
  );

  if (!response.ok) {
    return NextResponse.json({ error: "CoinGecko unavailable" }, { status: 502 });
  }

  const data = (await response.json()) as {
    bitcoin?: { usd?: number };
    ethereum?: { usd?: number };
    "usd-coin"?: { cop?: number; cop_24h_change?: number };
  };

  return NextResponse.json({
    COP_PER_USD: data["usd-coin"]?.cop,
    COP_PER_USD_24H_CHANGE: data["usd-coin"]?.cop_24h_change,
    ETH: data.ethereum?.usd,
    WBTC: data.bitcoin?.usd,
  });
}
