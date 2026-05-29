import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { TRACKED_ASSETS } from "./src/data";
import type { MarketAsset, MarketDataResponse } from "./src/types";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

function getNvidiaModel() {
  return process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct";
}

function getNvidiaBaseUrl() {
  return (process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
}

function getAiErrorMessage(error: any): string {
  return error?.message || error?.error?.message || String(error || "AI request failed");
}

function isRecoverableAiError(error: any): boolean {
  const message = getAiErrorMessage(error).toLowerCase();
  return (
    message.includes("429") ||
    message.includes("quota") ||
    message.includes("resource_exhausted") ||
    message.includes("rate limit") ||
    message.includes("timeout") ||
    message.includes("temporarily")
  );
}

function chatFallbackResponse(message = "") {
  const asset = (message.match(/\b[A-Z]{2,5}\b/) || ["AAPL"])[0];
  return {
    text: `AI fallback for ${asset}: market structure is available from the local data feed, while the NVIDIA inference endpoint is temporarily unavailable.`,
    summary: `${asset} analysis is running in local fallback mode. Refresh again after the provider becomes available.`,
    technicalView: "Live quote data remains active where providers are configured. AI-generated technical details are paused.",
    riskFactors: "Do not treat fallback commentary as investment advice. Confirm market data and AI provider status before making decisions.",
    fallback: true
  };
}

function portfolioFallbackResponse() {
  return {
    concentrationText: "Portfolio AI review is running in fallback mode because the NVIDIA inference endpoint is temporarily unavailable. Check concentration by sector and avoid over-weighting one asset class.",
    optimizationIdea: "Consider rebalancing oversized positions and keeping defensive or broad-market exposure until AI inference is available again.",
    fallback: true
  };
}

function newsFallbackResponse(symbol?: string) {
  return {
    summary: `FinPilot fallback summary: ${symbol || "This asset"} has live market data available, but AI headline context is temporarily paused until NVIDIA inference is available.`,
    fallback: true
  };
}

function parseJsonObject(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("AI response did not contain valid JSON");
  }
}

async function callNvidiaChat<T>(
  messages: Array<{ role: "system" | "user"; content: string }>,
  fallback: T,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<T> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) {
    return fallback;
  }

  const response = await fetchJson<any>(`${getNvidiaBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: getNvidiaModel(),
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 700,
      response_format: { type: "json_object" }
    })
  });

  const content = response?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("NVIDIA response did not include message content");
  }

  return parseJsonObject(content) as T;
}

const MARKET_CACHE_TTL_MS = Number(process.env.MARKET_CACHE_TTL_MS || 60000);
const MARKET_REQUEST_TIMEOUT_MS = Number(process.env.MARKET_REQUEST_TIMEOUT_MS || 8000);
const MARKET_DB_PATH = process.env.MARKET_DB_PATH || path.join(process.cwd(), "data", "finpilot-market.sqlite");
const MARKET_VISIBLE_CATEGORIES = new Set(
  (process.env.MARKET_VISIBLE_CATEGORIES || "US,Crypto,ETFs")
    .split(",")
    .map(category => category.trim())
    .filter(Boolean)
);

const CRYPTO_ID_BY_SYMBOL: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple"
};

let marketDataCache: { timestamp: number; payload: MarketDataResponse } | null = null;
let marketDb: any | null = null;
let databaseCtor: any | null = null;

async function getDatabaseCtor() {
  if (!databaseCtor) {
    const sqliteSpecifier = "node:sqlite";
    const sqliteModule = await import(sqliteSpecifier);
    databaseCtor = (sqliteModule as any).DatabaseSync;
  }
  return databaseCtor;
}

async function getMarketDb() {
  if (!marketDb) {
    fs.mkdirSync(path.dirname(MARKET_DB_PATH), { recursive: true });
    const DatabaseSync = await getDatabaseCtor();
    marketDb = new DatabaseSync(MARKET_DB_PATH);
    marketDb.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS market_assets (
        symbol TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        currency_symbol TEXT NOT NULL DEFAULT '$',
        price REAL NOT NULL DEFAULT 0,
        change_percent REAL NOT NULL DEFAULT 0,
        market_cap TEXT NOT NULL DEFAULT 'N/A',
        pe_ratio TEXT NOT NULL DEFAULT 'N/A',
        volume TEXT NOT NULL DEFAULT 'N/A',
        provider TEXT NOT NULL DEFAULT 'configured',
        data_quality TEXT NOT NULL DEFAULT 'unfetched',
        updated_at TEXT
      );
      UPDATE market_assets
      SET price = 0,
          change_percent = 0,
          market_cap = 'N/A',
          pe_ratio = 'N/A',
          volume = 'N/A',
          provider = 'configured',
          data_quality = 'unfetched',
          updated_at = NULL
      WHERE data_quality = 'seed' OR provider = 'seed';
      CREATE TABLE IF NOT EXISTS market_quote_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        price REAL NOT NULL,
        change_percent REAL NOT NULL,
        market_cap TEXT,
        pe_ratio TEXT,
        volume TEXT,
        provider TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_market_quote_snapshots_symbol_time
        ON market_quote_snapshots(symbol, fetched_at DESC);
    `);
    initializeAssetUniverse(marketDb);
  }

  return marketDb;
}

