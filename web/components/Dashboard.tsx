"use client"

import { useEffect, useState } from "react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart, Area } from "recharts"
import { COMMON_STOCKS, SECTORS, searchStocks } from "../lib/stocks"
import { STRATEGY_NAMES_CN } from "../lib/strategies"

interface StrategyResult {
  name: string
  totalReturn: number
  sharpe: number
  maxDrawdown: number
  trades: number
  currentSignal: { name: string; signal: number }
}

interface PricePoint {
  date: string
  close: number
  volume: number
  ma10: number | null
  ma20: number | null
  ma60: number | null
  ma120: number | null
  ma240: number | null
}

interface Data {
  symbol: string
  date: string
  price: number
  initialCapital: number
  priceHistory: PricePoint[]
  strategies: StrategyResult[]
  best: StrategyResult
  bestTrades: any[]
}

const cn = (name: string) => STRATEGY_NAMES_CN[name] ?? name

const signalLabel = (s: number) =>
  s === 1 ? "做多" : s === -1 ? "放空" : "持有"
const signalEmoji = (s: number) =>
  s === 1 ? "🟢" : s === -1 ? "🔴" : "⚪"
const signalColor = (s: number) =>
  s === 1 ? "text-green-400" : s === -1 ? "text-red-400" : "text-gray-400"
const signalBg = (s: number) =>
  s === 1 ? "bg-green-900/30 border-green-700/50" : s === -1 ? "bg-red-900/30 border-red-700/50" : "bg-gray-800/50 border-gray-700/50"

