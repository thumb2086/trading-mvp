"""Real-time market data layer for Taiwan stocks (TWSE/TPEx official open APIs + yfinance fallback).

Designed to be importable by both the Python backtest engine and the arena runner.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timedelta
from typing import Any

import pandas as pd
import requests
import yfinance as yf

TWSE_QUOTE_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_AVG_ALL"  # daily avg
TWSE_REALTIME_URL = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp"
TPEx_REALTIME_URL = "https://mis.tpex.org.tw/stock/api/getStockInfo.jsp"


def _safe_float(v):
    try:
        if v is None or v == "-" or v == "":
            return None
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def fetch_realtime_quote(symbol: str) -> dict[str, Any]:
    """Fetch the latest quote for a single Taiwan stock.

    Uses TWSE/TPEx MIS real-time endpoint first, falls back to yfinance.
    """
    symbol = symbol.strip().upper()
    # TWSE MIS: ex_ch=tse_2330.tw or otc_...
    for market in ("tse", "otc"):
        try:
            ex_ch = f"{market}_{symbol}.tw"
            url = f"{TWSE_REALTIME_URL if market == 'tse' else TPEx_REALTIME_URL}?ex_ch={ex_ch}&json=1&delay=0"
            r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=8)
            j = r.json()
            msg = j.get("msgArray") or []
            if msg:
                m = msg[0]
                price = _safe_float(m.get("z")) or _safe_float(m.get("pz"))  # z=current, pz=prev close
                prev = _safe_float(m.get("pz")) or _safe_float(m.get("y"))  # y=yesterday close
                vol = _safe_float(m.get("tv"))  # today volume
                high = _safe_float(m.get("h"))
                low = _safe_float(m.get("l"))
                open_ = _safe_float(m.get("o"))
                name = m.get("n") or m.get("nf", "")
                change = None
                if price is not None and prev is not None and prev != 0:
                    change = (price - prev) / prev
                return {
                    "symbol": symbol,
                    "name": name,
                    "market": market.upper(),
                    "price": price,
                    "prev_close": prev,
                    "open": open_,
                    "high": high,
                    "low": low,
                    "volume": vol,
                    "change_pct": round(change * 100, 2) if change is not None else None,
                    "source": "MIS",
                    "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
                }
        except Exception:
            continue

    # Fallback: yfinance
    try:
        t = yf.Ticker(f"{symbol}.TW")
        info = t.info or {}
        price = info.get("regularMarketPrice") or info.get("currentPrice")
        prev = info.get("previousClose")
        change = (price - prev) / prev if price and prev else None
        return {
            "symbol": symbol,
            "name": info.get("shortName", ""),
            "market": "TW",
            "price": _safe_float(price),
            "prev_close": _safe_float(prev),
            "open": _safe_float(info.get("open")),
            "high": _safe_float(info.get("dayHigh")),
            "low": _safe_float(info.get("dayLow")),
            "volume": _safe_float(info.get("volume")),
            "change_pct": round(change * 100, 2) if change is not None else None,
            "source": "yfinance",
            "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
        }
    except Exception as e:
        return {"symbol": symbol, "error": str(e), "source": "none"}


def fetch_recent_ohlcv(symbol: str, days: int = 90) -> pd.DataFrame:
    """Fetch recent daily OHLCV via yfinance (cached by caller if needed)."""
    end = datetime.now()
    start = end - timedelta(days=days + 10)
    t = yf.Ticker(f"{symbol}.TW")
    df = t.history(start=start.strftime("%Y-%m-%d"), end=end.strftime("%Y-%m-%d"))
    if df.empty:
        # try TPEx suffix
        t = yf.Ticker(f"{symbol}.TWO")
        df = t.history(start=start.strftime("%Y-%m-%d"), end=end.strftime("%Y-%m-%d"))
    if df.empty:
        return pd.DataFrame()
    df.columns = [c.lower() for c in df.columns]
    df.index.name = "date"
    df = df.reset_index()
    df["symbol"] = symbol
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    return df[["date", "open", "high", "low", "close", "volume"]]


def fetch_all_twse_quotes(limit: int = 200) -> list[dict[str, Any]]:
    """Fetch latest close for many stocks via TWSE daily ALL endpoint (not true real-time, daily)."""
    try:
        r = requests.get("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
                         headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
        data = r.json()
        out = []
        for row in data[:limit]:
            out.append({
                "symbol": str(row.get("Code", "")).strip(),
                "name": row.get("Name", ""),
                "close": _safe_float(row.get("ClosingPrice")),
                "change": _safe_float(row.get("Change")),
                "volume": _safe_float(row.get("TradeVolume")),
            })
        return out
    except Exception as e:
        return [{"error": str(e)}]


if __name__ == "__main__":
    import sys
    sym = sys.argv[1] if len(sys.argv) > 1 else "2330"
    print(json.dumps(fetch_realtime_quote(sym), ensure_ascii=False, indent=2))
    df = fetch_recent_ohlcv(sym, 10)
    print(df.tail(3).to_string(index=False))
