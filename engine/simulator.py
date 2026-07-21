import numpy as np
import pandas as pd

COMMISSION_RATE = 0.001425
COMMISSION_MIN = 20
TAX_RATE = 0.003


def simulate(df: pd.DataFrame, initial_capital: float = 1_000_000,
             commission_rate: float = COMMISSION_RATE,
             tax_rate: float = TAX_RATE) -> dict:
    close = df["close"].values
    signal = df["signal"].values
    n = len(close)

    position = 0
    capital = initial_capital
    equity = initial_capital
    trades = 0
    equity_curve = np.zeros(n)

    for i in range(n):
        sig = signal[i]
        price = close[i]

        if sig == 1 and position <= 0:
            # Close short / go long
            shares = int((capital * 0.95) / price)
            cost = shares * price
            commission = max(cost * commission_rate, COMMISSION_MIN)
            tax = cost * tax_rate
            total_cost = cost + commission + tax
            if total_cost <= capital:
                capital -= total_cost
                position = shares
                trades += 1
        elif sig == -1 and position >= 0:
            # Close long / go short
            if position > 0:
                proceeds = position * price
                commission = max(proceeds * commission_rate, COMMISSION_MIN)
                tax = proceeds * tax_rate
                capital += proceeds - commission - tax
                position = 0
                trades += 1
        elif sig == 0 and position > 0:
            pass  # hold

        equity_curve[i] = capital + position * close[i]

    total_return = (equity_curve[-1] - initial_capital) / initial_capital
    returns = np.diff(equity_curve) / equity_curve[:-1]
    sharpe = np.sqrt(252) * (np.mean(returns) / (np.std(returns) + 1e-10))
    peak = np.maximum.accumulate(equity_curve)
    drawdown = (equity_curve - peak) / peak
    max_dd = drawdown.min()

    return {
        "total_return": total_return,
        "sharpe": sharpe,
        "max_drawdown": max_dd,
        "trades": trades,
        "final_equity": equity_curve[-1],
        "equity_curve": equity_curve.tolist(),
    }
