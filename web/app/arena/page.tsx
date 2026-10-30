"use client"

import { useEffect, useState } from "react"

interface Quote {
  symbol: string
  name: string
  price: number | null
  prev_close: number | null
  open: number | null
  high: number | null
  low: number | null
  volume: number | null
  change_pct: number | null
  source: string
  as_of: string
  error?: string
}

interface ArenaRow {
  name: string
  strategy_type?: string
  total_return?: number
  sharpe?: number
  max_drawdown?: number
  trades?: number
  error?: string
}

interface ArenaData {
  ok?: boolean
  symbol: string
  period?: { start: string; end: string; days: number }
  quote?: Quote
  fixed?: ArenaRow[]
  jev?: any
  latest_fixed_signals?: Record<string, number>
  latest_jev_action?: string
  latest_jev_confidence?: number
  latest_jev_details?: any
  stdout?: string
  error?: string
}

const signalLabel = (s: number) => (s === 1 ? "買進" : s === -1 ? "賣出" : "持有")

export default function ArenaPage() {
  const [symbol, setSymbol] = useState("2330")
  const [input, setInput] = useState("2330")
  const [days, setDays] = useState(60)
  const [heuristic, setHeuristic] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [quote, setQuote] = useState<Quote | null>(null)
  const [arena, setArena] = useState<ArenaData | null>(null)

  const fetchQuote = async (sym: string) => {
    try {
      const r = await fetch(`/api/quote?symbol=${sym}`)
      const d = await r.json()
      setQuote(d)
    } catch (e: any) {
      setQuote({ symbol: sym, name: "", price: null, prev_close: null, open: null, high: null, low: null, volume: null, change_pct: null, source: "none", as_of: "", error: String(e) })
    }
  }

  const runArena = async (sym: string) => {
    setLoading(true)
    setError("")
    setArena(null)
    try {
      const r = await fetch(`/api/arena?symbol=${sym}&days=${days}&heuristic=${heuristic}`)
      const d = await r.json()
      if (d.error) throw new Error(d.error + (d.stderr ? "\n" + d.stderr : ""))
      setArena(d)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQuote(symbol)
  }, [symbol])

  const submit = () => {
    const s = input.trim() || "2330"
    setSymbol(s)
    runArena(s)
  }

  const rows: ArenaRow[] = []
  if (arena) {
    if (arena.fixed) rows.push(...arena.fixed)
    if (arena.jev) rows.push({
      name: "JEV_Decision",
      strategy_type: "jev",
      total_return: arena.jev.total_return,
      sharpe: arena.jev.sharpe,
      max_drawdown: arena.jev.max_drawdown,
      trades: arena.jev.trades,
    })
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center text-sm font-bold">A</div>
            <div>
              <h1 className="font-bold">決策競技場 Arena</h1>
              <p className="text-xs text-gray-500">即時股市資料 × 多決策模型競技</p>
            </div>
          </div>
          <a href="/" className="text-xs text-blue-400 hover:underline">返回儀表板</a>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Controls */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">股票代號</label>
            <input
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm w-32 outline-none focus:border-purple-500"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit() }}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">回測天數</label>
            <select className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none" value={days} onChange={e => setDays(Number(e.target.value))}>
              <option value={30}>30 天</option>
              <option value={60}>60 天</option>
              <option value={90}>90 天</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" checked={heuristic} onChange={e => setHeuristic(e.target.checked)} />
            Heuristic (無 LLM)
          </label>
          <button
            onClick={submit}
            disabled={loading}
            className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 transition"
          >
            {loading ? "執行中..." : "執行競技"}
          </button>
          <button
            onClick={() => fetchQuote(symbol)}
            className="px-4 py-2 rounded-lg text-sm border border-gray-700 bg-gray-800 hover:bg-gray-700 transition"
          >
            重新整理報價
          </button>
        </div>

        {/* Realtime Quote */}
        {quote && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-300">即時報價</h2>
              <span className="text-xs text-gray-500">{quote.source} · {quote.as_of}</span>
            </div>
            {quote.error ? (
              <div className="text-red-400 text-sm">{quote.error}</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div>
                  <div className="text-xs text-gray-500">股票</div>
                  <div className="text-lg font-bold">{quote.symbol} {quote.name}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">現價</div>
                  <div className="text-lg font-bold">${quote.price?.toFixed(2) ?? "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">漲跌%</div>
                  <div className={`text-lg font-bold ${ (quote.change_pct ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {quote.change_pct !== null ? `${quote.change_pct.toFixed(2)}%` : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">開盤</div>
                  <div className="text-sm">{quote.open?.toFixed(2) ?? "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">最高 / 最低</div>
                  <div className="text-sm">{quote.high?.toFixed(2) ?? "-"} / {quote.low?.toFixed(2) ?? "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">成交量</div>
                  <div className="text-sm">{quote.volume?.toLocaleString() ?? "-"}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full" />
            <span className="ml-3 text-gray-400">執行競技中，可能需 10–60 秒...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-sm text-red-300 whitespace-pre-wrap">
            {error}
          </div>
        )}

        {arena && !loading && (
          <>
            {/* JEV Decision */}
            {arena.latest_jev_action && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
                <h2 className="text-sm font-semibold text-gray-300 mb-3">JEV 決策模型</h2>
                <div className="flex flex-wrap gap-6 items-center">
                  <div className="text-3xl font-bold text-purple-400">{arena.latest_jev_action}</div>
                  <div className="text-sm text-gray-400">
                    信心度: <span className="text-gray-200 font-mono">{(arena.latest_jev_confidence ?? 0).toFixed(3)}</span>
                  </div>
                  {arena.jev && (
                    <>
                      <div className="text-sm text-gray-400">回測報酬: <span className={arena.jev.total_return >= 0 ? "text-green-400" : "text-red-400"}>{(arena.jev.total_return * 100).toFixed(2)}%</span></div>
                      <div className="text-sm text-gray-400">Sharpe: <span className="text-gray-200 font-mono">{arena.jev.sharpe?.toFixed(2)}</span></div>
                      <div className="text-sm text-gray-400">MDD: <span className="text-red-400 font-mono">{(arena.jev.max_drawdown * 100).toFixed(2)}%</span></div>
                      <div className="text-sm text-gray-400">交易: <span className="text-gray-200 font-mono">{arena.jev.trades}</span></div>
                    </>
                  )}
                </div>
                {arena.latest_jev_details && (
                  <pre className="mt-3 text-xs text-gray-500 bg-gray-950/50 rounded p-2 overflow-x-auto">
                    {JSON.stringify(arena.latest_jev_details, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* Period */}
            {arena.period && (
              <div className="text-xs text-gray-500 mb-3">
                期間: {arena.period.start} ~ {arena.period.end}（{arena.period.days} 根 K 線）
              </div>
            )}

            {/* Table */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-gray-800">
                <h2 className="text-sm font-semibold text-gray-300">模型比較</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-500 text-xs">
                      <th className="text-left p-3">模型</th>
                      <th className="text-left p-3">類型</th>
                      <th className="text-right p-3">報酬</th>
                      <th className="text-right p-3">Sharpe</th>
                      <th className="text-right p-3">MDD</th>
                      <th className="text-right p-3">交易</th>
                      <th className="text-center p-3">最新訊號</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const sig = arena.latest_fixed_signals?.[r.name] ?? (r.name === "JEV_Decision" ? null : 0)
                      return (
                        <tr key={r.name + i} className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${r.name === "JEV_Decision" ? "bg-purple-900/10" : ""}`}>
                          <td className="p-3 font-medium">{r.name}</td>
                          <td className="p-3 text-xs text-gray-400">{r.strategy_type ?? "-"}</td>
                          <td className={`text-right p-3 font-mono ${ (r.total_return ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {r.error ? "ERR" : `${((r.total_return ?? 0) * 100).toFixed(2)}%`}
                          </td>
                          <td className="text-right p-3 font-mono">{r.error ? "-" : (r.sharpe ?? 0).toFixed(2)}</td>
                          <td className="text-right p-3 font-mono text-red-400">{r.error ? "-" : `${((r.max_drawdown ?? 0) * 100).toFixed(2)}%`}</td>
                          <td className="text-right p-3 font-mono">{r.error ? "-" : r.trades ?? 0}</td>
                          <td className="text-center p-3">
                            {r.name === "JEV_Decision" ? (
                              <span className="text-purple-400 font-mono">{arena.latest_jev_action}</span>
                            ) : (
                              <span className={sig === 1 ? "text-green-400" : sig === -1 ? "text-red-400" : "text-gray-400"}>
                                {signalLabel(sig ?? 0)}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
