import { OHLCV, StrategyResult, SignalResult } from "./types"
import { getStrategyNames, getStrategySignal, getLatestSignal, STRATEGY_NAMES_CN } from "./strategies"

const COMMISSION_RATE = 0.001425
const COMMISSION_MIN = 20
const TAX_RATE = 0.003

export function backtest(data: OHLCV[], name: string, signals: number[]): StrategyResult {
  const initialCapital = 1_000_000
  let capital = initialCapital
  let position = 0
  let trades = 0
  const equityCurve: number[] = []

  for (let i = 0; i < data.length; i++) {
    const sig = signals[i]
    const price = data[i].close

    if (sig === 1 && position <= 0) {
      const shares = Math.floor(capital * 0.95 / price)
      const cost = shares * price
      const commission = Math.max(cost * COMMISSION_RATE, COMMISSION_MIN)
      const tax = cost * TAX_RATE
      const totalCost = cost + commission + tax
      if (totalCost <= capital) {
        capital -= totalCost
        position = shares
        trades++
      }
    } else if (sig === -1 && position >= 0) {
      if (position > 0) {
        const proceeds = position * price
        const commission = Math.max(proceeds * COMMISSION_RATE, COMMISSION_MIN)
        const tax = proceeds * TAX_RATE
        capital += proceeds - commission - tax
        position = 0
        trades++
      }
    }
    equityCurve.push(capital + position * price)
  }

  const totalReturn = (equityCurve[equityCurve.length - 1] - initialCapital) / initialCapital
  const returns: number[] = []
  for (let i = 1; i < equityCurve.length; i++) {
    returns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1])
  }
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length
  const stdReturn = Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / returns.length)
  const sharpe = stdReturn === 0 ? 0 : Math.sqrt(252) * avgReturn / stdReturn

  let peak = equityCurve[0]
  let maxDD = 0
  for (const eq of equityCurve) {
    if (eq > peak) peak = eq
    const dd = (eq - peak) / peak
    if (dd < maxDD) maxDD = dd
  }

  const currentSignal = getLatestSignal(name, data)

  return {
    name,
    totalReturn,
    sharpe,
    maxDrawdown: maxDD,
    trades,
    currentSignal,
  }
}

export function runAllStrategies(data: OHLCV[]): StrategyResult[] {
  const names = getStrategyNames()
  return names.map(name => {
    const signals = getStrategySignal(name, data)
    return backtest(data, name, signals)
  })
}