function initializeAssetUniverse(db: any) {
  const insert = db.prepare(`
    INSERT INTO market_assets (
      symbol, name, category, currency_symbol, price, change_percent,
      market_cap, pe_ratio, volume, provider, data_quality, updated_at
    )
    VALUES (?, ?, ?, ?, 0, 0, 'N/A', 'N/A', 'N/A', 'configured', 'unfetched', NULL)
    ON CONFLICT(symbol) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      currency_symbol = excluded.currency_symbol,
      price = CASE
        WHEN market_assets.data_quality IN ('live', 'cached') THEN market_assets.price
        ELSE 0
      END,
      change_percent = CASE
        WHEN market_assets.data_quality IN ('live', 'cached') THEN market_assets.change_percent
        ELSE 0
      END,
      market_cap = CASE
        WHEN market_assets.data_quality IN ('live', 'cached') THEN market_assets.market_cap
        ELSE 'N/A'
      END,
      pe_ratio = CASE
        WHEN market_assets.data_quality IN ('live', 'cached') THEN market_assets.pe_ratio
        ELSE 'N/A'
      END,
      volume = CASE
        WHEN market_assets.data_quality IN ('live', 'cached') THEN market_assets.volume
        ELSE 'N/A'
      END,
      provider = CASE
        WHEN market_assets.data_quality IN ('live', 'cached') THEN market_assets.provider
        ELSE 'configured'
      END,
      data_quality = CASE
        WHEN market_assets.data_quality IN ('live', 'cached') THEN market_assets.data_quality
        ELSE 'unfetched'
      END,
      updated_at = CASE
        WHEN market_assets.data_quality IN ('live', 'cached') THEN market_assets.updated_at
        ELSE NULL
      END
  `);

  for (const asset of TRACKED_ASSETS) {
    insert.run(
      asset.symbol,
      asset.name,
      asset.category,
      asset.currencySymbol || "$"
    );
  }

  const activeSymbols = TRACKED_ASSETS.map(asset => asset.symbol);
  const placeholders = activeSymbols.map(() => "?").join(",");
  db.prepare(`DELETE FROM market_assets WHERE symbol NOT IN (${placeholders})`).run(...activeSymbols);
  db.prepare(`DELETE FROM market_quote_snapshots WHERE symbol NOT IN (${placeholders})`).run(...activeSymbols);
}

function rowToMarketAsset(row: any): MarketAsset {
  return {
    symbol: row.symbol,
    name: row.name,
    price: Number(row.price || 0),
    currencySymbol: row.currency_symbol || "$",
    changePercent: Number(row.change_percent || 0),
    marketCap: row.market_cap || "N/A",
    peRatio: row.pe_ratio || "N/A",
    volume: row.volume || "N/A",
    category: row.category,
    provider: row.provider,
    dataQuality: row.data_quality,
    updatedAt: row.updated_at
  };
}

async function readMarketAssetsFromDatabase(includeUnfetched = false): Promise<MarketAsset[]> {
  const db = await getMarketDb();
  const rows = db.prepare(`
    SELECT symbol, name, category, currency_symbol, price, change_percent,
           market_cap, pe_ratio, volume, provider, data_quality, updated_at
    FROM market_assets
    ORDER BY
      CASE category
        WHEN 'US' THEN 1
        WHEN 'Crypto' THEN 2
        WHEN 'Vietnam' THEN 3
        ELSE 4
      END,
      symbol
  `).all();

  return rows
    .map(rowToMarketAsset)
    .filter(asset => MARKET_VISIBLE_CATEGORIES.has(asset.category))
    .filter(asset => includeUnfetched || asset.dataQuality === "live" || asset.dataQuality === "cached");
}

