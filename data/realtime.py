"""Real-time market data layer for Taiwan & US stocks.

Supports TW (TWSE/TPEx MIS) and US (Yahoo) real-time quotes and recent OHLCV.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timedelta
from typing import Any, List

import pandas as pd
import requests
import yfinance as yf

TWSE_REALTIME_URL = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp"
TPEx_REALTIME_URL = "https://mis.tpex.org.tw/stock/api/getStockInfo.jsp"


def _safe_float(v):
    try:
        if v is None or v == "-" or v == "":
            return None
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _is_us_symbol(symbol: str) -> bool:
    # US symbols are alphabetic (possibly with .); TW symbols are 4-digit numeric
    s = symbol.strip().upper()
    return not s.isdigit()


def fetch_realtime_quote(symbol: str, market: str = "auto") -> dict[str, Any]:
    """Fetch latest quote for a stock (TW or US)."""
    symbol = symbol.strip().upper()
    if market == "auto":
        market = "US" if _is_us_symbol(symbol) else "TW"

    if market == "US":
        return _fetch_us_quote(symbol)
    return _fetch_tw_quote(symbol)


def _fetch_tw_quote(symbol: str) -> dict[str, Any]:
    for mkt in ("tse", "otc"):
        try:
            base = TWSE_REALTIME_URL if mkt == "tse" else TPEx_REALTIME_URL
            url = f"{base}?ex_ch={mkt}_{symbol}.tw&json=1&delay=0"
            r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=8)
            j = r.json()
            msg = (j.get("msgArray") or [None])[0]
            if msg:
                price = _safe_float(msg.get("z")) or _safe_float(msg.get("pz"))
                prev = _safe_float(msg.get("pz")) or _safe_float(msg.get("y"))
                change = (price - prev) / prev if price is not None and prev not in (None, 0) else None
                return {
                    "symbol": symbol, "name": msg.get("n") or msg.get("nf", ""),
                    "market": mkt.upper(), "price": price, "prev_close": prev,
                    "open": _safe_float(msg.get("o")), "high": _safe_float(msg.get("h")),
                    "low": _safe_float(msg.get("l")), "volume": _safe_float(msg.get("tv")),
                    "change_pct": round(change * 100, 2) if change is not None else None,
                    "source": "MIS", "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
                }
        except Exception:
            continue
    # fallback yfinance TW
    return _fetch_yf_quote(f"{symbol}.TW", symbol, "TW")


def _fetch_us_quote(symbol: str) -> dict[str, Any]:
    return _fetch_yf_quote(symbol, symbol, "US")


def _fetch_yf_quote(ticker_sym: str, symbol: str, market: str) -> dict[str, Any]:
    try:
        t = yf.Ticker(ticker_sym)
        info = t.info or {}
        price = info.get("regularMarketPrice") or info.get("currentPrice")
        prev = info.get("previousClose")
        change = (price - prev) / prev if price and prev else None
        return {
            "symbol": symbol, "name": info.get("shortName", ""),
            "market": market, "price": _safe_float(price), "prev_close": _safe_float(prev),
            "open": _safe_float(info.get("open")), "high": _safe_float(info.get("dayHigh")),
            "low": _safe_float(info.get("dayLow")), "volume": _safe_float(info.get("volume")),
            "change_pct": round(change * 100, 2) if change is not None else None,
            "source": "yfinance", "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
        }
    except Exception as e:
        return {"symbol": symbol, "error": str(e), "source": "none"}


def fetch_recent_ohlcv(symbol: str, days: int = 90, market: str = "auto") -> pd.DataFrame:
    """Fetch recent daily OHLCV (TW via yfinance .TW, US direct)."""
    symbol = symbol.strip().upper()
    if market == "auto":
        market = "US" if _is_us_symbol(symbol) else "TW"

    end = datetime.now()
    start = end - timedelta(days=days + 10)
    suffix = "" if market == "US" else ".TW"
    t = yf.Ticker(f"{symbol}{suffix}")
    df = t.history(start=start.strftime("%Y-%m-%d"), end=end.strftime("%Y-%m-%d"))
    if df.empty and market == "TW":
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


def fetch_batch_quotes(symbols: List[str], market: str = "auto") -> List[dict[str, Any]]:
    """Fetch quotes for multiple symbols."""
    out = []
    for s in symbols:
        out.append(fetch_realtime_quote(s, market))
    return out


if __name__ == "__main__":
    import sys
    sym = sys.argv[1] if len(sys.argv) > 1 else "2330"
    mkt = sys.argv[2] if len(sys.argv) > 2 else "auto"
    print(json.dumps(fetch_realtime_quote(sym, mkt), ensure_ascii=False, indent=2))
    df = fetch_recent_ohlcv(sym, 5, mkt)
    print(df.tail(2).to_string(index=False))
