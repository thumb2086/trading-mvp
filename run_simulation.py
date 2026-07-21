#!/usr/bin/env python3
"""
台股歷史回測 — 多策略 vs GP 演化對照平台

Usage:
    python run_simulation.py --symbol 2330 --start 2020-01-01 --end 2024-12-31
"""
import argparse
import json
import multiprocessing as mp
import operator
import os
import random
import sys
import time

import numpy as np
import pandas as pd

from data.tw_stock_loader import load_stock
from strategies.fixed import FIXED_STRATEGIES, list_strategies, run_strategy
from engine.simulator import simulate

# DEAP
from deap import base, creator, tools, gp
from strategies.gp.primitives import PSET, eval_expr, expr_to_str, DataContext

_GLOBAL_DF = None

OUTPUT_DIR = "experiments"


def evaluate_strategy(name: str, df: pd.DataFrame,
                      **params) -> dict:
    result = run_strategy(name, df, **params)
    stats = simulate(result)
    stats["name"] = name
    stats["params"] = params
    stats["strategy_type"] = "fixed"
    return stats


def evaluate_gp(expr_str: str, df: pd.DataFrame) -> dict:
    expr = gp.PrimitiveTree.from_string(expr_str, PSET)
    ctx = DataContext(df)
    n = len(df)
    raw = eval_expr(expr, ctx)
    signal = np.where(raw > 0, 1, np.where(raw < 0, -1, 0))
    result = df[["date", "open", "high", "low", "close", "volume"]].copy()
    result["signal"] = signal
    stats = simulate(result)
    stats["name"] = expr_to_str(expr)
    stats["expr"] = expr_str
    stats["strategy_type"] = "gp"
    return stats


def run_fixed(args):
    name, df, params = args
    try:
        return evaluate_strategy(name, df, **params)
    except Exception as e:
        return {"name": name, "error": str(e), "strategy_type": "fixed"}


def run_gp(args):
    expr_str, df = args
    try:
        return evaluate_gp(expr_str, df)
    except Exception as e:
        return {"name": "gp_error", "error": str(e), "strategy_type": "gp"}


def gp_eval_expr(expr_str):
    df = _GLOBAL_DF
    try:
        expr = gp.PrimitiveTree.from_string(expr_str, PSET)
        ctx = DataContext(df)
        n = len(df)
        raw = eval_expr(expr, ctx)
        raw = np.where(np.isnan(raw), 0.0, raw)
        signal = np.where(raw > 0, 1, np.where(raw < 0, -1, 0)).tolist()
        return signal
    except Exception:
        return None


