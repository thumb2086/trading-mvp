import { NextResponse } from "next/server"

export const runtime = "nodejs"

function safeNum(v: any): number | null {
  if (v === null || v === undefined || v === "" || v === "-") return null
  const n = Number(String(v).replace(/,/g, ""))
  return isNaN(n) ? null : n
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get("symbol") || "2330").trim().toUpperCase()
  const market = (searchParams.get("market") || "auto").toUpperCase()
  const isUS = market === "US" || (market === "AUTO" && !/^\d{4}$/.test(symbol))

  if (isUS) {
    // US path via Yahoo
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) })
      const j = await res.json()
      const r = j?.chart?.result?.[0]
      const meta = r?.meta
      const price = meta?.regularMarketPrice ?? null
      const prev = meta?.previousClose ?? null
      const change = price !== null && prev !== null && prev !== 0 ? (price - prev) / prev : null
      return NextResponse.json({
        symbol, name: meta?.shortName || "", market: "US", price, prev_close: prev,
        open: meta?.regularMarketDayHigh ?? null, high: meta?.regularMarketDayHigh ?? null,
        low: meta?.regularMarketDayLow ?? null, volume: meta?.regularMarketVolume ?? null,
        change_pct: change !== null ? Math.round(change * 10000) / 100 : null,
        source: "yahoo", as_of: new Date().toISOString(),
      })
    } catch (e: any) {
      return NextResponse.json({ symbol, error: String(e), source: "none" }, { status: 500 })
    }
  }

  // Try TWSE MIS then TPEx MIS
  for (const market of ["tse", "otc"]) {
    const base = market === "tse" ? "https://mis.twse.com.tw/stock/api/getStockInfo.jsp" : "https://mis.tpex.org.tw/stock/api/getStockInfo.jsp"
    const url = `${base}?ex_ch=${market}_${symbol}.tw&json=1&delay=0`
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) })
      const j = await res.json()
      const msg = j?.msgArray?.[0]
      if (msg) {
        const price = safeNum(msg.z) ?? safeNum(msg.pz)
        const prev = safeNum(msg.pz) ?? safeNum(msg.y)
        const change = price !== null && prev !== null && prev !== 0 ? (price - prev) / prev : null
        return NextResponse.json({
          symbol,
          name: msg.n || msg.nf || "",
          market: market.toUpperCase(),
          price,
          prev_close: prev,
          open: safeNum(msg.o),
          high: safeNum(msg.h),
          low: safeNum(msg.l),
          volume: safeNum(msg.tv),
          change_pct: change !== null ? Math.round(change * 10000) / 100 : null,
          source: "MIS",
          as_of: new Date().toISOString(),
        })
      }
    } catch {}
  }

  // Fallback Yahoo
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.TW?interval=1d&range=5d`
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) })
    const j = await res.json()
    const r = j?.chart?.result?.[0]
    const meta = r?.meta
    const price = meta?.regularMarketPrice ?? null
    const prev = meta?.previousClose ?? null
    const change = price !== null && prev !== null && prev !== 0 ? (price - prev) / prev : null
    return NextResponse.json({
      symbol,
      name: meta?.shortName || "",
      market: "TW",
      price,
      prev_close: prev,
      open: meta?.regularMarketDayHigh ?? null,
      high: meta?.regularMarketDayHigh ?? null,
      low: meta?.regularMarketDayLow ?? null,
      volume: meta?.regularMarketVolume ?? null,
      change_pct: change !== null ? Math.round(change * 10000) / 100 : null,
      source: "yahoo",
      as_of: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json({ symbol, error: String(e), source: "none" }, { status: 500 })
  }
}