export default function Dashboard() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [symbol, setSymbol] = useState("2330")
  const [search, setSearch] = useState("")
  const [selectedSector, setSelectedSector] = useState("")
  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string; sector: string }[]>([])
  const [compareData, setCompareData] = useState<{ symbol: string; name: string; sharpe: number; ret: number; acc: string }[]>([])
  const [tradeSide, setTradeSide] = useState<"做多" | "做空">("做多")
  const [tradeQty, setTradeQty] = useState("")
  const [tradeLever, setTradeLever] = useState(2)

  const fetchData = async (sym: string) => {
    setLoading(true)
    setError("")
    try {
      const r = await fetch(`/api/signals?symbol=${sym}&days=180`)
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setData(d)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData(symbol) }, [symbol])

  // Load common stocks on mount
  useEffect(() => { setSearchResults(COMMON_STOCKS) }, [])

  // Auto-add current stock to compare when data loads
  useEffect(() => {
    if (!data) return
      setCompareData(prev => {
        const exists = prev.find(c => c.symbol === symbol)
        if (exists) return prev
        const info = COMMON_STOCKS.find(s => s.symbol === symbol) ?? { name: symbol }
      return [...prev, {
        symbol,
        name: info?.name ?? symbol,
        sharpe: data.best.sharpe,
        ret: data.best.totalReturn,
        acc: `${(data.best.totalReturn * 100).toFixed(1)}%`,
      }]
    })
  }, [data?.best.sharpe])

  const removeCompare = (sym: string) => {
    setCompareData(prev => prev.filter(c => c.symbol !== sym))
  }

  useEffect(() => {
    const delay = setTimeout(async () => {
      const results = await searchStocks(search, selectedSector)
      setSearchResults(results)
    }, 200)
    return () => clearTimeout(delay)
  }, [search, selectedSector])

  const stockInfo = COMMON_STOCKS.find(s => s.symbol === symbol)

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-sm font-bold">T</div>
            <div>
              <h1 className="font-bold">台股策略儀表板</h1>
              <p className="text-xs text-gray-500">多策略回測 • 每日開盤即時更新</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="/market" className="text-xs text-green-400 hover:underline">市場總覽 →</a>
            <a href="/arena" className="text-xs text-purple-400 hover:underline">決策競技場 →</a>
            <span className="text-xs text-gray-500">
              {data ? `${data.date} 收盤價` : "—"}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Stock Selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="md:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">選擇股票</label>
            <div className="flex gap-2">
              <input
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm flex-1 outline-none focus:border-blue-500"
                placeholder="搜尋代號或名稱…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <select
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none"
                value={selectedSector}
                onChange={e => setSelectedSector(e.target.value)}
              >
                <option value="">全部產業</option>
                {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2 max-h-28 overflow-y-auto">
              {searchResults.slice(0, 60).map(s => (
                <button
                  key={s.symbol}
                  onClick={() => { setSymbol(s.symbol); setSearch("") }}
                  className={`px-2.5 py-1 rounded text-xs border transition ${symbol === s.symbol ? "bg-blue-600 border-blue-500 text-white" : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500"}`}
                >
                  {s.symbol} {s.name}
                </button>
              ))}
              {searchResults.length === 0 && !search && (
                <span className="text-xs text-gray-500 self-center">輸入代號或名稱搜尋全部台股</span>
              )}
              {searchResults.length > 60 && (
                <span className="text-xs text-gray-500 self-center">+{searchResults.length - 60} 檔</span>
              )}
            </div>
          </div>

          {/* Price Card */}
          {data && (
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl border border-gray-800 p-4 flex flex-col justify-center">
              <div className="text-xs text-gray-500 mb-1">
                {stockInfo?.sector} • {stockInfo?.name}
              </div>
              <div className="text-3xl font-bold mb-1">
                ${data.price.toFixed(0)}
              </div>
              <div className="flex gap-4 text-xs text-gray-400">
                <span>最佳夏普: {data.best.sharpe.toFixed(2)}</span>
                <span className={data.best.totalReturn >= 0 ? "text-green-400" : "text-red-400"}>
                  {(data.best.totalReturn * 100).toFixed(1)}%
                </span>
                <span>初始資金: ${(data.initialCapital ?? 1_000_000).toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-32">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {data && !loading && (
          <>
            {/* Price Chart */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-300">📈 股價走勢</h2>
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block"></span> 收盤價</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-400 inline-block"></span> MA10</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-yellow-500 inline-block"></span> MA20 月線</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-purple-500 inline-block"></span> MA60 季線</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-pink-500 inline-block"></span> MA120 半年線</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-gray-400 inline-block"></span> MA240 年線</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={data.priceHistory}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#666" }}
                    tickFormatter={(v: string) => v.slice(5)}
                    interval={Math.floor(data.priceHistory.length / 6)}
                  />
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#666" }} orientation="right" />
                  <Tooltip
                    contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: "8px", fontSize: "12px" }}
                    labelFormatter={(label: any) => `日期: ${label}`}
                    formatter={(value: any) => [Number(value).toFixed(0), ""]}
                  />
                  <Area type="monotone" dataKey="close" fill="#3b82f6" fillOpacity={0.08} stroke="#3b82f6" strokeWidth={2} dot={false} name="收盤價" />
                  <Line type="monotone" dataKey="ma10" stroke="#f97316" strokeWidth={1} dot={false} name="MA10" />
                  <Line type="monotone" dataKey="ma20" stroke="#eab308" strokeWidth={1.5} dot={false} name="MA20" />
                  <Line type="monotone" dataKey="ma60" stroke="#a855f7" strokeWidth={1.5} dot={false} name="MA60" />
                  <Line type="monotone" dataKey="ma120" stroke="#ec4899" strokeWidth={1} strokeDasharray="4 2" dot={false} name="MA120" />
                  <Line type="monotone" dataKey="ma240" stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 2" dot={false} name="MA240" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Signal Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              {["做多", "放空", "持有"].map(label => {
                const sigVal = label === "做多" ? 1 : label === "放空" ? -1 : 0
                const count = data.strategies.filter(s => s.currentSignal.signal === sigVal).length
                return (
                  <div key={label} className={`rounded-xl border p-3 ${signalBg(sigVal)}`}>
                    <div className="text-xs text-gray-400">{label}</div>
                    <div className="text-xl font-bold">{count}</div>
                    <div className="text-xs text-gray-500">個策略</div>
                  </div>
                )
              })}
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
                <div className="text-xs text-gray-400">總策略</div>
                <div className="text-xl font-bold">{data.strategies.length}</div>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
                <div className="text-xs text-gray-400">收盤價</div>
                <div className="text-xl font-bold">${data.price.toFixed(0)}</div>
                <div className="text-xs text-gray-500">{data.date}</div>
              </div>
            </div>

            {/* ⚡ 槓桿交易面板 */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
              <h2 className="text-sm font-semibold text-gray-300 mb-3">⚡ 槓桿</h2>
              <div className="flex flex-wrap items-center gap-3">
                {/* 方向 */}
                <select
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none"
                  value={tradeSide}
                  onChange={e => setTradeSide(e.target.value as "做多" | "做空")}
                >
                  <option value="做多">做多</option>
                  <option value="做空">做空</option>
                </select>
                {/* 數量 */}
                <div className="relative">
                  <input
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none w-32"
                    placeholder="數量"
                    type="number"
                    min="1"
                    value={tradeQty}
                    onChange={e => setTradeQty(e.target.value)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">股</span>
                </div>
                {/* 槓桿倍數 */}
                <select
                  className="bg-gray-800 border border-green-700 rounded-lg px-3 py-2 text-sm outline-none text-green-400 font-mono"
                  value={tradeLever}
                  onChange={e => setTradeLever(Number(e.target.value))}
                >
                  <option value={1}>1X</option>
                  <option value={2}>2X</option>
                  <option value={3}>3X</option>
                  <option value={5}>5X</option>
                  <option value={10}>10X</option>
                </select>
                {/* 開倉按鈕 */}
                <button
                  className={`px-5 py-2 rounded-lg text-sm font-bold text-white transition ${
                    tradeSide === "做多"
                      ? "bg-green-600 hover:bg-green-500"
                      : "bg-red-600 hover:bg-red-500"
                  }`}
                  onClick={() => {
                    if (!tradeQty || Number(tradeQty) <= 0) return
                    const qty = Number(tradeQty)
                    const lever = tradeLever
                    const notional = qty * data.price
                    const margin = notional / lever
                    alert(
                      `${tradeSide} ${qty} 股 ${data.symbol} (${stockInfo?.name})\n` +
                      `價格: $${data.price.toFixed(0)}\n` +
                      `名目金額: $${notional.toLocaleString()}\n` +
                      `槓桿: ${lever}X\n` +
                      `保證金: $${margin.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    )
                  }}
                >
                  開
                </button>
              </div>
              {/* 預估資訊 */}
              {tradeQty && Number(tradeQty) > 0 && data.price > 0 && (
                <div className="mt-3 flex gap-6 text-xs text-gray-500">
                  <span>名目: ${(Number(tradeQty) * data.price).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  <span>保證金: ${(Number(tradeQty) * data.price / tradeLever).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  <span className={tradeSide === "做多" ? "text-green-400" : "text-red-400"}>
                    {tradeSide} {tradeLever}X 槓桿
                  </span>
                </div>
              )}
            </div>

            {/* Sharpe Chart */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
              <h2 className="text-sm font-semibold text-gray-300 mb-3">📊 夏普值排名</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.strategies.slice(0, 15)} layout="vertical">
                  <XAxis type="number" domain={[0, "auto"]} stroke="#555" />
                  <YAxis dataKey="name" type="category" width={150} stroke="#555" fontSize={11} />
                  <Tooltip
                    contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: "8px" }}
                    formatter={(value: any) => [Number(value).toFixed(2), "夏普值"]}
                  />
                  <Bar dataKey="sharpe" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Strategy Table */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-300">📋 策略回測結果</h2>
                <span className="text-xs text-gray-500">180 日回測</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-500 text-xs">
                      <th className="text-left p-3">策略</th>
                      <th className="text-right p-3">夏普值</th>
                      <th className="text-right p-3">報酬率</th>
                      <th className="text-right p-3">最大回撤</th>
                      <th className="text-right p-3">交易</th>
                      <th className="text-center p-3">目前訊號</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.strategies.map((s, i) => (
                      <tr key={s.name} className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition ${i === 0 ? "bg-blue-900/10" : ""}`}>
                        <td className="p-3 font-medium text-sm">
                          {i === 0 && <span className="text-xs text-blue-400 mr-1">👑</span>}
                          {cn(s.name)}
                        </td>
                        <td className="text-right p-3 font-mono">{s.sharpe.toFixed(2)}</td>
                        <td className={`text-right p-3 font-mono ${s.totalReturn >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {(s.totalReturn * 100).toFixed(1)}%
                        </td>
                        <td className="text-right p-3 font-mono text-red-400">{(s.maxDrawdown * 100).toFixed(1)}%</td>
                        <td className="text-right p-3 font-mono">{s.trades}</td>
                        <td className="text-center p-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${signalColor(s.currentSignal.signal)} bg-gray-800/50`}>
                            {signalEmoji(s.currentSignal.signal)} {signalLabel(s.currentSignal.signal)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Trade Records for Best Strategy */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-300">📝 最佳策略交易紀錄 ({cn(data.best.name)})</h2>
                <span className="text-xs text-gray-500">最近 20 筆</span>
              </div>
              {data.bestTrades && data.bestTrades.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 text-gray-500 text-xs">
                        <th className="text-left p-2">方向</th>
                        <th className="text-right p-2">進場日</th>
                        <th className="text-right p-2">進場價</th>
                        <th className="text-right p-2">出場日</th>
                        <th className="text-right p-2">出場價</th>
                        <th className="text-right p-2">損益</th>
                        <th className="text-right p-2">報酬率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bestTrades.slice().reverse().map((t: any, i: number) => (
                        <tr key={i} className="border-b border-gray-800/30 hover:bg-gray-800/30">
                          <td className={`p-2 ${t.side === "做多" ? "text-green-400" : "text-red-400"}`}>{t.side}</td>
                          <td className="text-right p-2 font-mono text-xs">{t.entryDate}</td>
                          <td className="text-right p-2 font-mono">${t.entryPrice.toFixed(0)}</td>
                          <td className="text-right p-2 font-mono text-xs">{t.exitDate}</td>
                          <td className="text-right p-2 font-mono">${t.exitPrice.toFixed(0)}</td>
                          <td className={`text-right p-2 font-mono ${t.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(0)}
                          </td>
                          <td className={`text-right p-2 font-mono ${t.pnlPercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {(t.pnlPercent * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-6 text-gray-600 text-sm">無交易紀錄</div>
              )}
            </div>

            {/* Multi-stock Comparison */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-300">📈 跨股比較</h2>
                <div className="flex flex-wrap gap-1">
                  {["0050", "0056", "00878", "00919", "00929"].map(sym => {
                    const info = COMMON_STOCKS.find(s => s.symbol === sym)
                    const inCompare = compareData.some(c => c.symbol === sym)
                    return (
                      <button
                        key={sym}
                        onClick={() => {
                          if (inCompare) removeCompare(sym)
                          else fetch(`/api/signals?symbol=${sym}&days=180`)
                            .then(r => r.json())
                            .then(d => {
                              if (d.error) return
                              setCompareData(prev => [...prev, { symbol: sym, name: info?.name ?? sym, sharpe: d.best.sharpe, ret: d.best.totalReturn, acc: `${(d.best.totalReturn * 100).toFixed(1)}%` }])
                            })
                        }}
                        className={`px-2 py-1 rounded text-xs border transition ${inCompare ? "bg-green-900/40 border-green-700 text-green-300" : "border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-300"}`}
                      >
                        {inCompare ? "✓" : "+"} {info?.name ?? sym}
                      </button>
                    )
                  })}
                  {compareData.length > 0 && (
                    <button onClick={() => setCompareData([])} className="px-2 py-1 rounded text-xs border border-red-900 bg-red-900/20 text-red-400 hover:bg-red-900/40 transition">
                      ✕ 清除
                    </button>
                  )}
                </div>
              </div>
              {compareData.length > 1 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={compareData} layout="vertical">
                      <XAxis type="number" domain={[0, "auto"]} stroke="#555" />
                      <YAxis dataKey="name" type="category" width={80} stroke="#555" fontSize={11} />
                      <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: "8px" }} />
                      <Bar dataKey="sharpe" fill="#10b981" radius={[0, 4, 4, 0]} name="夏普值" />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                    {compareData.map(c => (
                      <div key={c.symbol} className="bg-gray-800/50 rounded-lg p-2 text-xs flex justify-between items-center">
                        <div>
                          <div className="text-gray-300 font-medium">{c.name}</div>
                          <div className="text-gray-500">{c.symbol}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-green-400">{c.acc}</div>
                          <div className="text-gray-400">夏普 {c.sharpe.toFixed(2)}</div>
                        </div>
                        <button onClick={() => removeCompare(c.symbol)} className="text-gray-600 hover:text-red-400 ml-1">✕</button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-6 text-gray-600 text-sm">
                  目前顯示: {compareData[0]?.name ?? "—"}　　點擊上方 ETF 按鈕加入比較
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
