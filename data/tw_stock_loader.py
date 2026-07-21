import pandas as pd
import yfinance as yf
import os

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache")


def ensure_cache():
    os.makedirs(CACHE_DIR, exist_ok=True)


def load_stock(symbol: str, start: str, end: str,
               use_cache: bool = True) -> pd.DataFrame:
    ensure_cache()
    tw_symbol = f"{symbol}.TW"
    cache_path = os.path.join(CACHE_DIR, f"{tw_symbol}_{start}_{end}.parquet")

    if use_cache and os.path.exists(cache_path):
        return pd.read_parquet(cache_path)

    ticker = yf.Ticker(tw_symbol)
    df = ticker.history(start=start, end=end)
    if df.empty:
        raise ValueError(f"No data for {tw_symbol} ({start}~{end})")

    df.columns = [c.lower() for c in df.columns]
    df.index.name = "date"
    df = df.reset_index()
    df["symbol"] = symbol

    if use_cache:
        df.to_parquet(cache_path)
    return df


def load_multiple(symbols: list[str], start: str, end: str,
                  use_cache: bool = True) -> dict[str, pd.DataFrame]:
    return {s: load_stock(s, start, end, use_cache) for s in symbols}
