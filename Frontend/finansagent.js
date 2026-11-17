const API_BASE = window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
const money = new Intl.NumberFormat("nb-NO", {
  style: "currency",
  currency: "NOK",
  maximumFractionDigits: 2,
});

const formEl = document.getElementById("analyze-form");
const tickerEl = document.getElementById("ticker");
const portfolioEl = document.getElementById("portfolio");
const buttonEl = document.getElementById("analyze-btn");
const statusEl = document.getElementById("analyze-status");
const quoteEl = document.getElementById("quote-panel");
const newsSummaryEl = document.getElementById("news-summary");
const newsListEl = document.getElementById("news-list");
const forecastSummaryEl = document.getElementById("forecast-summary");
const chartEl = document.getElementById("forecast-chart");
const recommendationEl = document.getElementById("recommendation-panel");

function parsePortfolio(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([A-Za-z0-9.\-]+)\s+([0-9]+(?:[.,][0-9]+)?)\s*%?$/);
      if (!match) return null;
      return {
        ticker: match[1].toUpperCase(),
        weight: Number(match[2].replace(",", ".")),
      };
    })
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatPrice(value, currency) {
  if (currency === "USD") {
    return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "USD" }).format(value);
  }
  if (currency === "EUR") {
    return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR" }).format(value);
  }
  return money.format(value);
}

function renderQuote(quote) {
  const changeClass = quote.change_pct >= 0 ? "up" : "down";
  const sign = quote.change_pct >= 0 ? "+" : "";
  quoteEl.innerHTML = `
    <div class="quote-head">
      <div>
        <h3>${escapeHtml(quote.name || quote.ticker)}</h3>
        <p class="empty-note">${escapeHtml(quote.ticker)}</p>
      </div>
      <div>
        <strong>${formatPrice(quote.price, quote.currency)}</strong>
        <p class="quote-change ${changeClass}">${sign}${quote.change_pct.toFixed(2)}%</p>
      </div>
    </div>
  `;
}

function renderNews(news) {
  newsSummaryEl.textContent = news.overview || "";
  newsListEl.innerHTML = (news.items || [])
    .slice(0, 8)
    .map((item) => {
      const title = item.url
        ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>`
        : escapeHtml(item.title);
      return `
        <article class="news-item">
          ${title}
          <p>${escapeHtml(item.source || "")}${item.published ? ` · ${escapeHtml(item.published)}` : ""}</p>
        </article>
      `;
    })
    .join("");
}

function polyline(points) {
  return points.map((point) => point.join(",")).join(" ");
}

function renderChart(forecast) {
  const history = forecast.history || [];
  const future = forecast.future || [];
  const values = [...history.map((point) => point.close), ...future.map((point) => point.close)];
  if (values.length < 2) {
    chartEl.innerHTML = "";
    return;
  }

  const width = 800;
  const height = 260;
  const pad = { top: 20, right: 20, bottom: 24, left: 20 };
  const min = Math.min(...values, ...(forecast.lower || []).map((point) => point.close));
  const max = Math.max(...values, ...(forecast.upper || []).map((point) => point.close));
  const span = max - min || 1;
  const count = history.length + future.length - 1;

  const xFor = (index) => pad.left + (index / count) * (width - pad.left - pad.right);
  const yFor = (value) => pad.top + (1 - (value - min) / span) * (height - pad.top - pad.bottom);

  const histPoints = history.map((point, index) => [xFor(index), yFor(point.close)]);
  const futPoints = [
    histPoints[histPoints.length - 1],
    ...future.map((point, index) => [xFor(history.length + index), yFor(point.close)]),
  ];
  const band = [
    ...(forecast.upper || []).map((point, index) => [xFor(history.length + index), yFor(point.close)]),
    ...[...(forecast.lower || [])].reverse().map((point, index, arr) => [
      xFor(history.length + arr.length - 1 - index),
      yFor(point.close),
    ]),
  ];

  const splitX = xFor(history.length - 1);
  chartEl.innerHTML = `
    <line x1="${splitX}" y1="${pad.top}" x2="${splitX}" y2="${height - pad.bottom}" stroke="rgba(232,238,242,0.12)" />
    ${band.length ? `<polygon points="${polyline(band)}" fill="rgba(126,184,174,0.16)" />` : ""}
    <polyline fill="none" stroke="#7eb8ae" stroke-width="2" points="${polyline(histPoints)}" />
    <polyline fill="none" stroke="#9ad0c7" stroke-width="2" stroke-dasharray="6 4" points="${polyline(futPoints)}" />
  `;
}

function renderForecast(forecast) {
  const direction = forecast.expected_return_pct >= 0 ? "oppgang" : "nedgang";
  forecastSummaryEl.textContent = `Forventet ${direction} på ${forecast.expected_return_pct.toFixed(2)}% over ${forecast.horizon_days} dager.`;
  renderChart(forecast);
}

function renderRecommendation(recommendation) {
  const actionClass = {
    Kjøp: "buy",
    Øk: "buy",
    Hold: "hold",
    Behold: "hold",
    Selg: "sell",
    Reduser: "sell",
  }[recommendation.action] || "hold";

  recommendationEl.innerHTML = `
    <article class="recommendation">
      <div class="action ${actionClass}">${escapeHtml(recommendation.action)}</div>
      <p>${escapeHtml(recommendation.reason)}</p>
    </article>
  `;
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  buttonEl.disabled = true;
  statusEl.textContent = "Henter kurs, nyheter og prognose...";

  try {
    const response = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: tickerEl.value.trim(),
        portfolio: parsePortfolio(portfolioEl.value),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || "Kunne ikke analysere aksjen.");
    }

    const data = await response.json();
    renderQuote(data.quote);
    renderNews(data.news);
    renderForecast(data.forecast);
    renderRecommendation(data.recommendation);
    statusEl.textContent = `Analyse ferdig for ${data.quote.ticker}.`;
  } catch (error) {
    statusEl.textContent = error.message.includes("fetch")
      ? "Får ikke kontakt med backend. Start den på localhost:8000."
      : error.message;
  } finally {
    buttonEl.disabled = false;
  }
});
