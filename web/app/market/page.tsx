"use client"

import { useEffect, useState } from "react"

interface Q {
  symbol: string
  name: string
  market: string
  price: number | null
  change?: number | null
  change_pct?: number | null
  volume?: number | null
  source: string
  error?: string
}

export default function MarketPage() {
  const [market, setMarket] = useState("TW")
  const [limit, setLimit] = useState(50)
  const [quotes, setQuotes] = useState<Q[]>([])
  const [loading, setLoading] = useState(false)
  const [symbols, setSymbols] = useState("AAPL,MSFT,NVDA,TSLA,AMZN,GOOGL,META,AMD")

  const load = async () => {
    setLoading(true)
    try {
      const url = market === "US"
        ? `/api/quotes?market=US&symbols=${encodeURIComponent(symbols)}`
        : `/api/quotes?market=TW&limit=${limit}`
      const r = await fetch(url)
      const d = await r.json()
      setQuotes(d.quotes || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [market, limit])

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-sm font-bold">M</div>
            <div>
              <h1 className="font-bold">市場總覽</h1>
              <p className="text-xs text-gray-500">台股 / 美股 即時價格（自動更新）</p>
            </div>
          </div>
          <a href="/arena" className="text-xs text-purple-400 hover:underline">競技場 →</a>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">市場</label>
            <select className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none" value={market} onChange={e => setMarket(e.target.value)}>
              <option value="TW">台股</option>
              <option value="US">美股</option>
            </select>
          </div>
          {market === "TW" ? (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">顯示筆數</label>
              <select className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none" value={limit} onChange={e => setLimit(Number(e.target.value))}>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
          ) : (
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-gray-500 mb-1 block">股票代號 (逗號分隔)</label>
              <input className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm w-full outline-none" value={symbols} onChange={e => setSymbols(e.target.value)} />
            </div>
          )}
          <button onClick={load} disabled={loading} className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-green-600 hover:bg-green-500 disabled:opacity-50 transition">
            {loading ? "更新中..." : "重新整理"}
          </button>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">報價列表</h2>
            <span className="text-xs text-gray-500">{quotes.length} 筆</span>
          </div>
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-900">
                <tr className="border-b border-gray-800 text-gray-500 text-xs">
                  <th className="text-left p-3">代號</th>
                  <th className="text-left p-3">名稱</th>
                  <th className="text-right p-3">價格</th>
                  <th className="text-right p-3">漲跌%</th>
                  <th className="text-right p-3">成交量</th>
                  <th className="text-left p-3">來源</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q, i) => (
                  <tr key={q.symbol + i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="p-3 font-mono">{q.symbol}</td>
                    <td className="p-3">{q.name}</td>
                    <td className="text-right p-3 font-mono">{q.price?.toFixed(2) ?? "-"}</td>
                    <td className={`text-right p-3 font-mono ${ (q.change_pct ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {q.change_pct !== undefined && q.change_pct !== null ? `${q.change_pct.toFixed(2)}%` : (q.change !== undefined && q.change !== null ? q.change : "-")}
                    </td>
                    <td className="text-right p-3 font-mono">{q.volume?.toLocaleString() ?? "-"}</td>
                    <td className="p-3 text-xs text-gray-500">{q.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  )
}
