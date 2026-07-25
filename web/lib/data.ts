import { OHLCV } from "./types"
import { fetchTWStock as twseFetch } from "./twse"

export async function fetchTWStock(symbol: string, start: string, end: string): Promise<OHLCV[]> {
  return twseFetch(symbol, start, end)
}

export async function fetchLatestPrice(symbol: string): Promise<{ price: number; change: number }> {
  try {
    const data = await twseFetch(symbol, new Date(Date.now() - 86400000 * 10).toISOString().split("T")[0], new Date().toISOString().split("T")[0])
    if (data.length === 0) return { price: 0, change: 0 }
    const last = data[data.length - 1]
    const prev = data.length > 1 ? data[data.length - 2] : last
    return {
      price: last.close,
      change: prev.close > 0 ? (last.close - prev.close) / prev.close : 0,
    }
  } catch {
    return { price: 0, change: 0 }
  }
}
