from __future__ import annotations

from datetime import timedelta

import numpy as np
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

from market import get_history

HORIZON_DAYS = 10


def _features(returns: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    window = 20
    X = []
    y = []
    for i in range(window, len(returns) - HORIZON_DAYS):
        chunk = returns[i - window : i]
        sma_fast = chunk[-5:].mean()
        sma_slow = chunk.mean()
        vol = chunk.std()
        X.append([chunk[-1], sma_fast, sma_slow, vol, sma_fast - sma_slow])
        y.append(returns[i : i + HORIZON_DAYS].sum())
    return np.array(X), np.array(y)


def forecast(symbol: str) -> dict:
    series = get_history(symbol, period="1y")
    closes = series.to_numpy(dtype=float)
    returns = np.diff(np.log(closes))
    if len(returns) < 80:
        raise ValueError("For lite historikk til å lage en prognose.")

    X, y = _features(returns)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    model = Ridge(alpha=1.0)
    model.fit(X_scaled, y)

    latest = returns[-20:]
    sample = np.array([[
        latest[-1],
        latest[-5:].mean(),
        latest.mean(),
        latest.std(),
        latest[-5:].mean() - latest.mean(),
    ]])
    expected = float(model.predict(scaler.transform(sample))[0])
    residual_std = float((y - model.predict(X_scaled)).std())
    last_price = float(closes[-1])
    daily = expected / HORIZON_DAYS

    history = [
        {"date": index.date().isoformat(), "close": float(value)}
        for index, value in series.tail(90).items()
    ]

    future = []
    upper = []
    lower = []
    last_date = series.index[-1]
    price = last_price
    for step in range(1, HORIZON_DAYS + 1):
        price *= np.exp(daily)
        band = last_price * residual_std * np.sqrt(step / HORIZON_DAYS)
        point_date = (last_date + timedelta(days=step)).date().isoformat()
        future.append({"date": point_date, "close": float(price)})
        upper.append({"date": point_date, "close": float(price + band)})
        lower.append({"date": point_date, "close": float(price - band)})

    return {
        "horizon_days": HORIZON_DAYS,
        "expected_return_pct": expected * 100,
        "history": history,
        "future": future,
        "upper": upper,
        "lower": lower,
    }
