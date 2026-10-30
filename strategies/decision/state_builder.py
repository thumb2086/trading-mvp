"""State document builder for a single stock's recent market data."""
from __future__ import annotations

import numpy as np
import pandas as pd


def _rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def build_state_document(symbol: str, df: pd.DataFrame, name: str = "") -> str:
    """Build a compact state document (like JEV's state) from recent OHLCV."""
    if df.empty:
        return f"FOCUS TICKER: {symbol}\nNo data available."

    close = df["close"]
    last = df.iloc[-1]
    first = df.iloc[0]
    ret_total = (last["close"] - first["close"]) / first["close"] if first["close"] else 0

    rsi14 = _rsi(close, 14).iloc[-1]
    sma5 = close.rolling(5).mean().iloc[-1]
    sma20 = close.rolling(20).mean().iloc[-1]
    vol_ma20 = df["volume"].rolling(20).mean().iloc[-1]
    avg_vol = df["volume"].mean()

    # multi-horizon returns
    def horizon_ret(n):
        if len(close) <= n:
            return None
        return (close.iloc[-1] - close.iloc[-n]) / close.iloc[-n]

    r1 = horizon_ret(1)
    r5 = horizon_ret(5)
    r20 = horizon_ret(20)

    lines = [
        f"FOCUS TICKER: {symbol} — {name}",
        f"Latest date: {last['date']}",
        f"Price: {last['close']:.2f} | Open: {last['open']:.2f} | High: {last['high']:.2f} | Low: {last['low']:.2f}",
        f"Volume: {int(last['volume'])} (20d avg vol: {vol_ma20:.0f})",
        f"Returns: 1D { (r1*100 if r1 is not None else 0):.2f}% | 5D {(r5*100 if r5 is not None else 0):.2f}% | 20D {(r20*100 if r20 is not None else 0):.2f}% | period total {ret_total*100:.2f}%",
        f"Indicators: RSI14={rsi14:.1f} | SMA5={sma5:.2f} | SMA20={sma20:.2f} | price vs SMA20 = {(last['close']/sma20-1)*100:.2f}%",
        f"Volatility (20d std of close): {close.rolling(20).std().iloc[-1]:.2f}",
        f"Period range: {df['low'].min():.2f} ~ {df['high'].max():.2f} (n={len(df)} bars)",
    ]
    return "\n".join(lines)
