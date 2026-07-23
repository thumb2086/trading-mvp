import { OHLCV } from "./types"

// Use Yahoo Finance public API directly (no npm dependency)
const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"

export async function fetchTWStock(symbol: string, start: string, end: string): Promise<OHLCV[]> {
  const p1 = Math.floor(new Date(start).getTime() / 1000)
  const p2 = Math.floor(new Date(end).getTime() / 1000)
  const url = `${YAHOO_BASE}/${symbol}.TW?period1=${p1}&period2=${p2}&interval=1d`
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  })
  const json = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error(`No data for ${symbol}`)

  const timestamps: number[] = result.timestamp
  const quotes = result.indicators?.quote?.[0]
  const adjclose = result.indicators?.adjclose?.[0]?.adjclose

  return timestamps.map((t, i) => ({
    date: new Date(t * 1000).toISOString().split("T")[0],
    open: quotes?.open?.[i] ?? 0,
    high: quotes?.high?.[i] ?? 0,
    low: quotes?.low?.[i] ?? 0,
    close: adjclose?.[i] ?? quotes?.close?.[i] ?? 0,
    volume: quotes?.volume?.[i] ?? 0,
  }))
}

export async function fetchLatestPrice(symbol: string): Promise<{ price: number; change: number }> {
  const p2 = Math.floor(Date.now() / 1000)
  const p1 = p2 - 86400 * 5
  const url = `${YAHOO_BASE}/${symbol}.TW?period1=${p1}&period2=${p2}&interval=1d`
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  })
  const json = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) return { price: 0, change: 0 }
  const quotes = result.indicators?.quote?.[0]
  const closes = quotes?.close?.filter((c: number | null) => c !== null) ?? []
  const opens = quotes?.open?.filter((c: number | null) => c !== null) ?? []
  const lastClose = closes[closes.length - 1] ?? 0
  const lastOpen = opens[opens.length - 1] ?? 0
  return {
    price: lastClose,
    change: lastOpen > 0 ? (lastClose - lastOpen) / lastOpen : 0,
  }
}