async function persistMarketAsset(asset: MarketAsset, provider: string, dataQuality: MarketAsset["dataQuality"] = "live") {
  const db = await getMarketDb();
  const fetchedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO market_assets (
      symbol, name, category, currency_symbol, price, change_percent,
      market_cap, pe_ratio, volume, provider, data_quality, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      currency_symbol = excluded.currency_symbol,
      price = excluded.price,
      change_percent = excluded.change_percent,
      market_cap = excluded.market_cap,
      pe_ratio = excluded.pe_ratio,
      volume = excluded.volume,
      provider = excluded.provider,
      data_quality = excluded.data_quality,
      updated_at = excluded.updated_at
  `).run(
    asset.symbol,
    asset.name,
    asset.category,
    asset.currencySymbol || "$",
    asset.price,
    asset.changePercent,
    asset.marketCap,
    asset.peRatio,
    asset.volume,
    provider,
    dataQuality,
    fetchedAt
  );

  if (dataQuality === "live") {
    db.prepare(`
      INSERT INTO market_quote_snapshots (
        symbol, price, change_percent, market_cap, pe_ratio, volume, provider, fetched_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      asset.symbol,
      asset.price,
      asset.changePercent,
      asset.marketCap,
      asset.peRatio,
      asset.volume,
      provider,
      fetchedAt
    );
  }
}

async function getMarketDbStatus() {
  const db = await getMarketDb();
  const assetCount = db.prepare("SELECT COUNT(*) AS count FROM market_assets").get().count;
  const snapshotCount = db.prepare("SELECT COUNT(*) AS count FROM market_quote_snapshots").get().count;

  return {
    assetCount,
    snapshotCount,
    path: path.relative(process.cwd(), MARKET_DB_PATH)
  };
}

function normalizePercent(value: unknown): number {
  const parsed = typeof value === "string"
    ? Number(value.replace("%", "").trim())
    : Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function normalizePrice(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value >= 1) return Number(value.toFixed(2));
  return Number(value.toPrecision(6));
}

function formatCompactNumber(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "N/A";

  const abs = Math.abs(parsed);
  const units = [
    { suffix: "T", value: 1_000_000_000_000 },
    { suffix: "B", value: 1_000_000_000 },
    { suffix: "M", value: 1_000_000 },
    { suffix: "K", value: 1_000 }
  ];

  const unit = units.find(item => abs >= item.value);
  if (!unit) return parsed.toLocaleString("en-US", { maximumFractionDigits: 0 });

  const compact = parsed / unit.value;
  const decimals = Math.abs(compact) >= 100 ? 0 : Math.abs(compact) >= 10 ? 1 : 2;
  return `${compact.toFixed(decimals).replace(/\.0+$/, "")}${unit.suffix}`;
}

function formatRatio(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed.toFixed(1) : "N/A";
}

function currencyToSymbol(currency?: string): string {
  const normalized = (currency || "").toUpperCase();
  if (normalized === "VND") return "đ";
  if (normalized === "EUR") return "€";
  if (normalized === "GBP") return "£";
  return "$";
}

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MARKET_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCryptoQuotes(assets: MarketAsset[]) {
  const cryptoAssets = assets.filter(asset => asset.category === "Crypto" && CRYPTO_ID_BY_SYMBOL[asset.symbol]);
  const ids = cryptoAssets.map(asset => CRYPTO_ID_BY_SYMBOL[asset.symbol]);
  const updates = new Map<string, MarketAsset>();
  const coingeckoApiKey = process.env.COINGECKO_API_KEY || process.env.COINGECKO_DEMO_API_KEY;
  const provider = coingeckoApiKey ? "coingecko demo" : "coingecko public";

  if (ids.length === 0) {
    return { updates, errors: [] as string[], provider };
  }

  const url =
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids.join(","))}` +
    "&order=market_cap_desc&per_page=250&page=1&price_change_percentage=24h&precision=full";

  try {
    const data = await fetchJson<Array<Record<string, any>>>(url, {
      headers: coingeckoApiKey ? { "x-cg-demo-api-key": coingeckoApiKey } : {}
    });
    const byId = new Map(data.map(coin => [coin.id, coin]));

    for (const asset of cryptoAssets) {
      const coinId = CRYPTO_ID_BY_SYMBOL[asset.symbol];
      const quote = byId.get(coinId);
      const price = quote?.current_price;

      if (!Number.isFinite(price)) continue;

      updates.set(asset.symbol, {
        ...asset,
        name: quote.name || asset.name,
        price: normalizePrice(price),
        changePercent: normalizePercent(quote.price_change_percentage_24h),
        marketCap: formatCompactNumber(quote.market_cap),
        volume: formatCompactNumber(quote.total_volume),
        currencySymbol: "$"
      });
    }

    return { updates, errors: [] as string[], provider };
  } catch (error: any) {
    return {
      updates,
      errors: [`CoinGecko crypto feed unavailable: ${error.message || "request failed"}`],
      provider
    };
  }
}

function getStockProvider() {
  if (process.env.FINNHUB_API_KEY) return "finnhub";
  if (process.env.ALPHA_VANTAGE_API_KEY) return "alpha_vantage";
  return "unconfigured";
}

async function fetchFinnhubRawQuote(symbol: string) {
  const token = process.env.FINNHUB_API_KEY;
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(token || "")}`;
  return fetchJson<{ c?: number; dp?: number; pc?: number }>(url);
}