def gp_fitness_expr(expr_str, df=None):
    if df is None:
        df = _GLOBAL_DF
    try:
        expr = gp.PrimitiveTree.from_string(expr_str, PSET)
        ctx = DataContext(df)
        raw = eval_expr(expr, ctx)
        raw = np.where(np.isnan(raw), 0.0, raw)
        signal = np.where(raw > 0, 1, np.where(raw < 0, -1, 0))
        result = df[["date", "open", "high", "low", "close", "volume"]].copy()
        result["signal"] = signal
        stats = simulate(result)
        sharpe = stats.get("sharpe", 0)
        mdd = abs(stats.get("max_drawdown", 0))
        return (sharpe - 0.5 * mdd,)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"  [GP ERR] expr={expr_str[:80]}  error={e}")
        return (-999.0,)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbol", type=str, default="2330")
    parser.add_argument("--start", type=str, default="2020-01-01")
    parser.add_argument("--end", type=str, default="2024-12-31")
    parser.add_argument("--generations", type=int, default=20)
    parser.add_argument("--pop-size", type=int, default=30)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    os.makedirs(os.path.join(OUTPUT_DIR, "simulation"), exist_ok=True)

    print(f"Loading {args.symbol} data ({args.start} ~ {args.end})...")
    df = load_stock(args.symbol, args.start, args.end)
    print(f"  {len(df)} rows loaded")

    # ── Phase 1: Fixed strategies ──
    print(f"\n{'='*60}")
    print("Phase 1: Fixed Strategies")
    print(f"{'='*60}")
    fixed_names = list_strategies()
    fixed_results = []

    with mp.Pool(args.workers) as pool:
        tasks = [(name, df, FIXED_STRATEGIES[name].params_desc or {})
                 for name in fixed_names]
        for res in pool.imap_unordered(run_fixed, tasks):
            fixed_results.append(res)
            if "error" not in res:
                print(f"  {res['name']:25s}  "
                      f"Return={res['total_return']:+.2%}  "
                      f"Sharpe={res['sharpe']:.2f}  "
                      f"MDD={res['max_drawdown']:.2%}  "
                      f"Trades={res['trades']}")
            else:
                print(f"  {res['name']:25s}  ERROR: {res['error']}")

    best_fixed = max(
        [r for r in fixed_results if "error" not in r],
        key=lambda r: r["sharpe"], default=None)
    if best_fixed:
        print(f"\n  Best fixed strategy: {best_fixed['name']}  "
              f"Sharpe={best_fixed['sharpe']:.2f}  "
              f"Return={best_fixed['total_return']:+.2%}")

    # ── Phase 2: GP Evolution ──
    print(f"\n{'='*60}")
    print("Phase 2: GP Evolution")
    print(f"{'='*60}")

    creator.create("FitnessMax", base.Fitness, weights=(1.0,))
    creator.create("Individual", gp.PrimitiveTree, fitness=creator.FitnessMax)

    toolbox = base.Toolbox()
    toolbox.register("expr", gp.genHalfAndHalf, pset=PSET, min_=1, max_=4)
    toolbox.register("individual", tools.initIterate,
                     creator.Individual, toolbox.expr)
    toolbox.register("population", tools.initRepeat, list,
                     toolbox.individual)
    toolbox.register("compile", gp.compile, pset=PSET)
    toolbox.register("select", tools.selTournament, tournsize=3)
    toolbox.register("mate", gp.cxOnePoint)
    toolbox.register("expr_mut", gp.genFull, min_=0, max_=3)
    toolbox.register("mutate", gp.mutUniform, expr=toolbox.expr_mut, pset=PSET)

    toolbox.decorate("mate", gp.staticLimit(key=operator.attrgetter("height"),
                                            max_value=12))
    toolbox.decorate("mutate", gp.staticLimit(
        key=operator.attrgetter("height"), max_value=12))

    pop = toolbox.population(n=args.pop_size)

    # Evaluate initial population (sequential, small pop)
    for ind in pop:
        ind.fitness.values = gp_fitness_expr(str(ind), df)
    hof = tools.HallOfFame(3)
    stats_fit = tools.Statistics(lambda ind: ind.fitness.values)
    stats_fit.register("avg", np.mean)
    stats_fit.register("std", np.std)
    stats_fit.register("min", np.min)
    stats_fit.register("max", np.max)

    best_gp_overall = None
    for gen in range(args.generations):
        t0 = time.time()
        offspring = toolbox.select(pop, len(pop))
        offspring = [toolbox.clone(ind) for ind in offspring]

        for i in range(1, len(offspring), 2):
            if random.random() < 0.5:
                toolbox.mate(offspring[i - 1], offspring[i])
                del offspring[i - 1].fitness.values
                del offspring[i].fitness.values

        for i in range(len(offspring)):
            if random.random() < 0.2:
                toolbox.mutate(offspring[i])
                del offspring[i].fitness.values

        invalid = [ind for ind in offspring if not ind.fitness.valid]
        for ind in invalid:
            ind.fitness.values = gp_fitness_expr(str(ind), df)

        pop[:] = offspring
        hof.update(pop)
        gen_time = time.time() - t0

        best_in_pop = max(pop, key=lambda ind: ind.fitness.values[0])
        if best_gp_overall is None or \
           best_in_pop.fitness.values[0] > best_gp_overall.fitness.values[0]:
            best_gp_overall = best_in_pop

        record = stats_fit.compile(pop)
        print(f"  Gen {gen:2d}  "
              f"Best={record['max']:.3f}  Avg={record['avg']:.3f}  "
              f"Std={record['std']:.3f}  "
              f"Time={gen_time:.1f}s")

    # ── Results ──
    print(f"\n{'='*60}")
    print("Final Comparison")
    print(f"{'='*60}")

    if best_fixed:
        print(f"Best Fixed: {best_fixed['name']}  "
              f"Sharpe={best_fixed['sharpe']:.2f}  "
              f"Return={best_fixed['total_return']:+.2%}")

    if best_gp_overall:
        gp_expr_str = str(best_gp_overall)
        gp_stats = evaluate_gp(gp_expr_str, df)
        print(f"Best GP:    {expr_to_str(best_gp_overall)[:60]}...  "
              f"Sharpe={gp_stats['sharpe']:.2f}  "
              f"Return={gp_stats['total_return']:+.2%}  "
              f"MDD={gp_stats['max_drawdown']:.2%}")

    # Save
    out = {
        "symbol": args.symbol,
        "period": {"start": args.start, "end": args.end},
        "fixed_best": best_fixed,
        "gp_best": None,
    }
    if best_gp_overall:
        out["gp_best"] = {
            "expr": str(best_gp_overall),
            "readable": expr_to_str(best_gp_overall),
            **gp_stats,
        }
    out["all_fixed"] = [r for r in fixed_results if "error" not in r]

    path = os.path.join(OUTPUT_DIR, "simulation", f"{args.symbol}_result.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=2, default=str)
    print(f"\nResults saved to {path}")


if __name__ == "__main__":
    main()
