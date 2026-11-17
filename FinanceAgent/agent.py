from __future__ import annotations

from forecast import forecast as run_forecast
from market import get_news, get_quote


def _portfolio_weight(ticker: str, portfolio: list[dict]) -> float:
    if not portfolio:
        return 0.0
    total = sum(max(item.get("weight") or 0, 0) for item in portfolio)
    if total <= 0:
        return 0.0
    for item in portfolio:
        if item.get("ticker", "").upper() == ticker.upper():
            return (item.get("weight") or 0) / total * 100
    return 0.0


def recommend(quote: dict, news: dict, prediction: dict, portfolio: list[dict]) -> dict:
    ticker = quote["ticker"]
    expected = prediction["expected_return_pct"]
    tone = news.get("tone") or 0
    weight = _portfolio_weight(ticker, portfolio)

    forecast_score = max(-1.0, min(1.0, expected / 4))
    news_score = float(tone)
    concentration = 0.0
    if weight >= 30:
        concentration = -0.35
    elif weight <= 0:
        concentration = 0.1

    score = 0.5 * forecast_score + 0.35 * news_score + 0.15 * concentration

    in_portfolio = weight > 0
    if score > 0.35:
        action = "Øk" if in_portfolio else "Kjøp"
    elif score < -0.35:
        action = "Reduser" if in_portfolio else "Selg"
    else:
        action = "Hold"

    parts = []
    if expected >= 0:
        parts.append(f"prognosen peker mot {expected:.1f}% oppgang på {prediction['horizon_days']} dager")
    else:
        parts.append(f"prognosen peker mot {abs(expected):.1f}% nedgang på {prediction['horizon_days']} dager")

    if tone > 0:
        parts.append("nyhetsbildet er mer positivt enn negativt")
    elif tone < 0:
        parts.append("nyhetsbildet er mer negativt enn positivt")
    else:
        parts.append("nyhetene er nøytrale")

    if in_portfolio:
        parts.append(f"aksjen utgjør om lag {weight:.0f}% av porteføljen du oppga")
    else:
        parts.append("aksjen er ikke i porteføljen du oppga")

    reason = f"{action}: " + ", ".join(parts) + "."
    return {"action": action, "reason": reason}


def assess(ticker: str, portfolio: list[dict] | None = None) -> dict:
    portfolio = portfolio or []
    quote = get_quote(ticker)
    news = get_news(ticker)
    prediction = run_forecast(ticker)
    recommendation = recommend(quote, news, prediction, portfolio)
    return {
        "quote": quote,
        "news": news,
        "forecast": prediction,
        "recommendation": recommendation,
    }
