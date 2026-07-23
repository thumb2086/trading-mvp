import { OHLCV, StrategyResult, SignalResult } from "./types"
import { getStrategyNames, getStrategySignal, getLatestSignal, STRATEGY_NAMES_CN } from "./strategies"

const COMMISSION_RATE = 0.001425
const COMMISSION_MIN = 20
const TAX_RATE = 0.003

export interface TradeRecord {
  side: "做多" | "放空"
  entryDate: string
  entryPrice: number
  exitDate: string
  exitPrice: number
  pnl: number
  pnlPercent: number
}

export function backtest(data: OHLCV[], name: string, signals: number[]): StrategyResult & { tradesList: TradeRecord[] } {
  const initialCapital = 1_000_000
  let capital = initialCapital
  let position = 0
  let trades = 0
  const equityCurve: number[] = []
  const tradesList: TradeRecord[] = []
  let entryDate = ""
  let entryPrice = 0

  for (let i = 0; i < data.length; i++) {
    const sig = signals[i]
    const price = data[i].close
    const date = data[i].date

    if (sig === 1 && position <= 0) {
      if (position < 0) {
        // cover short
        const proceeds = Math.abs(position) * price
        const commission = Math.max(proceeds * COMMISSION_RATE, COMMISSION_MIN)
        const tax = proceeds * TAX_RATE
        const pnl = (entryPrice - price) * Math.abs(position) - commission - tax
        tradesList.push({ side: "放空", entryDate, entryPrice, exitDate: date, exitPrice: price, pnl, pnlPercent: (entryPrice - price) / entryPrice })
        capital += proceeds - commission - tax
        position = 0
        trades++
      }
      const shares = Math.floor(capital * 0.95 / price)
      const cost = shares * price
      const commission = Math.max(cost * COMMISSION_RATE, COMMISSION_MIN)
      const tax = cost * TAX_RATE
      if (totalCost(cost, commission, tax) <= capital) {
        capital -= cost + commission + tax
        position = shares
        entryDate = date
        entryPrice = price
        trades++
      }
    } else if (sig === -1 && position >= 0) {
      if (position > 0) {
        const proceeds = position * price
        const commission = Math.max(proceeds * COMMISSION_RATE, COMMISSION_MIN)
        const tax = proceeds * TAX_RATE
        const pnl = (price - entryPrice) * position - commission - tax
        tradesList.push({ side: "做多", entryDate, entryPrice, exitDate: date, exitPrice: price, pnl, pnlPercent: (price - entryPrice) / entryPrice })
        capital += proceeds - commission - tax
        position = 0
        trades++
      }
      // short not implemented for simplicity
    } else if (sig === 0 && position > 0) {
      // hold, do nothing
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
    tradesList,
  }
}

function totalCost(cost: number, commission: number, tax: number) {
  return cost + commission + tax
}

export function runAllStrategies(data: OHLCV[]): (StrategyResult & { tradesList: TradeRecord[] })[] {
  const names = getStrategyNames()
  return names.map(name => {
    const signals = getStrategySignal(name, data)
    return backtest(data, name, signals)
  })
}
