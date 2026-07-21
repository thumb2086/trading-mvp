import pandas as pd

FIXED_STRATEGIES = {}


def register(name: str, params_desc: dict = None):
    def decorator(fn):
        fn.params_desc = params_desc or {}
        FIXED_STRATEGIES[name] = fn
        return fn
    return decorator


def list_strategies():
    return list(FIXED_STRATEGIES.keys())


def run_strategy(name: str, df: pd.DataFrame, **kwargs) -> pd.DataFrame:
    fn = FIXED_STRATEGIES[name]
    result = df[["date", "open", "high", "low", "close", "volume"]].copy()
    signals = fn(df, **kwargs)
    result["signal"] = signals
    return result