async function fetchFinnhubProfile(symbol: string) {
  const token = process.env.FINNHUB_API_KEY;
  const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(token || "")}`;
  return fetchJson<Record<string, any>>(url);
}

async function fetchFinnhubMetrics(symbol: string) {
  const token = process.env.FINNHUB_API_KEY;
  const url = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${encodeURIComponent(token || "")}`;
  return fetchJson<{ metric?: Record<string, any> }>(url);
}

async function fetchAlphaVantageGlobalQuote(symbol: string) {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  const url =
    "https://www.alphavantage.co/query?function=GLOBAL_QUOTE" +
    `&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey || "")}`;
  const data = await fetchJson<Record<string, any>>(url);

  if (data.Note || data.Information || data["Error Message"]) {
    throw new Error(String(data.Note || data.Information || data["Error Message"]));
  }

  const quote = data["Global Quote"];
  const price = Number(quote?.["05. price"]);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`empty quote for ${symbol}`);
  }

  return {
    price,
    changePercent: normalizePercent(quote?.["10. change percent"]),
    volume: quote?.["06. volume"] ? formatCompactNumber(quote["06. volume"]) : "N/A"
  };
}

async function fetchAlphaVantageQuote(asset: MarketAsset): Promise<{ asset: MarketAsset; provider: string }> {
  const quote = await fetchAlphaVantageGlobalQuote(asset.symbol);
  return {
    provider: "alpha_vantage",
    asset: {
      ...asset,
      price: normalizePrice(quote.price),
      changePercent: quote.changePercent,
      volume: quote.volume
    }
  };
}

async function fetchFinnhubQuote(asset: MarketAsset): Promise<{ asset: MarketAsset; provider: string }> {
  const requests: Promise<any>[] = [
    fetchFinnhubRawQuote(asset.symbol),
    fetchFinnhubProfile(asset.symbol),
    fetchFinnhubMetrics(asset.symbol)
  ];

  if (process.env.ALPHA_VANTAGE_API_KEY) {
    requests.push(fetchAlphaVantageGlobalQuote(asset.symbol));
  }

  const [quoteResult, profileResult, metricsResult, alphaResult] = await Promise.allSettled(requests);
  const quote = quoteResult.status === "fulfilled" ? quoteResult.value : null;
  const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
  const metrics = metricsResult.status === "fulfilled" ? metricsResult.value?.metric || {} : {};
  const alphaQuote = alphaResult?.status === "fulfilled" ? alphaResult.value : null;
  const price = Number(quote?.c || alphaQuote?.price);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`empty quote for ${asset.symbol}`);
  }

  const marketCapMillions = Number(profile?.marketCapitalization || metrics.marketCapitalization);
  const peRatio = metrics.peBasicExclExtraTTM || metrics.peNormalizedAnnual || metrics.peTTM;
  const averageVolume = metrics["10DayAverageTradingVolume"] || metrics["3MonthAverageTradingVolume"];

  return {
    provider: alphaQuote ? "finnhub+alpha_vantage" : "finnhub",
    asset: {
      ...asset,
      name: profile?.name || asset.name,
      price: normalizePrice(price),
      currencySymbol: currencyToSymbol(profile?.currency),
      changePercent: normalizePercent(quote?.dp ?? alphaQuote?.changePercent),
      marketCap: Number.isFinite(marketCapMillions) && marketCapMillions > 0
        ? formatCompactNumber(marketCapMillions * 1_000_000)
        : asset.marketCap,
      peRatio: formatRatio(peRatio) !== "N/A" ? formatRatio(peRatio) : asset.peRatio,
      volume: alphaQuote?.volume && alphaQuote.volume !== "N/A"
        ? alphaQuote.volume
        : Number.isFinite(Number(averageVolume))
          ? formatCompactNumber(Number(averageVolume) * 1_000_000)
          : asset.volume
    }
  };
}

