import numpy as np
import pandas as pd
from .registry import register


def _sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(period).mean()


def _ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def _rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _bb(series: pd.Series, period: int = 20, std: float = 2.0):
    ma = _sma(series, period)
    sd = series.rolling(period).std()
    return ma, ma + std * sd, ma - std * sd


def _macd(series: pd.Series):
    e12 = _ema(series, 12)
    e26 = _ema(series, 26)
    macd = e12 - e26
    signal = _ema(macd, 9)
    return macd, signal


@register("SMA_Cross_5_20", {"fast": 5, "slow": 20})
def sma_cross_5_20(df: pd.DataFrame, fast=5, slow=20):
    s_fast = _sma(df["close"], fast)
    s_slow = _sma(df["close"], slow)
    signals = pd.Series(0, index=df.index)
    signals[(s_fast > s_slow) & (s_fast.shift(1) <= s_slow.shift(1))] = 1
    signals[(s_fast < s_slow) & (s_fast.shift(1) >= s_slow.shift(1))] = -1
    return signals


@register("SMA_Cross_10_30", {"fast": 10, "slow": 30})
def sma_cross_10_30(df: pd.DataFrame, fast=10, slow=30):
    return sma_cross_5_20(df, fast, slow)


@register("SMA_Cross_20_60", {"fast": 20, "slow": 60})
def sma_cross_20_60(df: pd.DataFrame, fast=20, slow=60):
    return sma_cross_5_20(df, fast, slow)


@register("EMA_Cross_5_20", {"fast": 5, "slow": 20})
def ema_cross_5_20(df: pd.DataFrame, fast=5, slow=20):
    e_fast = _ema(df["close"], fast)
    e_slow = _ema(df["close"], slow)
    signals = pd.Series(0, index=df.index)
    signals[(e_fast > e_slow) & (e_fast.shift(1) <= e_slow.shift(1))] = 1
    signals[(e_fast < e_slow) & (e_fast.shift(1) >= e_slow.shift(1))] = -1
    return signals


@register("RSI_Overbought_Oversold", {"period": 14, "overbought": 70, "oversold": 30})
def rsi_strategy(df: pd.DataFrame, period=14, overbought=70, oversold=30):
    rsi = _rsi(df["close"], period)
    signals = pd.Series(0, index=df.index)
    signals[(rsi < oversold) & (rsi.shift(1) >= oversold)] = 1
    signals[(rsi > overbought) & (rsi.shift(1) <= overbought)] = -1
    return signals


@register("RSI_Divergence", {"period": 14, "lookback": 10})
def rsi_divergence(df: pd.DataFrame, period=14, lookback=10):
    rsi = _rsi(df["close"], period)
    signals = pd.Series(0, index=df.index)
    for i in range(lookback, len(df)):
        if i < lookback * 2:
            continue
        price_low = df["close"].iloc[i-lookback:i].min()
        price_now = df["close"].iloc[i]
        rsi_low = rsi.iloc[i-lookback:i].min()
        rsi_now = rsi.iloc[i]
        if price_now < price_low and rsi_now > rsi_low:
            signals.iloc[i] = 1
        price_high = df["close"].iloc[i-lookback:i].max()
        rsi_high = rsi.iloc[i-lookback:i].max()
        if price_now > price_high and rsi_now < rsi_high:
            signals.iloc[i] = -1
    return signals


@register("MACD_Cross", {"fast": 12, "slow": 26, "signal": 9})
def macd_cross(df: pd.DataFrame, fast=12, slow=26, signal=9):
    macd_line, signal_line = _macd(df["close"])
    signals = pd.Series(0, index=df.index)
    signals[(macd_line > signal_line) & (macd_line.shift(1) <= signal_line.shift(1))] = 1
    signals[(macd_line < signal_line) & (macd_line.shift(1) >= signal_line.shift(1))] = -1
    return signals


@register("Bollinger_Breakout", {"period": 20, "std": 2.0})
def bollinger_breakout(df: pd.DataFrame, period=20, std=2.0):
    ma, upper, lower = _bb(df["close"], period, std)
    signals = pd.Series(0, index=df.index)
    signals[(df["close"] > upper) & (df["close"].shift(1) <= upper.shift(1))] = -1
    signals[(df["close"] < lower) & (df["close"].shift(1) >= lower.shift(1))] = 1
    return signals


@register("Bollinger_Squeeze", {"period": 20, "std": 2.0, "threshold": 0.1})
def bollinger_squeeze(df: pd.DataFrame, period=20, std=2.0, threshold=0.1):
    ma, upper, lower = _bb(df["close"], period, std)
    bandwidth = (upper - lower) / ma
    squeezed = bandwidth < bandwidth.rolling(50).mean() * threshold
    signals = pd.Series(0, index=df.index)
    signals[squeezed & ~squeezed.shift(1).fillna(False).infer_objects(copy=False)] = 1
    return signals


