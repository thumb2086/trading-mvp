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
      date: d.date,
      close: d.close,
      volume: d.volume,
      ma20: null as number | null,
      ma60: null as number | null,
    }))
    // compute MAs
    for (let i = 0; i < priceHistory.length; i++) {
      if (i >= 19) {
        let s = 0
        for (let j = i - 19; j <= i; j++) s += priceHistory[j].close
        priceHistory[i].ma20 = s / 20
      }
      if (i >= 59) {
        let s = 0
        for (let j = i - 59; j <= i; j++) s += priceHistory[j].close
        priceHistory[i].ma60 = s / 60
      }
    }

    return NextResponse.json({
      symbol,
      date: latestPrice.date,
      price: latestPrice.close,
      priceHistory,
      strategies: results.sort((a, b) => b.sharpe - a.sharpe),
      best,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
