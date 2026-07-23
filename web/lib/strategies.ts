import { OHLCV, SignalResult } from "./types"

function sma(values: number[], period: number): number[] {
  const result: number[] = []
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { result.push(NaN); continue }
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += values[j]
    result.push(sum / period)
  }
  return result
}

function ema(values: number[], period: number): number[] {
  const result: number[] = []
  const k = 2 / (period + 1)
  for (let i = 0; i < values.length; i++) {
    if (i === 0) { result.push(values[0]); continue }
    result.push(values[i] * k + result[i - 1] * (1 - k))
  }
  return result
}

function rsi(values: number[], period = 14): number[] {
  const result: number[] = []
  for (let i = 0; i < values.length; i++) {
    if (i < period) { result.push(NaN); continue }
    let gain = 0, loss = 0
    for (let j = i - period + 1; j <= i; j++) {
      const diff = values[j] - values[j - 1]
      if (diff > 0) gain += diff; else loss -= diff
    }
    const avgGain = gain / period, avgLoss = loss / period
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    result.push(100 - 100 / (1 + rs))
  }
  return result
}

function macd(values: number[]): { macd: number[]; signal: number[] } {
  const e12 = ema(values, 12)
  const e26 = ema(values, 26)
  const m = e12.map((v, i) => v - e26[i])
  const sig = ema(m, 9)
  return { macd: m, signal: sig }
}

function crossOver(a: number[], b: number[], i: number): boolean {
  if (i < 1) return false
  return a[i] > b[i] && a[i - 1] <= b[i - 1]
}

function crossUnder(a: number[], b: number[], i: number): boolean {
  if (i < 1) return false
  return a[i] < b[i] && a[i - 1] >= b[i - 1]
}

type StrategyFn = (data: OHLCV[]) => number[]

export const STRATEGY_NAMES_CN: Record<string, string> = {
  "SMA_Cross_5_20": "SMA交叉(5,20)",
  "SMA_Cross_10_30": "SMA交叉(10,30)",
  "EMA_Cross_5_20": "EMA交叉(5,20)",
  "RSI": "RSI超買超賣",
  "MACD_Cross": "MACD交叉",
  "Bollinger_Breakout": "布林通道突破",
  "Momentum": "動量策略",
  "Mean_Reversion": "均值回歸",
  "Donchian_Breakout": "唐奇安通道突破",
  "Volume_Confirmation": "量價確認",
  "Triple_SMA": "三均線多空",
  "Parabolic_SAR": "拋物線SAR",
}

const strategies: Record<string, { fn: StrategyFn; params: string }> = {}

function strat(name: string, params: string, fn: StrategyFn) {
  strategies[name] = { fn, params }
}

strat("SMA_Cross_5_20", "fast=5, slow=20", (d) => {
  const c = d.map(x => x.close)
  const sFast = sma(c, 5), sSlow = sma(c, 20)
  const sig = new Array(c.length).fill(0)
  for (let i = 1; i < c.length; i++) {
    if (crossOver(sFast, sSlow, i)) sig[i] = 1
    if (crossUnder(sFast, sSlow, i)) sig[i] = -1
  }
  return sig
})

strat("SMA_Cross_10_30", "fast=10, slow=30", (d) => {
  const c = d.map(x => x.close)
  const sFast = sma(c, 10), sSlow = sma(c, 30)
  const sig = new Array(c.length).fill(0)
  for (let i = 1; i < c.length; i++) {
    if (crossOver(sFast, sSlow, i)) sig[i] = 1
    if (crossUnder(sFast, sSlow, i)) sig[i] = -1
  }
  return sig
})

strat("EMA_Cross_5_20", "fast=5, slow=20", (d) => {
  const c = d.map(x => x.close)
  const eFast = ema(c, 5), eSlow = ema(c, 20)
  const sig = new Array(c.length).fill(0)
  for (let i = 1; i < c.length; i++) {
    if (crossOver(eFast, eSlow, i)) sig[i] = 1
    if (crossUnder(eFast, eSlow, i)) sig[i] = -1
  }
  return sig
})

strat("RSI", "period=14, overbought=70, oversold=30", (d) => {
  const c = d.map(x => x.close)
  const r = rsi(c, 14)
  const sig = new Array(c.length).fill(0)
  for (let i = 1; i < c.length; i++) {
    if (r[i] !== undefined && r[i - 1] !== undefined) {
      if (r[i] < 30 && r[i - 1] >= 30) sig[i] = 1
      if (r[i] > 70 && r[i - 1] <= 70) sig[i] = -1
    }
  }
  return sig
})

strat("MACD_Cross", "fast=12, slow=26, signal=9", (d) => {
  const c = d.map(x => x.close)
  const { macd: m, signal: s } = macd(c)
  const sig = new Array(c.length).fill(0)
  for (let i = 1; i < c.length; i++) {
    if (crossOver(m, s, i)) sig[i] = 1
    if (crossUnder(m, s, i)) sig[i] = -1
  }
  return sig
})

