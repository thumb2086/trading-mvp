import operator
import numpy as np
import pandas as pd
from functools import partial
import random as _random

from deap import gp


def _protected_div(a, b):
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    if a.ndim == 0 and b.ndim == 0:
        return a / b if abs(b) > 1e-10 else 1.0
    with np.errstate(divide="ignore", invalid="ignore"):
        out = np.full_like(a, 1.0)
        mask = np.abs(b) > 1e-10
        if np.any(mask):
            out[mask] = a[mask] / b[mask]
    return out


def _to_period(x):
    arr = np.asarray(x, dtype=float)
    arr = arr[~np.isnan(arr)]
    if arr.ndim == 0 or len(arr) == 0:
        return 2
    return int(max(round(float(arr.mean())), 2))


def _logical_and(a, b):
    return np.logical_and(np.asarray(a, dtype=bool), np.asarray(b, dtype=bool))


def _logical_or(a, b):
    return np.logical_or(np.asarray(a, dtype=bool), np.asarray(b, dtype=bool))


def _sma(series, period):
    series = np.asarray(series, dtype=float)
    p = _to_period(period)
    if len(series) < p:
        return np.full_like(series, np.nan)
    return pd.Series(series).rolling(p).mean().values


def _rsi(series, period=14):
    series = np.asarray(series, dtype=float)
    p = _to_period(period)
    n = len(series)
    if n < p + 1:
        return np.full(n, 0.5, dtype=float)
    delta = np.diff(series)
    gain = np.where(delta > 0, delta, 0)
    loss = np.where(delta < 0, -delta, 0)
    avg_gain = pd.Series(gain).rolling(p).mean().values
    avg_loss = pd.Series(loss).rolling(p).mean().values
    avg_loss = np.where(np.isnan(avg_loss), 1.0, avg_loss)
    avg_loss = np.where(avg_loss < 1e-10, 1.0, avg_loss)
    rs = avg_gain / avg_loss
    rsi_vals = 100 - (100 / (1 + rs))
    return np.concatenate([np.full(1, 0.5), rsi_vals]) if n > 1 else rsi_vals


def _ema(series, period):
    series = np.asarray(series, dtype=float)
    return pd.Series(series).ewm(span=_to_period(period), adjust=False).mean().values


def _rolling_max(series, period):
    series = np.asarray(series, dtype=float)
    return pd.Series(series).rolling(_to_period(period)).max().values


def _rolling_min(series, period):
    series = np.asarray(series, dtype=float)
    return pd.Series(series).rolling(_to_period(period)).min().values


def _rolling_std(series, period):
    series = np.asarray(series, dtype=float)
    return pd.Series(series).rolling(_to_period(period)).std().values


def _delay(series, n):
    series = np.asarray(series, dtype=float)
    arr = np.asarray(n, dtype=float)
    arr = arr[~np.isnan(arr)]
    shift = 1
    if len(arr) > 0:
        shift = int(max(round(float(arr.mean())), 1)) if arr.ndim > 0 else 1
    return np.roll(series, min(shift, len(series) - 1))


class DataContext:
    def __init__(self, df: pd.DataFrame):
        self.open = df["open"].values
        self.high = df["high"].values
        self.low = df["low"].values
        self.close = df["close"].values
        self.volume = df["volume"].values


def _make_primitive_set():
    pset = gp.PrimitiveSet("MAIN", 5)
    pset.renameArguments(ARG0="open", ARG1="high", ARG2="low",
                         ARG3="close", ARG4="volume")
    pset.addPrimitive(operator.add, 2, name="add")
    pset.addPrimitive(operator.sub, 2, name="sub")
    pset.addPrimitive(operator.mul, 2, name="mul")
    pset.addPrimitive(_protected_div, 2, name="div")
    pset.addPrimitive(operator.gt, 2, name="gt")
    pset.addPrimitive(operator.lt, 2, name="lt")
    pset.addPrimitive(_logical_and, 2, name="and_op")
    pset.addPrimitive(_logical_or, 2, name="or_op")
    pset.addPrimitive(lambda x: -np.asarray(x, dtype=float), 1, name="neg")
    pset.addPrimitive(_sma, 2, name="sma")
    pset.addPrimitive(_ema, 2, name="ema")
    pset.addPrimitive(_rsi, 2, name="rsi")
    pset.addPrimitive(_rolling_max, 2, name="ts_max")
    pset.addPrimitive(_rolling_min, 2, name="ts_min")
    pset.addPrimitive(_rolling_std, 2, name="ts_std")
    pset.addPrimitive(_delay, 2, name="delay")
    pset.addEphemeralConstant("const", partial(round, np.random.uniform(1, 100), 1))
    pset.addEphemeralConstant("thresh", partial(round, np.random.uniform(0.01, 0.1), 3))
    pset.addEphemeralConstant("small", lambda: float(_random.randint(2, 30)))
    return pset


PSET = _make_primitive_set()


def eval_expr(expr, ctx: DataContext) -> np.ndarray:
    func = gp.compile(expr, PSET)
    n = len(ctx.close)
    raw = func(ctx.open, ctx.high, ctx.low, ctx.close, ctx.volume)
    if isinstance(raw, np.ndarray):
        if raw.ndim == 0:
            raw = np.full(n, raw.item(), dtype=float)
        elif len(raw) != n:
            raw = np.full(n, float(raw.mean()) if hasattr(raw, 'mean') else float(raw), dtype=float)
    elif isinstance(raw, (int, float, bool, np.integer, np.floating)):
        raw = np.full(n, float(raw), dtype=float)
    elif isinstance(raw, (list, tuple)):
        raw = np.asarray(raw, dtype=float)
        if len(raw) != n:
            raw = np.full(n, raw.mean(), dtype=float)
    else:
        raw = np.asarray(raw, dtype=float)
        if raw.ndim == 0 or len(raw) != n:
            raw = np.full(n, float(raw.mean()) if raw.ndim > 0 else float(raw), dtype=float)
    return np.where(np.isnan(raw), 0.0, raw)


def expr_to_str(expr) -> str:
    return str(expr)
