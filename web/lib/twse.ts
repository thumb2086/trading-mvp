import { OHLCV } from "./types"

// Convert ROC date (113/03/01) to ISO (2024-03-01)
function rocToISO(roc: string): string {
  const parts = roc.split("/")
  if (parts.length !== 3) return roc
  const year = parseInt(parts[0]) + 1911
  return `${year}-${parts[1]}-${parts[2]}`
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}${m}${day}`
}

// Fetch one month of data from TWSE
async function fetchTWSEmonth(symbol: string, yearMonth: string): Promise<OHLCV[]> {
  const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${yearMonth}01&stockNo=${symbol}`
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  })
  const json = await res.json()
  if (json.stat !== "OK") return []
  const fields = json.fields as string[]
  const dateIdx = fields.indexOf("日期")
  const openIdx = fields.indexOf("開盤價")
  const highIdx = fields.indexOf("最高價")
  const lowIdx = fields.indexOf("最低價")
  const closeIdx = fields.indexOf("收盤價")
  const volIdx = fields.indexOf("成交股數")

  return (json.data as string[][]).map((row) => ({
    date: rocToISO(row[dateIdx]),
    open: parseFloat(row[openIdx]?.replace(/,/g, "") ?? "0"),
    high: parseFloat(row[highIdx]?.replace(/,/g, "") ?? "0"),
    low: parseFloat(row[lowIdx]?.replace(/,/g, "") ?? "0"),
    close: parseFloat(row[closeIdx]?.replace(/,/g, "") ?? "0"),
    volume: parseInt(row[volIdx]?.replace(/,/g, "") ?? "0"),
  }))
}

// Fetch one month of data from TPEx
async function fetchTPExMonth(symbol: string, year: number, month: number): Promise<OHLCV[]> {
  const ym = `${year}/${String(month).padStart(2, "0")}`
  const url = `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${ym}&stkno=${symbol}`
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  })
  const json = await res.json()
  if (!json?.aaData) return []
  const data = json.aaData as string[][]
  return data.map((row) => {
    // TPEx format: date, shares, shares_value, open, high, low, close, change, last_bid, last_ask
    // Row: ["113/03/01", "1,234,567", "123,456,789", "68.00", "69.00", "67.50", "68.50", "+1.00", "68.40", "68.60"]
    const date = rocToISO(row[0])
    const open = parseFloat(row[3]?.replace(/,/g, "") ?? "0")
    const high = parseFloat(row[4]?.replace(/,/g, "") ?? "0")
    const low = parseFloat(row[5]?.replace(/,/g, "") ?? "0")
    const close = parseFloat(row[6]?.replace(/,/g, "") ?? "0")
    const shares = parseInt(row[1]?.replace(/,/g, "") ?? "0")
    return { date, open, high, low, close, volume: shares }
  })
}

function monthRange(start: Date, end: Date): { y: number; m: number; ym: string }[] {
  const result: { y: number; m: number; ym: string }[] = []
  let d = new Date(start.getFullYear(), start.getMonth(), 1)
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1)
  while (d <= endMonth) {
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    result.push({ y, m, ym: `${y}${String(m).padStart(2, "0")}` })
    d.setMonth(d.getMonth() + 1)
  }
  return result
}

async function fetchTWSE(symbol: string, start: string, end: string): Promise<OHLCV[]> {
  const s = new Date(start)
  const e = new Date(end)
  const all: OHLCV[] = []
  for (const { ym } of monthRange(s, e)) {
    const data = await fetchTWSEmonth(symbol, ym)
    all.push(...data)
  }
  return all.sort((a, b) => a.date.localeCompare(b.date))
}

async function fetchTPEx(symbol: string, start: string, end: string): Promise<OHLCV[]> {
  const s = new Date(start)
  const e = new Date(end)
  const all: OHLCV[] = []
  for (const { y, m } of monthRange(s, e)) {
    const data = await fetchTPExMonth(symbol, y, m)
    all.push(...data)
  }
  return all.sort((a, b) => a.date.localeCompare(b.date))
}

// Cache for the session
const cache = new Map<string, { data: OHLCV[]; ts: number }>()
const CACHE_TTL = 600_000 // 10 min

export async function fetchTWStock(symbol: string, start: string, end: string): Promise<OHLCV[]> {
  const key = `${symbol}_${start}_${end}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  let data: OHLCV[] = []
  let error: string | null = null

  // Try TWSE first
  try { data = await fetchTWSE(symbol, start, end) } catch (e: any) { error = e.message }

  // If no data from TWSE, try TPEx
  if (data.length === 0) {
    try { data = await fetchTPEx(symbol, start, end) } catch { }
  }

  // Fallback to Yahoo Finance
  if (data.length === 0) {
    try {
      data = await fetchYahooFallback(symbol, start, end)
    } catch (e: any) {
      throw new Error(error || e.message || `No data for ${symbol}`)
    }
  }

  cache.set(key, { data, ts: Date.now() })
  return data
}

// Yahoo Finance as fallback
async function fetchYahooFallback(symbol: string, start: string, end: string): Promise<OHLCV[]> {
  const p1 = Math.floor(new Date(start).getTime() / 1000)
  const p2 = Math.floor(new Date(end).getTime() / 1000)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.TW?period1=${p1}&period2=${p2}&interval=1d`
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })
  const json = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error(`No Yahoo data for ${symbol}`)
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