@register("Momentum", {"period": 10, "threshold": 0.02})
def momentum_strategy(df: pd.DataFrame, period=10, threshold=0.02):
    mom = df["close"].pct_change(period)
    signals = pd.Series(0, index=df.index)
    signals[mom > threshold] = 1
    signals[mom < -threshold] = -1
    return signals


@register("Mean_Reversion", {"period": 20, "threshold": 2.0})
def mean_reversion(df: pd.DataFrame, period=20, threshold=2.0):
    ma = _sma(df["close"], period)
    z = (df["close"] - ma) / df["close"].rolling(period).std()
    signals = pd.Series(0, index=df.index)
    signals[z < -threshold] = 1
    signals[z > threshold] = -1
    return signals


@register("Triple_SMA", {"short": 5, "mid": 10, "long": 20})
def triple_sma(df: pd.DataFrame, short=5, mid=10, long=20):
    s_short = _sma(df["close"], short)
    s_mid = _sma(df["close"], mid)
    s_long = _sma(df["close"], long)
    signals = pd.Series(0, index=df.index)
    signals[(s_short > s_mid) & (s_mid > s_long)] = 1
    signals[(s_short < s_mid) & (s_mid < s_long)] = -1
    return signals


@register("Dual_RSI_MACD", {"rsi_period": 14, "rsi_low": 30, "rsi_high": 70})
def dual_rsi_macd(df: pd.DataFrame, rsi_period=14, rsi_low=30, rsi_high=70):
    rsi = _rsi(df["close"], rsi_period)
    macd_line, signal_line = _macd(df["close"])
    signals = pd.Series(0, index=df.index)
    long_cond = (rsi < rsi_low) & (macd_line > signal_line)
    short_cond = (rsi > rsi_high) & (macd_line < signal_line)
    signals[long_cond] = 1
    signals[short_cond] = -1
    return signals


@register("Donchian_Breakout", {"period": 20})
def donchian_breakout(df: pd.DataFrame, period=20):
    high = df["high"].rolling(period).max()
    low = df["low"].rolling(period).min()
    signals = pd.Series(0, index=df.index)
    signals[(df["close"] > high.shift(1))] = 1
    signals[(df["close"] < low.shift(1))] = -1
    return signals


@register("Volume_Confirmation", {"ma_period": 10, "vol_ma_period": 20})
def volume_confirmation(df: pd.DataFrame, ma_period=10, vol_ma_period=20):
    ma = _sma(df["close"], ma_period)
    vol_ma = _sma(df["volume"], vol_ma_period)
    signals = pd.Series(0, index=df.index)
    signals[(df["close"] > ma) & (df["volume"] > vol_ma * 1.5)] = 1
    signals[(df["close"] < ma) & (df["volume"] > vol_ma * 1.5)] = -1
    return signals


@register("Parabolic_SAR", {"accel": 0.02, "max_accel": 0.2})
def parabolic_sar(df: pd.DataFrame, accel=0.02, max_accel=0.2):
    high, low = df["high"].values, df["low"].values
    close = df["close"].values
    n = len(close)
    sar = np.zeros(n)
    ep = np.zeros(n)
    af = np.zeros(n)
    trend = np.ones(n)
    sar[0] = low[0]
    ep[0] = high[0]
    af[0] = accel
    for i in range(1, n):
        prev_trend = trend[i-1]
        if prev_trend == 1:
            sar[i] = sar[i-1] + af[i-1] * (ep[i-1] - sar[i-1])
            sar[i] = min(sar[i], low[i-1], low[i-2] if i >= 2 else low[i-1])
            if low[i] < sar[i]:
                trend[i] = -1
                sar[i] = ep[i-1]
                ep[i] = low[i]
                af[i] = accel
            else:
                trend[i] = 1
                ep[i] = max(ep[i-1], high[i])
                af[i] = min(af[i-1] + accel, max_accel) if ep[i] > ep[i-1] else af[i-1]
        else:
            sar[i] = sar[i-1] - af[i-1] * (sar[i-1] - ep[i-1])
            sar[i] = max(sar[i], high[i-1], high[i-2] if i >= 2 else high[i-1])
            if high[i] > sar[i]:
                trend[i] = 1
                sar[i] = ep[i-1]
                ep[i] = high[i]
                af[i] = accel
            else:
                trend[i] = -1
                ep[i] = min(ep[i-1], low[i])
                af[i] = min(af[i-1] + accel, max_accel) if ep[i] < ep[i-1] else af[i-1]
    signals = pd.Series(0, index=df.index)
    signals[(trend == 1) & (np.roll(trend, 1) == -1)] = 1
    signals[(trend == -1) & (np.roll(trend, 1) == 1)] = -1
    return signals
