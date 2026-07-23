import { NextResponse } from "next/server"
import { fetchTWStock } from "../../../lib/data"
import { runAllStrategies, backtest } from "../../../lib/simulator"
import { getStrategySignal, getStrategyNames, STRATEGY_NAMES_CN } from "../../../lib/strategies"
import { OHLCV } from "../../../lib/types"

export const runtime = "nodejs"
export const maxDuration = 60

// Simple expression-based strategy: parse and evaluate
function evalExpr(expr: string, data: OHLCV[]): number[] {
  const c = data.map(d => d.close)
  const h = data.map(d => d.high)
  const l = data.map(d => d.low)
  const v = data.map(d => d.volume)
  const n = c.length
  const result = new Array(n).fill(0)
  // Support: sma(X, N), div(X,Y), gt(X,Y), lt(X,Y), mul(X,Y), const
  const sma = (arr: number[], p: number) => {
    const r = new Array(n).fill(0)
    for (let i = p - 1; i < n; i++) {
      let s = 0; for (let j = i - p + 1; j <= i; j++) s += arr[j]
      r[i] = s / p
    }
    return r
  }
  // Very simple parser: just a few hardcoded templates for demo evolution
  // Template: sma(div(X, Y), N) > const
  const match = expr.match(/sma\(div\((\w+),\s*(\w+)\),\s*([\d.]+)\)\s*[><]\s*([\d.]+)/)
  if (match) {
    const x = match[1] === "close" ? c : match[1] === "high" ? h : match[1] === "low" ? l : v
    const y = match[2] === "close" ? c : match[2] === "high" ? h : match[2] === "low" ? l : v
    const period = Math.max(2, Math.round(parseFloat(match[3])))
    const thresh = parseFloat(match[4])
    const ratio = sma(x.map((_, i) => x[i] / Math.max(y[i], 0.01)), period)
    const op = expr.includes(">") ? "gt" : "lt"
    for (let i = 0; i < n; i++) {
      result[i] = op === "gt" ? (ratio[i] > thresh ? 1 : 0) : (ratio[i] < thresh ? -1 : 0)
    }
  }
  // Fallback: momentum
  if (!match) {
    const p = Math.max(5, Math.floor(Math.random() * 20))
    for (let i = p; i < n; i++) {
      result[i] = c[i] > c[i - p] ? 1 : -1
    }
  }
  return result
}

function mutate(expr: string): string {
  // Change threshold ±20%
  const newThresh = (parseFloat(expr.match(/[><]\s*([\d.]+)/)?.[1] ?? "0") || 1) * (0.8 + Math.random() * 0.4)
  const newPeriod = Math.max(2, Math.round((parseFloat(expr.match(/sma\(div\(\w+,\s*\w+\),\s*([\d.]+)\)/)?.[1] ?? "10") || 10) * (0.5 + Math.random())))
  return expr
    .replace(/[><]\s*[\d.]+/, Math.random() > 0.5 ? `> ${newThresh.toFixed(3)}` : `< ${newThresh.toFixed(3)}`)
    .replace(/sma\(div\(\w+,\s*\w+\),\s*[\d.]+\)/, `sma(div(high, close), ${newPeriod})`)
}

function crossover(a: string, b: string): string {
  return Math.random() > 0.5 ? a : b
}

async function runEvolution(symbol: string, data: OHLCV[]) {
  let population: string[] = [
    "sma(div(high, close), 10) > 0.028",
    "sma(div(close, low), 15) > 1.02",
    "sma(div(high, close), 5) < 0.015",
    "sma(div(volume, close), 20) > 0.5",
    "sma(div(close, open), 10) > 1.01",
  ]

  const evaluate = (expr: string) => {
    const signals = evalExpr(expr, data)
    const stats = backtest(data, expr, signals)
    return stats.sharpe - 0.3 * Math.abs(stats.maxDrawdown)
  }

  // Simple 3-generation evolution
  for (let gen = 0; gen < 3; gen++) {
    const scored = population.map(e => ({ expr: e, fitness: evaluate(e) })).sort((a, b) => b.fitness - a.fitness)
    const elites = scored.slice(0, 2).map(s => s.expr)
    const next: string[] = [...elites]
    while (next.length < 5) {
      if (Math.random() > 0.5) {
        next.push(mutate(elites[0]))
      } else {
        next.push(crossover(elites[0], elites[Math.min(1, elites.length - 1)]))
      }
    }
    population = next
  }

  const best = population.map(e => ({ expr: e, fitness: evaluate(e) })).sort((a, b) => b.fitness - a.fitness)[0]
  return best
}

export async function GET() {
  try {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 180)

    const data = await fetchTWStock("2330", start.toISOString().split("T")[0], end.toISOString().split("T")[0])
    const fixed = runAllStrategies(data)
    const bestFixed = fixed.sort((a, b) => b.sharpe - a.sharpe)[0]

    const evolved = await runEvolution("2330", data)
    const evolvedSignals = evalExpr(evolved.expr, data)
    const evolvedStats = backtest(data, evolved.expr, evolvedSignals)

    return NextResponse.json({
      ok: true,
      date: new Date().toISOString().split("T")[0],
      bestFixed: { name: bestFixed.name, sharpe: bestFixed.sharpe, return: bestFixed.totalReturn },
      evolved: { expr: evolved.expr, sharpe: evolvedStats.sharpe, return: evolvedStats.totalReturn, fitness: evolved.fitness },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
