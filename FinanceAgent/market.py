from __future__ import annotations

from datetime import datetime

import yfinance as yf


POSITIVE_WORDS = {
    "beat", "beats", "surge", "upgrade", "record", "growth", "profit", "strong",
    "buy", "outperform", "høyere", "vekst", "overskudd", "løft",
}
NEGATIVE_WORDS = {
    "miss", "misses", "crash", "downgrade", "lawsuit", "probe", "cut", "weak",
    "sell", "underperform", "fall", "nedgang", "tap", "varsel", "kutt",
}


def _to_ticker(symbol: str) -> yf.Ticker:
    return yf.Ticker(symbol.strip().upper())


def _parse_news_item(item: dict) -> dict | None:
    content = item.get("content") if isinstance(item, dict) else None
    if content:
        title = content.get("title") or content.get("summary")
        url = (content.get("canonicalUrl") or {}).get("url") or (content.get("clickThroughUrl") or {}).get("url")
        source = (content.get("provider") or {}).get("displayName")
        published = content.get("pubDate") or content.get("displayTime")
        if not title:
            return None
        return {
            "title": title,
            "url": url,
            "source": source or "",
            "published": str(published)[:10] if published else "",
        }

    title = item.get("title")
    if not title:
        return None
    published = item.get("providerPublishTime")
    if isinstance(published, (int, float)):
        published = datetime.utcfromtimestamp(published).date().isoformat()
    return {
        "title": title,
        "url": item.get("link"),
        "source": item.get("publisher") or "",
        "published": str(published or "")[:10],
    }


def get_quote(symbol: str) -> dict:
    ticker = _to_ticker(symbol)
    history = ticker.history(period="5d", interval="1d")
    if history is None or history.empty:
        raise ValueError(f"Fant ingen kursdata for {symbol}.")

    close = float(history["Close"].iloc[-1])
    prev = float(history["Close"].iloc[-2]) if len(history) > 1 else close
    info = ticker.info or {}
    return {
        "ticker": symbol.strip().upper(),
        "name": info.get("shortName") or info.get("longName") or symbol.strip().upper(),
        "price": close,
        "change_pct": ((close - prev) / prev) * 100 if prev else 0.0,
        "currency": info.get("currency") or "NOK",
    }


def get_history(symbol: str, period: str = "1y"):
    ticker = _to_ticker(symbol)
    history = ticker.history(period=period, interval="1d")
    if history is None or history.empty:
        raise ValueError(f"Fant ingen historikk for {symbol}.")
    return history["Close"].dropna()


def get_news(symbol: str) -> dict:
    ticker = _to_ticker(symbol)
    raw = []
    try:
        raw = ticker.get_news() or []
    except Exception:
        raw = getattr(ticker, "news", None) or []

    items = []
    for item in raw:
        parsed = _parse_news_item(item)
        if parsed:
            items.append(parsed)
    items = items[:8]

    score = 0
    for item in items:
        text = item["title"].lower()
        score += sum(1 for word in POSITIVE_WORDS if word in text)
        score -= sum(1 for word in NEGATIVE_WORDS if word in text)

    if not items:
        overview = "Ingen ferske nyheter ble funnet for denne tickeren."
        tone = 0
    elif score > 1:
        overview = "Nyhetsbildet heller mot det positive, med flere oppløftende overskrifter den siste tiden."
        tone = 1
    elif score < -1:
        overview = "Nyhetsbildet heller mot det negative, med flere varsler og svake overskrifter."
        tone = -1
    else:
        overview = "Nyhetsbildet er blandet. Ingen tydelig retning skiller seg ut i de siste sakene."
        tone = 0

    return {"overview": overview, "items": items, "tone": tone}
