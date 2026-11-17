const money = new Intl.NumberFormat("nb-NO", {
  style: "currency",
  currency: "NOK",
});

const quantityFormat = new Intl.NumberFormat("nb-NO", {
  maximumFractionDigits: 3,
});

const TRUMF_FILE = "data/kjøpstransaksjoner_per_handel_per_vare.json";
const PAGE_SIZE = 20;
const TOP_PRODUCTS = 25;

const CHAIN_RULES = [
  ["Mester Grønn", /mester grønn/i],
  ["Jacob's", /jacob/i],
  ["Norli", /norli/i],
  ["KIWI", /kiwi/i],
  ["MENY", /meny/i],
  ["Joker", /joker/i],
  ["Esso", /esso/i],
  ["SPAR", /spar/i],
  ["REMA 1000", /rema/i],
  ["OBS", /\bobs\b/i],
  ["Bunnpris", /bunnpris/i],
];

const CATEGORY_RULES = [
  ["Meieri", /melk|ost|yoghurt|smør|egg|norvegia|jarlsberg|rømme|fløte|kesam|skyr|o'?boy|cottage|brunost|gulost|baconost|kesam/i],
  ["Brød og korn", /brød|rundstyk|grove|loff|bagel|granola|korn|havre|müsli|spelt|knekkebrød|tortilla|wrap/i],
  ["Kjøtt", /kylling|kjøtt|bacon|skinke|pølse|biff|karbonade|kotelett|hamburger|salami|leverpostei|grillpølse|kjøttdeig/i],
  ["Sjømat", /laks|torsk|fisk|reke|sei|ørret|kaviar|fiskegrateng|makrell/i],
  ["Frukt og grønt", /banan|eple|tomat|potet|salat|avokado|agurk|løk|gulrot|appelsin|drue|bær|jordbær|paprika|brokkoli/i],
  ["Drikke", /juice|kaffe|brus|cola|vann|saft|smoothie|iste|øl|vin/i],
  ["Snacks og godteri", /sjokolade|potetgull|smash|chips|is |sørlandsis|kjeks|nøtter|cashew|godteri|snacks/i],
  ["Husholdning", /toalett|oppvask|tøyvask|såpe|tørkepapir|pose|tannkrem/i],
];

const PERIODS = {
  all: { label: "Alle" },
  "3y": { years: 3 },
  "1y": { years: 1 },
  "6m": { months: 6 },
  "1m": { months: 1 },
  "1w": { days: 7 },
  thisWeek: { thisWeek: true },
};

const statsEl = document.getElementById("stats");
const chainsEl = document.getElementById("chains");
const topEl = document.getElementById("top-lists");
const receiptsEl = document.getElementById("receipts");
const statusEl = document.getElementById("file-status");
const searchEl = document.getElementById("search");
const productSearchEl = document.getElementById("product-search");
const productHeadingEl = document.getElementById("product-heading");
const fileEl = document.getElementById("json-file");
const periodFiltersEl = document.getElementById("period-filters");

let allPurchases = [];
let purchases = [];
let productTotals = [];
let visibleCount = PAGE_SIZE;
let activePeriod = "all";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pick(object, keys, fallback = "") {
  for (const key of keys) {
    if (object && object[key] != null && object[key] !== "") {
      return object[key];
    }
  }
  return fallback;
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", ".").replace(/\s/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseDate(value) {
  const text = String(value).trim();
  const match = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (match) return new Date(`${match[3]}-${match[2]}-${match[1]}`);
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? new Date(0) : new Date(parsed);
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function startOfThisWeek() {
  const monday = startOfToday();
  const weekday = monday.getDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  monday.setDate(monday.getDate() - daysFromMonday);
  return monday;
}

function periodRange(periodId) {
  const period = PERIODS[periodId];
  if (!period || periodId === "all") {
    return { from: 0, to: Infinity };
  }

  if (period.thisWeek) {
    const from = startOfThisWeek();
    const to = startOfToday();
    to.setDate(to.getDate() + 1);
    return { from: from.getTime(), to: to.getTime() };
  }

  const from = startOfToday();
  if (period.years) from.setFullYear(from.getFullYear() - period.years);
  if (period.months) from.setMonth(from.getMonth() - period.months);
  if (period.days) from.setDate(from.getDate() - period.days);
  return { from: from.getTime(), to: Infinity };
}

function applyPeriod() {
  const range = periodRange(activePeriod);
  purchases = allPurchases.filter(
    (purchase) => purchase.dateValue >= range.from && purchase.dateValue < range.to
  );
  visibleCount = PAGE_SIZE;

  periodFiltersEl.querySelectorAll(".period-btn").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.period === activePeriod);
  });

  if (!purchases.length) {
    statsEl.innerHTML = '<p class="empty-note">Ingen kjøp i denne perioden.</p>';
    chainsEl.innerHTML = '<p class="empty-note">Ingen kjøp i denne perioden.</p>';
    topEl.innerHTML = '<p class="empty-note">Ingen kjøp i denne perioden.</p>';
    receiptsEl.innerHTML = '<p class="empty-note">Ingen kjøp i denne perioden.</p>';
    productTotals = [];
    return;
  }

  renderStats(purchases);
  renderTopLists(purchases);
  renderReceipts(purchases, searchEl.value.trim().toLowerCase());
}

