#!/usr/bin/env python3
"""Decision Arena: run multiple decision models on real (recent) market data and compare.

Usage:
    python run_arena.py --symbol 2330 --days 90
    python run_arena.py --symbol 2330 --days 60 --jev-model Qwen/Qwen2.5-0.5B-Instruct
"""
import argparse
import json
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from data.realtime import fetch_recent_ohlcv, fetch_realtime_quote
from data.tw_stock_loader import load_stock
from engine.simulator import simulate
from strategies.fixed import FIXED_STRATEGIES, run_strategy
from strategies.decision.state_builder import build_state_document
from strategies.decision.jev_model import JEVDecisionModel

OUTPUT_DIR = "experiments"


def backtest_fixed(df: pd.DataFrame) -> list[dict]:
    out = []
    for name in FIXED_STRATEGIES:
        try:
            result = run_strategy(name, df)
            stats = simulate(result)
            stats["name"] = name
            stats["strategy_type"] = "fixed"
            out.append(stats)
        except Exception as e:
            out.append({"name": name, "error": str(e), "strategy_type": "fixed"})
    return out


def jev_signal_series(df: pd.DataFrame, model: JEVDecisionModel, every: int = 5) -> list[int]:
    """Produce a signal series by querying JEV every `every` bars and forward-filling."""
    n = len(df)
    signals = [0] * n
    last_sig = 0
    for i in range(n):
        if i % every == 0 or i == n - 1:
            sub = df.iloc[: i + 1].copy()
            state_doc = build_state_document("", sub)
            action, conf, _ = model.decide(state_doc)
            last_sig = 1 if action == "BUY" else (-1 if action == "SELL" else 0)
        signals[i] = last_sig
    return signals


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbol", type=str, default="2330")
    parser.add_argument("--market", type=str, default="auto", choices=["auto", "TW", "US"])
    parser.add_argument("--days", type=int, default=90)
    parser.add_argument("--start", type=str, default=None, help="Start date YYYY-MM-DD (inclusive)")
    parser.add_argument("--end", type=str, default=None, help="End date YYYY-MM-DD (inclusive)")
    parser.add_argument("--jev-model", type=str, default=None)
    parser.add_argument("--jev-every", type=int, default=3)
    parser.add_argument("--heuristic", action="store_true", help="Force heuristic JEV (no LLM)")

    args = parser.parse_args()

    symbol = args.symbol
    market = args.market
    print(f"Fetching real-time quote for {symbol} ({market})...")
    quote = fetch_realtime_quote(symbol, market)
    print(json.dumps(quote, ensure_ascii=False))

    print(f"Fetching {args.days} days of OHLCV...")
    df = fetch_recent_ohlcv(symbol, args.days, market)
    if df.empty:
        print("No data, falling back to cached loader")
        try:
            df = load_stock(symbol, (pd.Timestamp.now() - pd.Timedelta(days=args.days)).strftime("%Y-%m-%d"),
                           pd.Timestamp.now().strftime("%Y-%m-%d"))
        except Exception as e:
            print("load_stock failed:", e)
            sys.exit(1)
    # date range filter (causal simulation window)
    if args.start:
        df = df[df["date"] >= args.start].reset_index(drop=True)
    if args.end:
        df = df[df["date"] <= args.end].reset_index(drop=True)
    if df.empty:
        print("No data in requested range"); sys.exit(1)
    print(f"Got {len(df)} bars, {df['date'].iloc[0]} ~ {df['date'].iloc[-1]}")

    # Fixed strategies backtest
    print("\nRunning fixed strategies backtest...")
    fixed_results = backtest_fixed(df)

    # JEV decision model
    print("\nInitializing JEV decision model...")
    model = JEVDecisionModel(model_id=args.jev_model, use_so1=(not args.heuristic)) if args.jev_model else JEVDecisionModel(use_so1=(not args.heuristic))

    state_doc = build_state_document(symbol, df, name=quote.get("name", ""))
    print("State doc:\n" + state_doc)
    t0 = time.time()
    action, conf, details = model.decide(state_doc)
    print(f"\nJEV decision: {action} (conf={conf:.3f}) details={details}  time={time.time()-t0:.2f}s")

    # JEV signal series (periodic) + backtest
    print(f"\nRunning JEV signal series (every {args.jev_every} bars)...")
    t0 = time.time()
    jev_signals = jev_signal_series(df, model, every=args.jev_every)
    jev_df = df[["date", "open", "high", "low", "close", "volume"]].copy()
    jev_df["signal"] = jev_signals
    jev_stats = simulate(jev_df)
    jev_stats["name"] = "JEV_Decision"
    jev_stats["strategy_type"] = "jev"
    jev_stats["latest_action"] = action
    jev_stats["latest_confidence"] = conf
    jev_stats["details"] = details
    print(f"JEV backtest: return={jev_stats['total_return']:+.2%} sharpe={jev_stats['sharpe']:.2f} "
          f"mdd={jev_stats['max_drawdown']:.2%} trades={jev_stats['trades']}  time={time.time()-t0:.1f}s")

    # Latest signals per fixed strategy
    latest_signals = {}
    for name in FIXED_STRATEGIES:
        try:
            res = run_strategy(name, df)
            latest_signals[name] = int(res["signal"].iloc[-1])
        except Exception:
            latest_signals[name] = 0

    # Comparison table
    print(f"\n{'='*70}")
    print("Final Comparison (recent period)")
    print(f"{'='*70}")
    print(f"{'Model':<22} {'Return':>10} {'Sharpe':>8} {'MDD':>8} {'Trades':>7} {'Latest':>8}")
    for r in fixed_results:
        if "error" in r:
            print(f"{r['name']:<22} ERROR: {r['error']}")
            continue
        print(f"{r['name']:<22} {r['total_return']:>+9.2%} {r['sharpe']:>8.2f} {r['max_drawdown']:>8.2%} {r['trades']:>7} {latest_signals.get(r['name'],0):>8}")
    print(f"{'JEV_Decision':<22} {jev_stats['total_return']:>+9.2%} {jev_stats['sharpe']:>8.2f} {jev_stats['max_drawdown']:>8.2%} {jev_stats['trades']:>7} {action:>8}")

    # Save
    os.makedirs(os.path.join(OUTPUT_DIR, "arena"), exist_ok=True)
    out = {
        "symbol": symbol,
        "market": market,
        "period": {"start": str(df["date"].iloc[0]), "end": str(df["date"].iloc[-1]),
                   "days": len(df),
                   "requested_start": args.start, "requested_end": args.end},
        "quote": quote,
        "fixed": [r for r in fixed_results],
        "jev": jev_stats,
        "latest_fixed_signals": latest_signals,
        "latest_jev_action": action,
        "latest_jev_confidence": conf,
        "latest_jev_details": details,
    }
    path = os.path.join(OUTPUT_DIR, "arena", f"{symbol}_arena.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, default=str)
    print(f"\nResults saved to {path}")


if __name__ == "__main__":
    main()
