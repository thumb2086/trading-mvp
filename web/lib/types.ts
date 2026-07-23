export interface OHLCV {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface SignalResult {
  name: string
  signal: number // 1=LONG, -1=SHORT, 0=HOLD
  reason?: string
}

export interface StrategyResult {
  name: string
  totalReturn: number
  sharpe: number
  maxDrawdown: number
  trades: number
  currentSignal: SignalResult
}

export interface SimulationResult {
  symbol: string
  date: string
  strategies: StrategyResult[]
  gpBest: StrategyResult | null
}

export interface OHLCVData {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}
