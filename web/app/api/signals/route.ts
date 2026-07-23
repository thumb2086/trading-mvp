import { NextResponse } from "next/server"
import { fetchTWStock } from "../../../lib/data"
import { runAllStrategies } from "../../../lib/simulator"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol") || "2330"
  const days = parseInt(searchParams.get("days") || "180")

  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)

  try {
    const data = await fetchTWStock(symbol, start.toISOString().split("T")[0], end.toISOString().split("T")[0])
    if (data.length < 30) {
      return NextResponse.json({ error: "Insufficient data" }, { status: 400 })
    }

    const results = runAllStrategies(data)
    const best = results.reduce((a, b) => a.sharpe > b.sharpe ? a : b)
    const latestPrice = data[data.length - 1]

    const priceHistory = data.map(d => ({
      date: d.date, close: d.close, volume: d.volume,
      ma10: null as number | null, ma20: null as number | null,
      ma60: null as number | null, ma120: null as number | null,
      ma240: null as number | null,
    }))
    const maPeriods = [10, 20, 60, 120, 240]
    for (let i = 0; i < priceHistory.length; i++) {
      for (const p of maPeriods) {
        if (i >= p - 1) {
          let s = 0
          for (let j = i - p + 1; j <= i; j++) s += priceHistory[j].close
          ;(priceHistory[i] as any)[`ma${p}`] = s / p
        }
      }
    }

    const sorted = results.sort((a, b) => b.sharpe - a.sharpe)

    return NextResponse.json({
      symbol,
      date: latestPrice.date,
      price: latestPrice.close,
      initialCapital: 1_000_000,
      priceHistory,
      strategies: sorted,
      best: sorted[0],
      bestTrades: sorted[0].tradesList.slice(-20),
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