async function fetchStockQuotes(assets: MarketAsset[]) {
  const provider = getStockProvider();
  const stockAssets = assets.filter(asset => asset.category === "US" || asset.category === "ETFs");
  const updates = new Map<string, MarketAsset>();
  const providers = new Map<string, string>();
  const errors: string[] = [];

  if (provider === "unconfigured" || stockAssets.length === 0) {
    return {
      updates,
      errors,
      status: provider === "unconfigured" ? "unconfigured: set FINNHUB_API_KEY or ALPHA_VANTAGE_API_KEY" : "not configured"
    };
  }

  const fetchQuote = provider === "finnhub" ? fetchFinnhubQuote : fetchAlphaVantageQuote;
  const results = await Promise.allSettled(stockAssets.map(asset => fetchQuote(asset)));

  results.forEach((result, index) => {
    const symbol = stockAssets[index].symbol;
    if (result.status === "fulfilled") {
      updates.set(symbol, result.value.asset);
      providers.set(symbol, result.value.provider);
    } else {
      errors.push(`${provider} stock feed failed for ${symbol}: ${result.reason?.message || "request failed"}`);
    }
  });

  return {
    updates,
    providers,
    errors,
    status: provider
  };
}

async function getMarketSnapshot(forceRefresh = false): Promise<MarketDataResponse> {
  const now = Date.now();

  if (!forceRefresh && marketDataCache && now - marketDataCache.timestamp < MARKET_CACHE_TTL_MS) {
    return marketDataCache.payload;
  }

  const baseAssets = await readMarketAssetsFromDatabase(true);
  const [cryptoResult, stockResult] = await Promise.all([
    fetchCryptoQuotes(baseAssets),
    fetchStockQuotes(baseAssets)
  ]);

  const errors = [...cryptoResult.errors, ...stockResult.errors];
  const mergedAssets = baseAssets.map(asset => (
    cryptoResult.updates.get(asset.symbol) ||
    stockResult.updates.get(asset.symbol) ||
    asset
  ));

  for (const [symbol, asset] of cryptoResult.updates) {
    await persistMarketAsset(asset, cryptoResult.provider, "live");
  }

  for (const [symbol, asset] of stockResult.updates) {
    await persistMarketAsset(asset, stockResult.providers.get(symbol) || stockResult.status, "live");
  }

  const storedAssets = await readMarketAssetsFromDatabase();
  const databaseStatus = await getMarketDbStatus();
  const liveSymbols = new Set<string>([
    ...cryptoResult.updates.keys(),
    ...stockResult.updates.keys()
  ]);

  const source = liveSymbols.size === 0
    ? storedAssets.length > 0
      ? "cached"
      : "empty"
    : liveSymbols.size === storedAssets.length
      ? "live"
      : "mixed";

  const payload: MarketDataResponse = {
    assets: storedAssets,
    updatedAt: new Date().toISOString(),
    source,
    stale: liveSymbols.size === 0,
    errors,
    providerStatus: {
      stocks: stockResult.status,
      crypto: cryptoResult.updates.size > 0 ? cryptoResult.provider : "cached",
      vietnam: MARKET_VISIBLE_CATEGORIES.has("Vietnam")
        ? "unconfigured: add a licensed Vietnam market-data vendor"
        : "hidden",
      database: `sqlite: ${databaseStatus.path} (${databaseStatus.assetCount} assets, ${databaseStatus.snapshotCount} snapshots)`
    }
  };

  marketDataCache = { timestamp: now, payload };
  return payload;
}

