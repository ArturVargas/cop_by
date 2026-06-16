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
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd",
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
  };

  return NextResponse.json({
    ETH: data.ethereum?.usd,
    WBTC: data.bitcoin?.usd,
  });
}