function inferChain(store) {
  for (const [label, pattern] of CHAIN_RULES) {
    if (pattern.test(store)) return label;
  }
  return "Annet";
}

function inferCategory(name) {
  for (const [label, pattern] of CATEGORY_RULES) {
    if (pattern.test(name)) return label;
  }
  return "Annet";
}

function normalizeData(raw) {
  const list = Array.isArray(raw)
    ? raw
    : pick(raw, ["purchases", "kjop", "kjøp", "receipts", "transactions", "data"], []);

  if (!Array.isArray(list)) return [];

  return list.map((entry) => {
    const itemsRaw = pick(entry, ["varelinjer", "items", "linjer", "products", "varer"], []);
    const items = (Array.isArray(itemsRaw) ? itemsRaw : []).map((item) => {
      const name = String(pick(item, ["varenavn", "name", "navn", "produkt", "product", "title"], "Ukjent produkt"));
      const price = toNumber(pick(item, ["vareBelop", "price", "pris", "belop", "beløp", "amount", "sum"], 0));
      const quantity = toNumber(pick(item, ["vareAntallVekt", "quantity", "antall", "qty", "count"], 1)) || 1;
      return {
        name,
        category: String(pick(item, ["category", "kategori", "group"], inferCategory(name))),
        quantity,
        price,
      };
    });

    const itemTotal = items.reduce((sum, item) => sum + item.price, 0);
    const date = String(pick(entry, ["dato", "date", "timestamp", "time"], ""));
    const store = String(pick(entry, ["butikknavn", "store", "butikk", "merchant", "kjede", "sted"], "Ukjent butikk"));
    return {
      date,
      dateValue: parseDate(date).getTime(),
      store,
      chain: inferChain(store),
      total: toNumber(pick(entry, ["totaltBelop", "total", "sum", "belop", "beløp", "amount"], itemTotal)),
      items,
    };
  });
}

function sumBy(items, key) {
  const totals = new Map();
  for (const item of items) {
    const name = item[key] || "Ukjent";
    const current = totals.get(name) || { total: 0, quantity: 0 };
    current.total += item.price;
    current.quantity += item.quantity || 0;
    totals.set(name, current);
  }
  return [...totals.entries()]
    .map(([label, { total, quantity }]) => ({ label, total, quantity }))
    .sort((a, b) => b.total - a.total);
}

function allItems(list) {
  return list.flatMap((purchase) =>
    purchase.items.map((item) => ({
      ...item,
      date: purchase.date,
      store: purchase.store,
    }))
  );
}

function formatUnits(quantity) {
  if (!quantity) return "";
  const rounded = Math.round(quantity);
  if (Math.abs(quantity - rounded) < 0.001) {
    return `× ${rounded}`;
  }
  return `× ${quantityFormat.format(quantity)}`;
}

function withOther(rows, limit) {
  const top = rows.slice(0, limit);
  const otherTotal = rows.slice(limit).reduce((sum, row) => sum + row.total, 0);
  if (otherTotal > 0) {
    top.push({ label: "Annet", total: otherTotal, quantity: 0, rank: null, isOther: true });
  }
  return top;
}

function renderBars(rows, { numbered = false } = {}) {
  const scaleMax = numbered && productTotals[0]
    ? Math.max(productTotals[0].total, ...rows.map((row) => row.total), 1)
    : Math.max(...rows.map((row) => row.total), 1);
  const bars = rows
    .map((row) => {
      const width = Math.max(4, (row.total / scaleMax) * 100);
      const rank = numbered
        ? `<span class="bar-rank">${row.rank ? `${row.rank}.` : ""}</span>`
        : "";
      const units = numbered && row.quantity
        ? `<span class="bar-units">${escapeHtml(formatUnits(row.quantity))}</span>`
        : "";
      return `
        <div class="bar-row${numbered ? " numbered" : ""}${row.isOther ? " is-other" : ""}">
          ${rank}
          <p title="${escapeHtml(row.label)}">
            <span class="bar-name">${escapeHtml(row.label)}</span>
            ${units}
          </p>
          <span class="bar-amount">${money.format(row.total)}</span>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${width}%"></div>
          </div>
        </div>
      `;
    })
    .join("");

  return bars || '<p class="empty-note">Ingen data ennå.</p>';
}

function renderStats(list) {
  const items = allItems(list);
  const total = list.reduce((sum, purchase) => sum + purchase.total, 0);
  const top = sumBy(items, "name")[0];

  statsEl.innerHTML = `
    <article class="stat-card">
      <span>Totalt brukt</span>
      <strong>${money.format(total)}</strong>
    </article>
    <article class="stat-card">
      <span>Antall handlekurver</span>
      <strong>${list.length}</strong>
    </article>
    <article class="stat-card">
      <span>Antall produkter</span>
      <strong>${items.length}</strong>
    </article>
    <article class="stat-card">
      <span>Mest brukt på</span>
      <strong title="${top ? escapeHtml(top.label) : ""}">${top ? escapeHtml(top.label) : "—"}</strong>
    </article>
  `;
}

