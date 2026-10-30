import { NextResponse } from "next/server"

export const runtime = "nodejs"

async function fetchTWBatch(limit: number) {
  const res = await fetch("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", {
    headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000),
  })
  const data = await res.json()
  if (!Array.isArray(data)) return []
  return data.slice(0, limit).map((r: any) => ({
    symbol: String(r.Code).padStart(4, "0"),
    name: r.Name || "",
    market: "TW",
    price: Number(String(r.ClosingPrice).replace(/,/g, "")) || null,
    change: Number(String(r.Change).replace(/,/g, "")) || null,
    volume: Number(String(r.TradeVolume).replace(/,/g, "")) || null,
    source: "TWSE-DAILY",
    as_of: new Date().toISOString(),
  }))
}

async function fetchUSOne(sym: string) {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`, {
      headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000),
    })
    const j = await res.json()
    const meta = j?.chart?.result?.[0]?.meta
    const price = meta?.regularMarketPrice ?? null
    const prev = meta?.previousClose ?? null
    const change = price !== null && prev !== null && prev !== 0 ? (price - prev) / prev : null
    return {
      symbol: sym, name: meta?.shortName || "", market: "US", price, prev_close: prev,
      change_pct: change !== null ? Math.round(change * 10000) / 100 : null,
      volume: meta?.regularMarketVolume ?? null, source: "yahoo", as_of: new Date().toISOString(),
    }
  } catch (e: any) {
    return { symbol: sym, error: String(e), source: "none" }
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const market = (searchParams.get("market") || "TW").toUpperCase()
  const limit = parseInt(searchParams.get("limit") || "100")
  const symbols = (searchParams.get("symbols") || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean)

  try {
    if (market === "US") {
      const list = symbols.length ? symbols : ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "AMD", "INTC", "NFLX"]
      const results = await Promise.all(list.map(fetchUSOne))
      return NextResponse.json({ market: "US", count: results.length, quotes: results, as_of: new Date().toISOString() })
    }
    // TW batch
    const quotes = await fetchTWBatch(limit)
    return NextResponse.json({ market: "TW", count: quotes.length, quotes, as_of: new Date().toISOString() })
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