// Market quotes are served from the backend so provider keys never leak to the browser.
app.get("/api/market-data", async (req, res) => {
  try {
    const forceRefresh = req.query.force === "true";
    const snapshot = await getMarketSnapshot(forceRefresh);
    const symbols = typeof req.query.symbols === "string"
      ? new Set(req.query.symbols.split(",").map(symbol => symbol.trim().toUpperCase()).filter(Boolean))
      : null;

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ...snapshot,
      assets: symbols ? snapshot.assets.filter(asset => symbols.has(asset.symbol)) : snapshot.assets
    });
  } catch (error: any) {
    console.error("Market Data Error:", error);
    res.status(500).json({ error: error.message || "Failed to load market data" });
  }
});

app.get("/api/market-db/status", async (_req, res) => {
  try {
    const status = await getMarketDbStatus();
    res.setHeader("Cache-Control", "no-store");
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to load market database status" });
  }
});

// 1. API Endpoint: Technical & Market Analysis Chat
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const systemInstruction =
      "You are FinPilot AI, an elite financial intelligence and technical/fundamental market analysis advisor. " +
      "Analyze the user's question. If the user asks about an asset, portfolio, or market event, generate a highly structured analysis. " +
      "Return only JSON with keys: text, summary, technicalView, riskFactors. Do not include markdown fences.";

    const parsedData = await callNvidiaChat(
      [
        { role: "system", content: systemInstruction },
        { role: "user", content: message }
      ],
      chatFallbackResponse(message),
      { maxTokens: 700 }
    );
    res.json(parsedData);
  } catch (error: any) {
    const message = getAiErrorMessage(error);
    console.error("NVIDIA Chat Error:", message);
    if (isRecoverableAiError(error)) {
      return res.json(chatFallbackResponse(req.body?.message));
    }
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// 2. API Endpoint: Smart Portfolio Review
app.post("/api/portfolio-review", async (req, res) => {
  try {
    const { holdings } = req.body; // Array of { asset, name, qty, avgCost, currentPrice }
    
    if (!holdings || holdings.length === 0) {
      return res.json({
        concentrationText: "No portfolio holdings were submitted.",
        optimizationIdea: "Add at least one live-priced holding before requesting an AI portfolio review."
      });
    }

    const portfolioString = holdings.map((h: any) => `${h.name} (${h.asset}): Qty ${h.qty}, Avg Cost $${h.avgCost}, Current Price $${h.currentPrice}`).join("; ");

    const systemInstruction =
      "You are FinPilot AI portfolio optimizer. Analyze the provided user portfolio and suggest rebalancing advice " +
      "specifically calling out direct percentage concentration, sectors, and clear optimization strategies in JSON format. " +
      "Be professional and direct, focusing on smart risk mitigation. Return only JSON with keys: concentrationText, optimizationIdea.";

    const parsedData = await callNvidiaChat(
      [
        { role: "system", content: systemInstruction },
        { role: "user", content: `Analyze this portfolio: ${portfolioString}` }
      ],
      portfolioFallbackResponse(),
      { maxTokens: 500 }
    );
    res.json(parsedData);
  } catch (error: any) {
    const message = getAiErrorMessage(error);
    console.error("NVIDIA Portfolio Review Error:", message);
    if (isRecoverableAiError(error)) {
      return res.json(portfolioFallbackResponse());
    }
    res.status(500).json({ error: error.message || "Failed to analyze portfolio" });
  }
});

// 3. API Endpoint: Ticker/News Summarizer
app.post("/api/summarize-news", async (req, res) => {
  try {
    const { title, source, symbol } = req.body;
    const prompt = `Summarize and provide institutional investor context for this news article: "${title}" by ${source || "analysts"} concerning ${symbol || "the asset"}. Keep the response under 60 words.`;

    const parsedData = await callNvidiaChat(
      [
        {
          role: "system",
          content: "You are an institutional financial analyst. Provide a swift, dense summary and technical implications of news headlines. Return only JSON with key: summary."
        },
        { role: "user", content: prompt }
      ],
      newsFallbackResponse(symbol),
      { maxTokens: 220 }
    );

    res.json(parsedData);
  } catch (error: any) {
    const message = getAiErrorMessage(error);
    console.error("NVIDIA Summarize Error:", message);
    if (isRecoverableAiError(error)) {
      return res.json(newsFallbackResponse(req.body?.symbol));
    }
    res.status(500).json({ error: error.message });
  }
});

// Vite Middleware for development mode
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Serve index.html for all SPA routes in Express v4
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FinPilot AI Server listening at http://localhost:${PORT}`);
  });
}

startServer();