strat("Bollinger_Breakout", "period=20, std=2", (d) => {
  const c = d.map(x => x.close)
  const ma = sma(c, 20)
  const sig = new Array(c.length).fill(0)
  for (let i = 0; i < c.length; i++) {
    if (i < 20) continue
    const sq = c.slice(i - 19, i + 1).reduce((s, v) => s + (v - ma[i]) ** 2, 0) / 20
    const sd = Math.sqrt(sq)
    const upper = ma[i] + 2 * sd, lower = ma[i] - 2 * sd
    if (c[i] > upper && c[i - 1] <= upper) sig[i] = -1
    if (c[i] < lower && c[i - 1] >= lower) sig[i] = 1
  }
  return sig
})

strat("Momentum", "period=10, threshold=0.02", (d) => {
  const c = d.map(x => x.close)
  const sig = new Array(c.length).fill(0)
  for (let i = 10; i < c.length; i++) {
    const mom = (c[i] - c[i - 10]) / c[i - 10]
    if (mom > 0.02) sig[i] = 1
    if (mom < -0.02) sig[i] = -1
  }
  return sig
})

strat("Mean_Reversion", "period=20, threshold=2", (d) => {
  const c = d.map(x => x.close)
  const ma = sma(c, 20)
  const sig = new Array(c.length).fill(0)
  for (let i = 20; i < c.length; i++) {
    const sq = c.slice(i - 19, i + 1).reduce((s, v) => s + (v - ma[i]) ** 2, 0) / 20
    const sd = Math.sqrt(sq)
    const z = sd === 0 ? 0 : (c[i] - ma[i]) / sd
    if (z < -2) sig[i] = 1
    if (z > 2) sig[i] = -1
  }
  return sig
})

strat("Donchian_Breakout", "period=20", (d) => {
  const h = d.map(x => x.high), l = d.map(x => x.low), c = d.map(x => x.close)
  const sig = new Array(c.length).fill(0)
  for (let i = 20; i < c.length; i++) {
    const hi = Math.max(...h.slice(i - 19, i + 1))
    const lo = Math.min(...l.slice(i - 19, i + 1))
    if (c[i] > hi) sig[i] = 1
    if (c[i] < lo) sig[i] = -1
  }
  return sig
})

strat("Volume_Confirmation", "ma=10, vol_ma=20", (d) => {
  const c = d.map(x => x.close), v = d.map(x => x.volume)
  const ma = sma(c, 10), volMa = sma(v, 20)
  const sig = new Array(c.length).fill(0)
  for (let i = 20; i < c.length; i++) {
    if (c[i] > ma[i] && v[i] > volMa[i] * 1.5) sig[i] = 1
    if (c[i] < ma[i] && v[i] > volMa[i] * 1.5) sig[i] = -1
  }
  return sig
})

strat("Triple_SMA", "short=5, mid=10, long=20", (d) => {
  const c = d.map(x => x.close)
  const s5 = sma(c, 5), s10 = sma(c, 10), s20 = sma(c, 20)
  const sig = new Array(c.length).fill(0)
  for (let i = 0; i < c.length; i++) {
    if (s5[i] > s10[i] && s10[i] > s20[i]) sig[i] = 1
    if (s5[i] < s10[i] && s10[i] < s20[i]) sig[i] = -1
  }
  return sig
})

strat("Parabolic_SAR", "accel=0.02, max=0.2", (d) => {
  const h = d.map(x => x.high), l = d.map(x => x.low), c = d.map(x => x.close)
  const n = c.length
  const sig = new Array(n).fill(0)
  let sar = l[0], ep = h[0], af = 0.02, trend = 1
  for (let i = 1; i < n; i++) {
    if (trend === 1) {
      sar = sar + af * (ep - sar)
      sar = Math.min(sar, l[i - 1], i >= 2 ? l[i - 2] : l[i - 1])
      if (l[i] < sar) { trend = -1; sar = ep; ep = l[i]; af = 0.02; sig[i] = -1 }
      else { ep = Math.max(ep, h[i]); if (h[i] > ep) af = Math.min(af + 0.02, 0.2) }
    } else {
      sar = sar - af * (sar - ep)
      sar = Math.max(sar, h[i - 1], i >= 2 ? h[i - 2] : h[i - 1])
      if (h[i] > sar) { trend = 1; sar = ep; ep = h[i]; af = 0.02; sig[i] = 1 }
      else { ep = Math.min(ep, l[i]); if (l[i] < ep) af = Math.min(af + 0.02, 0.2) }
    }
  }
  return sig
})

export function getStrategyNames(): string[] {
  return Object.keys(strategies)
}

export function getStrategySignal(name: string, data: OHLCV[]): number[] {
  return strategies[name]?.fn(data) ?? new Array(data.length).fill(0)
}

export function getLatestSignal(name: string, data: OHLCV[]): SignalResult {
  const signals = getStrategySignal(name, data)
  const latest = signals[signals.length - 1] ?? 0
  return { name, signal: latest }
}