function sumChains(list) {
  const totals = new Map();
  for (const purchase of list) {
    totals.set(purchase.chain, (totals.get(purchase.chain) || 0) + purchase.total);
  }
  return [...totals.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);
}

function rankProducts(items) {
  return sumBy(items, "name").map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}

function renderProductList() {
  const query = productSearchEl.value.trim().toLowerCase();

  if (!query) {
    productHeadingEl.textContent = "Topp 25 produkter";
    topEl.innerHTML = renderBars(withOther(productTotals, TOP_PRODUCTS), { numbered: true });
    return;
  }

  const matches = productTotals.filter((row) => row.label.toLowerCase().includes(query));
  productHeadingEl.textContent = `Søketreff (${matches.length})`;

  if (!matches.length) {
    topEl.innerHTML = '<p class="empty-note">Ingen produkter matcher søket.</p>';
    return;
  }

  topEl.innerHTML = renderBars(matches, { numbered: true });
}

function renderTopLists(list) {
  productTotals = rankProducts(allItems(list));
  chainsEl.innerHTML = renderBars(sumChains(list));
  renderProductList();
}

function matchesSearch(purchase, query) {
  if (!query) return true;
  const haystack = [
    purchase.store,
    purchase.date,
    ...purchase.items.map((item) => item.name),
    ...purchase.items.map((item) => item.category),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function renderReceipts(list, query = "") {
  const filtered = list.filter((purchase) => matchesSearch(purchase, query));

  if (!filtered.length) {
    receiptsEl.innerHTML = '<p class="empty-note">Ingen treff i handlehistorikken.</p>';
    return;
  }

  const shown = filtered.slice(0, visibleCount);
  const remaining = filtered.length - shown.length;

  receiptsEl.innerHTML =
    shown
      .map((purchase) => {
        const rows = purchase.items
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.name)}</td>
                <td>${escapeHtml(item.category)}</td>
                <td>${quantityFormat.format(item.quantity)}</td>
                <td>${money.format(item.price)}</td>
              </tr>
            `
          )
          .join("");

        return `
          <details class="receipt">
            <summary>
              <strong>${escapeHtml(purchase.store)}</strong>
              <span class="receipt-meta">${escapeHtml(purchase.date)}</span>
              <span>${money.format(purchase.total)}</span>
            </summary>
            <table>
              <thead>
                <tr>
                  <th>Produkt</th>
                  <th>Kategori</th>
                  <th>Antall / vekt</th>
                  <th>Beløp</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </details>
        `;
      })
      .join("") +
    (remaining > 0
      ? `<button type="button" id="show-more" class="show-more">Vis flere (${remaining} gjenstår)</button>`
      : "");
}

function renderEmpty() {
  statsEl.innerHTML = '<p class="empty-note">Last inn en JSON-fil for å se oversikt.</p>';
  chainsEl.innerHTML = "";
  topEl.innerHTML = "";
  receiptsEl.innerHTML = "";
}

function showData(list, label) {
  allPurchases = list.sort((a, b) => b.dateValue - a.dateValue);
  statusEl.textContent = label;
  applyPeriod();
}

async function loadJson(source) {
  const raw = typeof source === "string" ? JSON.parse(source) : source;
  const list = normalizeData(raw);
  if (!list.length) {
    throw new Error("Fant ingen kjøp i filen. Feltnavnene må kanskje tilpasses.");
  }
  return list;
}

fileEl.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const list = await loadJson(text);
    showData(list, `Viser ${file.name} (${list.length} handlekurver).`);
  } catch (error) {
    statusEl.textContent = error.message || "Kunne ikke lese JSON-filen.";
    renderEmpty();
  }
});

searchEl.addEventListener("input", () => {
  visibleCount = PAGE_SIZE;
  renderReceipts(purchases, searchEl.value.trim().toLowerCase());
});

productSearchEl.addEventListener("input", () => {
  renderProductList();
});

periodFiltersEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-period]");
  if (!button || !allPurchases.length) return;
  activePeriod = button.dataset.period;
  applyPeriod();
});

receiptsEl.addEventListener("click", (event) => {
  if (event.target.id !== "show-more") return;
  visibleCount += PAGE_SIZE;
  renderReceipts(purchases, searchEl.value.trim().toLowerCase());
});

async function tryLoadTrumfFile() {
  try {
    const response = await fetch(encodeURI(TRUMF_FILE));
    if (response.ok) {
      const list = await loadJson(await response.json());
      showData(list, `Viser Trumf-data (${list.length} handlekurver).`);
      return;
    }
  } catch {
    // Fall through to the example file if the Trumf export is missing.
  }

  try {
    const response = await fetch("data/trumf.eksempel.json");
    if (!response.ok) return;
    const list = await loadJson(await response.json());
    showData(list, `Viser eksempeldata (${list.length} handlekurver). Last inn din egen JSON når du har den.`);
  } catch {
    renderEmpty();
  }
}

renderEmpty();
tryLoadTrumfFile();
