import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { TRACKED_ASSETS } from "./src/data";
import type {
  AIPrediction,
  MarketAsset,
  MarketDataResponse,
  PredictionDriver,
  PredictionHorizon,
  PredictionScenario,
  PredictionSignal
} from "./src/types";

type HistoricalPricePoint = {
  date: string;
  fullDate: string;
  price: number;
};

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

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
    }),
    timeoutMs: 60000
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
  USDT: "tether",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  USDC: "usd-coin",
  ADA: "cardano",
  AVAX: "avalanche-2",
  DOGE: "dogecoin",
  DOT: "polkadot",
  TRX: "tron",
  LINK: "chainlink",
  MATIC: "matic-network",
  TON: "the-open-network",
  SHIB: "shiba-inu",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  UNI: "uniswap",
  ATOM: "cosmos"
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
        updated_at TEXT,
        logo TEXT
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

      CREATE TABLE IF NOT EXISTS user_watchlist (
        symbol TEXT PRIMARY KEY,
        added_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_holdings (
        id TEXT PRIMARY KEY,
        asset TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        qty REAL NOT NULL,
        avg_cost REAL NOT NULL,
        added_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_alerts (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        target_price REAL NOT NULL,
        condition TEXT NOT NULL,
        is_triggered INTEGER NOT NULL DEFAULT 0,
        added_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        time_label TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        summary TEXT,
        technical_view TEXT,
        risk_factors TEXT,
        FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      );

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
    updatedAt: row.updated_at,
    logo: row.logo
  };
}

async function readMarketAssetsFromDatabase(includeUnfetched = false): Promise<MarketAsset[]> {
  const db = await getMarketDb();
  const rows = db.prepare(`
    SELECT symbol, name, category, currency_symbol, price, change_percent,
           market_cap, pe_ratio, volume, provider, data_quality, updated_at, logo
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
      market_cap, pe_ratio, volume, provider, data_quality, updated_at, logo
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      updated_at = excluded.updated_at,
      logo = excluded.logo
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
    fetchedAt,
    asset.logo || null
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

async function fetchJson<T>(url: string, options: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? MARKET_REQUEST_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundNumber(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = mean(values.map(value => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function percentChange(from: number, to: number): number {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0) return 0;
  return ((to - from) / from) * 100;
}

function averagePrice(prices: number[], length: number): number {
  const slice = prices.slice(-length);
  return slice.length > 0 ? mean(slice) : 0;
}

function calculateRsi(prices: number[], period = 14): number {
  if (prices.length <= period) return 50;

  let gains = 0;
  let losses = 0;
  const start = prices.length - period;

  for (let i = start; i < prices.length; i++) {
    const delta = prices[i] - prices[i - 1];
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }

  const averageGain = gains / period;
  const averageLoss = losses / period;
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;

  const relativeStrength = averageGain / averageLoss;
  return roundNumber(100 - (100 / (1 + relativeStrength)), 1);
}

function calculateMaxDrawdown(prices: number[]): number {
  let peak = prices[0] || 0;
  let maxDrawdown = 0;

  for (const price of prices) {
    if (price > peak) peak = price;
    if (peak > 0) {
      maxDrawdown = Math.min(maxDrawdown, percentChange(peak, price));
    }
  }

  return Math.abs(maxDrawdown);
}

function predictionHorizonDays(horizon: PredictionHorizon): number {
  if (horizon === "1D") return 1;
  if (horizon === "1W") return 5;
  if (horizon === "3M") return 63;
  return 21;
}

function historicalRangeForPrediction(horizon: PredictionHorizon): string {
  if (horizon === "1D" || horizon === "1W") return "3M";
  if (horizon === "3M") return "1Y";
  return "6M";
}

function formatFutureDate(index: number, totalPoints: number, horizonDays: number): string {
  const step = Math.max(1, Math.round((horizonDays / Math.max(totalPoints - 1, 1)) * index));
  const date = new Date();
  date.setDate(date.getDate() + step);
  if (horizonDays <= 7) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getPredictionSignal(score: number): PredictionSignal {
  if (score >= 58) return "Bullish";
  if (score <= 42) return "Bearish";
  return "Neutral";
}

function getPredictionRecommendation(score: number, confidence: number): string {
  if (score >= 68 && confidence >= 62) return "Tactical Buy";
  if (score >= 58) return "Accumulate";
  if (score <= 32 && confidence >= 62) return "Risk-Off";
  if (score <= 42) return "Reduce";
  return "Hold / Wait";
}

function driverStance(value: number, positiveThreshold: number, negativeThreshold: number): PredictionDriver["stance"] {
  if (value >= positiveThreshold) return "positive";
  if (value <= negativeThreshold) return "negative";
  return "neutral";
}

function buildDeterministicNarrative(
  asset: MarketAsset,
  signal: PredictionSignal,
  horizon: PredictionHorizon,
  expectedMovePercent: number,
  confidence: number
) {
  return {
    thesis: `${asset.symbol} shows a ${signal.toLowerCase()} ${horizon} setup with an expected move of ${expectedMovePercent >= 0 ? "+" : ""}${expectedMovePercent.toFixed(2)}% and ${confidence}% model confidence.`,
    actionPlan: signal === "Bullish"
      ? "Favor staged entries near support and avoid chasing extended intraday spikes."
      : signal === "Bearish"
        ? "Prioritize capital protection, trim exposure into strength, and wait for stabilization before adding."
        : "Keep position sizing moderate until momentum, volume, and trend alignment improve.",
    riskControls: "Use live market data, confirm liquidity, and size every trade so a stop-loss event does not damage portfolio-level risk."
  };
}

async function getHistoricalPriceData(symbol: string, range = "1M"): Promise<{
  asset: MarketAsset;
  data: HistoricalPricePoint[];
  isSimulated: boolean;
}> {
  const normalizedRange = ["1W", "1M", "3M", "6M", "1Y", "ALL"].includes(range) ? range : "1M";
  let days: string | number = 30;
  if (normalizedRange === "1W") days = 7;
  else if (normalizedRange === "3M") days = 90;
  else if (normalizedRange === "6M") days = 180;
  else if (normalizedRange === "1Y") days = 365;
  else if (normalizedRange === "ALL") days = "max";

  const formatDate = (d: Date) => {
    if (normalizedRange === "1W") return d.toLocaleDateString("en-US", { weekday: "short" });
    if (normalizedRange === "1Y" || normalizedRange === "ALL") return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatFullDate = (d: Date) => (
    d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
  );

  const db = await getMarketDb();
  const row = db.prepare("SELECT * FROM market_assets WHERE symbol = ?").get(symbol);

  if (!row) {
    throw new Error("Asset not found");
  }

  const asset = rowToMarketAsset(row);
  const isCrypto = row.category === "Crypto";
  let data: HistoricalPricePoint[] = [];
  let isSimulated = false;

  try {
    if (isCrypto) {
      const coinId = CRYPTO_ID_BY_SYMBOL[symbol];
      if (coinId) {
        const coingeckoApiKey = process.env.COINGECKO_API_KEY || process.env.COINGECKO_DEMO_API_KEY;
        const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;
        const response = await fetchJson<any>(url, {
          headers: coingeckoApiKey ? { "x-cg-demo-api-key": coingeckoApiKey } : {}
        });

        if (response.prices && Array.isArray(response.prices)) {
          const mapped: HistoricalPricePoint[] = response.prices.map((p: [number, number]) => ({
            date: formatDate(new Date(p[0])),
            fullDate: formatFullDate(new Date(p[0])),
            price: normalizePrice(p[1])
          }));

          const uniqueData: HistoricalPricePoint[] = [];
          const seen = new Set<string>();
          for (let i = mapped.length - 1; i >= 0; i--) {
            if (!seen.has(mapped[i].date)) {
              seen.add(mapped[i].date);
              uniqueData.unshift(mapped[i]);
            }
          }
          data = uniqueData;
        }
      }
    } else {
      let yahooRange = "1mo";
      let yahooInterval = "1d";

      if (normalizedRange === "1W") yahooRange = "5d";
      else if (normalizedRange === "3M") yahooRange = "3mo";
      else if (normalizedRange === "6M") yahooRange = "6mo";
      else if (normalizedRange === "1Y") {
        yahooRange = "1y";
        yahooInterval = "1wk";
      } else if (normalizedRange === "ALL") {
        yahooRange = "max";
        yahooInterval = "1mo";
      }

      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${yahooInterval}&range=${yahooRange}`;
      const response = await fetchJson<any>(url);

      if (response.chart?.result?.[0]) {
        const result = response.chart.result[0];
        const timestamps = result.timestamp;
        const closePrices = result.indicators.quote[0].close;

        if (timestamps && closePrices) {
          data = timestamps
            .map((ts: number, i: number) => {
              if (closePrices[i] === null) return null;
              const date = new Date(ts * 1000);
              return {
                date: formatDate(date),
                fullDate: formatFullDate(date),
                price: normalizePrice(closePrices[i])
              };
            })
            .filter((item: HistoricalPricePoint | null): item is HistoricalPricePoint => item !== null);
        }
      }
    }
  } catch (apiError: any) {
    console.warn(`Real historical data fetch failed for ${symbol}: ${apiError.message}. Falling back to simulated.`);
  }

  if (data.length === 0) {
    isSimulated = true;
    const currentPrice = Number(row.price || 0);
    const changePercent = Number(row.change_percent || 0);
    let backVal = currentPrice > 0 ? currentPrice / (1 + changePercent / 100) : 100;
    const volatility = Math.max(backVal * 0.018, 0.5);
    const simDays = typeof days === "number" ? days : 1825;

    for (let i = simDays - 1; i >= 1; i--) {
      const drift = (changePercent / 100) / Math.max(simDays, 1);
      const randomShock = (Math.sin(i * 1.37) + Math.cos(i * 0.73)) * volatility * 0.22;
      backVal = Math.max(backVal * (1 + drift) + randomShock, Math.max(currentPrice * 0.1, 1));
      const d = new Date();
      d.setDate(d.getDate() - i);
      data.push({
        date: formatDate(d),
        fullDate: formatFullDate(d),
        price: normalizePrice(backVal)
      });
    }

    data.push({
      date: formatDate(new Date()),
      fullDate: formatFullDate(new Date()),
      price: normalizePrice(currentPrice || backVal)
    });
  }

  return { asset, data, isSimulated };
}

async function buildAiPrediction(symbol: string, horizon: PredictionHorizon): Promise<AIPrediction> {
  const normalizedSymbol = symbol.toUpperCase().trim();
  const normalizedHorizon: PredictionHorizon = ["1D", "1W", "1M", "3M"].includes(horizon)
    ? horizon
    : "1M";

  const { asset, data, isSimulated } = await getHistoricalPriceData(
    normalizedSymbol,
    historicalRangeForPrediction(normalizedHorizon)
  );

  const historyPrices = data.map(point => point.price).filter(price => Number.isFinite(price) && price > 0);
  const currentPrice = asset.price > 0 ? asset.price : historyPrices[historyPrices.length - 1] || 0;
  const prices = currentPrice > 0 && historyPrices[historyPrices.length - 1] !== currentPrice
    ? [...historyPrices, currentPrice]
    : historyPrices;

  if (prices.length < 4 || currentPrice <= 0) {
    throw new Error(`Not enough price history to build prediction for ${normalizedSymbol}`);
  }

  const returns = prices.slice(1).map((price, index) => (price / prices[index]) - 1);
  const recentReturns = returns.slice(-60);
  const dailyVolatility = standardDeviation(recentReturns) || Math.max(Math.abs(asset.changePercent) / 100, 0.012);
  const annualizedVolatility = clamp(dailyVolatility * Math.sqrt(asset.category === "Crypto" ? 365 : 252) * 100, 0, 240);
  const horizonDays = predictionHorizonDays(normalizedHorizon);
  const horizonVolatility = dailyVolatility * Math.sqrt(horizonDays) * 100;
  const rsi = calculateRsi(prices);
  const maxDrawdown = calculateMaxDrawdown(prices.slice(-90));
  const momentum5 = percentChange(prices[Math.max(0, prices.length - 6)], currentPrice);
  const momentum20 = percentChange(prices[Math.max(0, prices.length - 21)], currentPrice);
  const momentum60 = percentChange(prices[Math.max(0, prices.length - 61)], currentPrice);
  const sma5 = averagePrice(prices, 5);
  const sma20 = averagePrice(prices, 20);
  const sma50 = averagePrice(prices, 50);
  const support = Math.min(...prices.slice(-Math.min(prices.length, 30)));
  const resistance = Math.max(...prices.slice(-Math.min(prices.length, 30)));

  let score = 50;
  score += clamp(momentum5 * 1.25, -12, 12);
  score += clamp(momentum20 * 0.8, -16, 16);
  score += clamp(momentum60 * 0.35, -10, 10);
  score += currentPrice > sma20 ? 5 : -5;
  score += sma20 > sma50 ? 5 : -5;
  score += asset.changePercent ? clamp(asset.changePercent * 1.1, -8, 8) : 0;
  if (rsi >= 70) score -= 5;
  if (rsi <= 30) score += 5;
  if (annualizedVolatility > (asset.category === "Crypto" ? 120 : 70)) score -= 4;
  if (maxDrawdown > 24) score -= 4;

  score = roundNumber(clamp(score, 0, 100), 1);
  const signal = getPredictionSignal(score);
  const confidence = roundNumber(clamp(
    46 + Math.abs(score - 50) * 0.75 + Math.min(prices.length, 90) * 0.11 - annualizedVolatility * 0.05 - (isSimulated ? 8 : 0),
    25,
    92
  ), 0);

  const momentumBlend = (momentum5 * 0.35) + (momentum20 * 0.45) + (momentum60 * 0.2);
  const scoreBias = ((score - 50) / 50) * Math.max(horizonVolatility, 1.5) * 0.9;
  const maxMove = asset.category === "Crypto" ? 38 : 22;
  const expectedMovePercent = roundNumber(clamp(scoreBias + momentumBlend * Math.min(horizonDays / 21, 1.4), -maxMove, maxMove), 2);
  const expectedPrice = normalizePrice(currentPrice * (1 + expectedMovePercent / 100));
  const uncertainty = Math.max(horizonVolatility, asset.category === "Crypto" ? 4 : 2.2);
  const bullMovePercent = roundNumber(clamp(expectedMovePercent + uncertainty * 0.8, -maxMove, maxMove * 1.25), 2);
  const bearMovePercent = roundNumber(clamp(expectedMovePercent - uncertainty * 0.8, -maxMove * 1.25, maxMove), 2);
  const stopLoss = normalizePrice(Math.max(currentPrice * (1 - Math.max(uncertainty * 0.55, 2) / 100), support * 0.96));

  const forecastPoints = normalizedHorizon === "1D" ? 5 : normalizedHorizon === "1W" ? 7 : 9;
  const forecast = Array.from({ length: forecastPoints }, (_, index) => {
    const progress = index / Math.max(forecastPoints - 1, 1);
    const curveProgress = Math.pow(progress, 0.82);
    const baseMove = expectedMovePercent * curveProgress;
    const band = uncertainty * Math.sqrt(Math.max(progress, 0.05)) * 0.48;
    return {
      date: index === 0 ? "Now" : formatFutureDate(index, forecastPoints, horizonDays),
      price: normalizePrice(currentPrice * (1 + baseMove / 100)),
      bullPrice: normalizePrice(currentPrice * (1 + (baseMove + band) / 100)),
      bearPrice: normalizePrice(currentPrice * (1 + (baseMove - band) / 100))
    };
  });

  const bullProbability = roundNumber(clamp(30 + (score - 50) * 0.55 + confidence * 0.12, 12, 72), 0);
  const bearProbability = roundNumber(clamp(30 - (score - 50) * 0.55 + (100 - confidence) * 0.08, 12, 72), 0);
  const baseProbability = roundNumber(clamp(100 - bullProbability - bearProbability, 18, 54), 0);
  const probabilityTotal = bullProbability + bearProbability + baseProbability;
  const normalizeProbability = (value: number) => Math.max(1, roundNumber((value / probabilityTotal) * 100, 0));

  const scenarios: PredictionScenario[] = [
    {
      label: "Base",
      probability: normalizeProbability(baseProbability),
      targetPrice: expectedPrice,
      movePercent: expectedMovePercent
    },
    {
      label: "Bull",
      probability: normalizeProbability(bullProbability),
      targetPrice: normalizePrice(currentPrice * (1 + bullMovePercent / 100)),
      movePercent: bullMovePercent
    },
    {
      label: "Bear",
      probability: normalizeProbability(bearProbability),
      targetPrice: normalizePrice(currentPrice * (1 + bearMovePercent / 100)),
      movePercent: bearMovePercent
    }
  ];

  const drivers: PredictionDriver[] = [
    {
      label: "5D Momentum",
      value: `${momentum5 >= 0 ? "+" : ""}${roundNumber(momentum5, 2)}%`,
      stance: driverStance(momentum5, 1.2, -1.2)
    },
    {
      label: "20D Momentum",
      value: `${momentum20 >= 0 ? "+" : ""}${roundNumber(momentum20, 2)}%`,
      stance: driverStance(momentum20, 2.5, -2.5)
    },
    {
      label: "RSI",
      value: `${rsi}`,
      stance: rsi > 68 ? "negative" : rsi < 32 ? "positive" : "neutral"
    },
    {
      label: "Trend Stack",
      value: currentPrice > sma5 && sma5 > sma20 && sma20 > sma50 ? "Aligned" : currentPrice < sma20 ? "Weak" : "Mixed",
      stance: currentPrice > sma5 && sma5 > sma20 && sma20 > sma50 ? "positive" : currentPrice < sma20 ? "negative" : "neutral"
    },
    {
      label: "Annual Vol",
      value: `${roundNumber(annualizedVolatility, 1)}%`,
      stance: annualizedVolatility > (asset.category === "Crypto" ? 115 : 65) ? "negative" : annualizedVolatility < 32 ? "positive" : "neutral"
    },
    {
      label: "Drawdown",
      value: `${roundNumber(maxDrawdown, 1)}%`,
      stance: maxDrawdown > 20 ? "negative" : maxDrawdown < 8 ? "positive" : "neutral"
    }
  ];

  const deterministicNarrative = buildDeterministicNarrative(
    asset,
    signal,
    normalizedHorizon,
    expectedMovePercent,
    confidence
  );

  let narrative = deterministicNarrative;
  try {
    narrative = await callNvidiaChat(
      [
        {
          role: "system",
          content:
            "You are FinPilot AI Prediction, a concise quantitative market strategist. " +
            "Return only JSON with keys: thesis, actionPlan, riskControls. " +
            "Use the model diagnostics exactly; do not invent live data or guarantee outcomes."
        },
        {
          role: "user",
          content: JSON.stringify({
            asset: `${asset.name} (${asset.symbol})`,
            horizon: normalizedHorizon,
            signal,
            score,
            confidence,
            currentPrice,
            expectedPrice,
            expectedMovePercent,
            volatility: annualizedVolatility,
            rsi,
            support,
            resistance,
            drivers
          })
        }
      ],
      deterministicNarrative,
      { maxTokens: 360, temperature: 0.18 }
    );
  } catch (error: any) {
    if (!isRecoverableAiError(error)) {
      console.warn("Prediction AI narrative failed:", getAiErrorMessage(error));
    }
  }

  return {
    symbol: asset.symbol,
    name: asset.name,
    horizon: normalizedHorizon,
    signal,
    recommendation: getPredictionRecommendation(score, confidence),
    confidence,
    score,
    currentPrice: normalizePrice(currentPrice),
    expectedPrice,
    expectedMovePercent,
    volatility: roundNumber(annualizedVolatility, 1),
    rsi,
    support: normalizePrice(support),
    resistance: normalizePrice(resistance),
    stopLoss,
    forecast,
    scenarios,
    drivers,
    thesis: narrative.thesis || deterministicNarrative.thesis,
    actionPlan: narrative.actionPlan || deterministicNarrative.actionPlan,
    riskControls: narrative.riskControls || deterministicNarrative.riskControls,
    dataQuality: asset.dataQuality || "unknown",
    updatedAt: new Date().toISOString(),
    isSimulatedHistory: isSimulated
  };
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
          : asset.volume,
      logo: profile?.logo || undefined
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
  
  // Rate limiting to prevent 429 and timeouts (max 15 assets per poll for stocks)
  let assetsToFetch = stockAssets;
  if (provider === "finnhub" && stockAssets.length > 15) {
    const unfetched = stockAssets.filter(a => a.dataQuality === "unfetched");
    const cached = stockAssets.filter(a => a.dataQuality !== "unfetched");
    assetsToFetch = [...unfetched, ...cached].slice(0, 15);
  }

  const results = [];
  for (let i = 0; i < assetsToFetch.length; i += 5) {
    const chunk = assetsToFetch.slice(i, i + 5);
    const chunkResults = await Promise.allSettled(chunk.map(asset => fetchQuote(asset)));
    results.push(...chunkResults);
    if (i + 5 < assetsToFetch.length) {
      await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between chunks
    }
  }

  results.forEach((result, index) => {
    const symbol = assetsToFetch[index].symbol;
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

    // Async trigger alerts checking (fire and forget)
    checkPriceAlerts(snapshot).catch(console.error);

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

// 1.5. API Endpoint: Inline Asset Analysis
app.post("/api/analyze-asset", async (req, res) => {
  try {
    const { asset } = req.body;
    if (!asset || !asset.symbol) {
      return res.status(400).json({ error: "Asset data is required" });
    }

    const systemInstruction = 
      "You are FinPilot AI, an elite financial analyst. The user will provide a stock/asset symbol and its current data. " +
      "Provide a concise, highly informative 'Company Profile' or 'Asset Profile' (2 paragraphs). " +
      "Explain what the company/project does, its main products/services, and a brief overview of its market position or recent context. " +
      "Return ONLY a JSON object with a single key 'analysis' containing the markdown text. Do not include markdown fences.";
    
    const prompt = `Asset: ${asset.name} (${asset.symbol}). Please generate its Company Profile.`;

    const parsedData = await callNvidiaChat(
      [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ],
      { analysis: "Analysis currently unavailable due to AI service timeout. Please try again later." },
      { maxTokens: 400 }
    );

    res.json(parsedData);
  } catch (error: any) {
    console.error("NVIDIA Analyze Error:", error);
    res.status(500).json({ error: "Failed to analyze asset" });
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

// Streaming Chat API Endpoint
app.post("/api/chat/stream", async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });

    const key = process.env.NVIDIA_API_KEY;
    if (!key) return res.status(500).json({ error: "NVIDIA_API_KEY missing" });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const systemInstruction =
      "You are FinPilot AI, an elite financial intelligence advisor. " +
      "Analyze the user's question and respond exclusively using these EXACT XML tags to structure your response. Do not output anything outside of these tags:\n" +
      "<text>Your main detailed analysis here.</text>\n" +
      "<summary>A short 1-sentence summary here.</summary>\n" +
      "<technicalView>Key technical bullet points or numbers here.</technicalView>\n" +
      "<riskFactors>Key risks identified here.</riskFactors>";

    const mappedHistory = history.map((msg: any) => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.sender === 'user' 
        ? msg.text 
        : `<text>${msg.text}</text><summary>${msg.summary}</summary><technicalView>${msg.technicalView}</technicalView><riskFactors>${msg.riskFactors}</riskFactors>`
    })).slice(-10);

    const messages = [
      { role: "system", content: systemInstruction },
      ...mappedHistory,
      { role: "user", content: message }
    ];

    const response = await fetch(`${getNvidiaBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: getNvidiaModel(),
        messages,
        temperature: 0.2,
        max_tokens: 1000,
        stream: true
      })
    });

    if (!response.ok || !response.body) {
      throw new Error(`NVIDIA API Error: ${response.status}`);
    }

    // Proxy the readable stream directly to the express response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (error: any) {
    console.error("Stream Error:", error);
    res.write(`data: {"error": "${error.message}"}\n\n`);
    res.end();
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

// 4. API Endpoint: Add Custom Ticker
app.post("/api/assets/add", async (req, res) => {
  try {
    let { symbol, category, name } = req.body;
    if (!symbol) return res.status(400).json({ error: "Symbol is required" });
    symbol = String(symbol).toUpperCase().trim();
    
    // Default category based on symbol characteristics if not provided
    if (!category) {
      if (symbol.includes("-USD") || ["BTC", "ETH", "SOL", "DOGE", "SHIB", "XRP"].includes(symbol)) category = "Crypto";
      else category = "US";
    }

    const asset: MarketAsset = {
      symbol,
      name: name || symbol,
      category,
      price: 0,
      changePercent: 0,
      marketCap: "N/A",
      peRatio: "N/A",
      volume: "N/A",
      currencySymbol: "$"
    };

    await persistMarketAsset(asset, "user", "unfetched");
    
    res.json({ success: true, asset });
  } catch (error: any) {
    console.error("Add Asset Error:", error);
    res.status(500).json({ error: error.message || "Failed to add asset" });
  }
});

// 5. API Endpoint: Latest News Feed
app.get("/api/news", async (req, res) => {
  try {
    const finnhubKey = process.env.FINNHUB_API_KEY;
    if (!finnhubKey) {
      return res.status(500).json({ error: "Finnhub API key not configured" });
    }
    
    const url = `https://finnhub.io/api/v1/news?category=general&token=${finnhubKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Finnhub API returned ${response.status}`);
    }
    
    const data = await response.json();
    // Return top 15 news items
    res.json(data.slice(0, 15));
  } catch (error) {
    console.error("News API Error:", error);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

let cachedSentiment: any = null;
let cachedSentimentTime = 0;

app.get("/api/market-sentiment", async (req, res) => {
  try {
    const now = Date.now();
    if (cachedSentiment && now - cachedSentimentTime < 3600000) {
      return res.json(cachedSentiment); // Cache for 1 hour
    }

    const finnhubKey = process.env.FINNHUB_API_KEY;
    if (!finnhubKey) return res.status(500).json({ error: "No Finnhub Key" });

    const newsRes = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${finnhubKey}`);
    const newsData = await newsRes.json();
    const topNews = newsData.slice(0, 10).map((n: any) => n.headline).join(". ");

    const systemInstruction = 
      "You are a quantitative market sentiment analyzer. Read the following news headlines and generate a single JSON object with keys: " +
      "'score' (number from 0 to 100, where 0 is extreme fear/bearish and 100 is extreme greed/bullish), " +
      "'label' (string: 'Bullish', 'Neutral', or 'Bearish'), " +
      "'summary' (a crisp 1-sentence explanation of why). Do not output anything else.";

    const parsedData = await callNvidiaChat(
      [
        { role: "system", content: systemInstruction },
        { role: "user", content: `Headlines: ${topNews}` }
      ],
      { score: 50, label: "Neutral", summary: "Market sentiment analysis is currently unavailable." },
      { maxTokens: 150 }
    );

    cachedSentiment = parsedData;
    cachedSentimentTime = now;
    res.json(parsedData);
  } catch (error) {
    console.error("Sentiment API Error:", error);
    res.status(500).json({ error: "Failed to calculate sentiment" });
  }
});

// 4.5. API Endpoint: Quantitative AI Prediction
app.post("/api/prediction", async (req, res) => {
  try {
    const symbol = String(req.body?.symbol || "").toUpperCase().trim();
    const horizon = (req.body?.horizon || "1M") as PredictionHorizon;

    if (!symbol) {
      return res.status(400).json({ error: "Symbol is required" });
    }

    const prediction = await buildAiPrediction(symbol, horizon);
    res.setHeader("Cache-Control", "no-store");
    res.json(prediction);
  } catch (error: any) {
    console.error("Prediction Error:", error);
    const status = error.message === "Asset not found" ? 404 : 500;
    res.status(status).json({ error: error.message || "Failed to build prediction" });
  }
});

// Vite Middleware for development mode
// 5. API Endpoint: Historical Market Data
app.get("/api/historical-data/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const range = (req.query.range as string) || "1M";
    const { data, isSimulated } = await getHistoricalPriceData(symbol, range);
    res.setHeader("Cache-Control", "no-store");
    res.json({ data, isSimulated });
  } catch (error: any) {
    console.error("Historical Data Error:", error);
    res.status(500).json({ error: error.message || "Failed to load historical data" });
  }
});

// 4. API Endpoints: Watchlist
app.get("/api/watchlist", async (req, res) => {
  try {
    const db = await getMarketDb();
    const rows = db.prepare("SELECT symbol FROM user_watchlist ORDER BY added_at ASC").all();
    res.json(rows.map((r: any) => r.symbol));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/watchlist", async (req, res) => {
  try {
    const { symbol } = req.body;
    if (!symbol) return res.status(400).json({ error: "symbol required" });
    const db = await getMarketDb();
    db.prepare("INSERT OR REPLACE INTO user_watchlist (symbol, added_at) VALUES (?, ?)").run(symbol, new Date().toISOString());
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/watchlist/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const db = await getMarketDb();
    db.prepare("DELETE FROM user_watchlist WHERE symbol = ?").run(symbol);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/watchlist/reorder", async (req, res) => {
  try {
    const { order } = req.body; // array of symbols
    const db = await getMarketDb();
    const stmt = db.prepare("UPDATE user_watchlist SET added_at = ? WHERE symbol = ?");
    db.exec("BEGIN TRANSACTION");
    try {
      order.forEach((sym: string, idx: number) => {
        // use timestamp based on index to preserve ordering
        const date = new Date(Date.now() + idx * 1000).toISOString();
        stmt.run(date, sym);
      });
      db.exec("COMMIT");
      res.json({ success: true });
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. API Endpoints: Holdings
app.get("/api/portfolio", async (req, res) => {
  try {
    const db = await getMarketDb();
    const rows = db.prepare("SELECT * FROM user_holdings ORDER BY added_at ASC").all();
    res.json(rows.map((r: any) => ({
      id: r.id,
      asset: r.asset,
      name: r.name,
      category: r.category,
      qty: r.qty,
      avgCost: r.avg_cost
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/portfolio", async (req, res) => {
  try {
    const { id, asset, name, category, qty, avgCost } = req.body;
    const db = await getMarketDb();
    db.prepare("INSERT INTO user_holdings (id, asset, name, category, qty, avg_cost, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      id || Date.now().toString(), asset, name, category, qty, avgCost, new Date().toISOString()
    );
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/portfolio/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getMarketDb();
    db.prepare("DELETE FROM user_holdings WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. API Endpoints: Settings
app.get("/api/settings", async (req, res) => {
  try {
    const db = await getMarketDb();
    const rows = db.prepare("SELECT key, value FROM user_settings").all();
    const settings: Record<string, string> = {};
    rows.forEach((r: any) => settings[r.key] = r.value);
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/settings", async (req, res) => {
  try {
    const settings = req.body; // Record<string, string>
    const db = await getMarketDb();
    const stmt = db.prepare("INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)");
    db.exec("BEGIN TRANSACTION");
    try {
      Object.entries(settings).forEach(([key, value]) => {
        stmt.run(key, String(value));
      });
      db.exec("COMMIT");
      res.json({ success: true });
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. API Endpoints: Chat History
app.get("/api/chat/history", async (req, res) => {
  try {
    const db = await getMarketDb();
    const sessions = db.prepare("SELECT * FROM chat_sessions ORDER BY updated_at DESC").all();
    const messages = db.prepare("SELECT * FROM chat_messages ORDER BY timestamp ASC").all();
    
    const result = sessions.map((s: any) => ({
      id: s.id,
      title: s.title,
      timeLabel: s.time_label,
      messages: messages.filter((m: any) => m.session_id === s.id).map((m: any) => ({
        id: m.id,
        sender: m.sender,
        text: m.text,
        timestamp: m.timestamp,
        summary: m.summary,
        technicalView: m.technical_view,
        riskFactors: m.risk_factors
      }))
    }));
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/chat/session", async (req, res) => {
  try {
    const session = req.body;
    const db = await getMarketDb();
    const { id, title, timeLabel, messages } = session;
    
    db.exec("BEGIN TRANSACTION");
    try {
      db.prepare("INSERT OR REPLACE INTO chat_sessions (id, title, time_label, updated_at) VALUES (?, ?, ?, ?)").run(
        id, title, timeLabel, new Date().toISOString()
      );
      
      db.prepare("DELETE FROM chat_messages WHERE session_id = ?").run(id);
      
      const stmt = db.prepare("INSERT INTO chat_messages (id, session_id, sender, text, timestamp, summary, technical_view, risk_factors) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      messages.forEach((m: any) => {
        stmt.run(m.id, id, m.sender, m.text, m.timestamp, m.summary || null, m.technicalView || null, m.riskFactors || null);
      });
      
      db.exec("COMMIT");
      res.json({ success: true });
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8. API Endpoints: Alerts
app.get("/api/alerts", async (req, res) => {
  try {
    const db = await getMarketDb();
    const alerts = db.prepare("SELECT * FROM user_alerts ORDER BY added_at DESC").all();
    res.json(alerts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/alerts", async (req, res) => {
  try {
    const { symbol, targetPrice, condition } = req.body;
    const db = await getMarketDb();
    const id = "alt_" + Date.now();
    db.prepare("INSERT INTO user_alerts (id, symbol, target_price, condition, added_at) VALUES (?, ?, ?, ?, ?)").run(
      id, symbol, targetPrice, condition, new Date().toISOString()
    );
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/alerts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getMarketDb();
    db.prepare("DELETE FROM user_alerts WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function checkPriceAlerts(snapshot: any) {
  try {
    const db = await getMarketDb();
    const alerts = db.prepare("SELECT * FROM user_alerts WHERE is_triggered = 0").all();
    if (alerts.length === 0) return;
    
    const assetMap = new Map(snapshot.assets.map((a: any) => [a.symbol, a.price]));
    
    alerts.forEach((alert: any) => {
      const currentPrice = assetMap.get(alert.symbol);
      if (currentPrice === undefined) return;
      
      let triggered = false;
      if (alert.condition === 'ABOVE' && currentPrice >= alert.target_price) {
        triggered = true;
      } else if (alert.condition === 'BELOW' && currentPrice <= alert.target_price) {
        triggered = true;
      }
      
      if (triggered) {
        db.prepare("UPDATE user_alerts SET is_triggered = 1 WHERE id = ?").run(alert.id);
        console.log(`[ALERT] ${alert.symbol} triggered condition ${alert.condition} at $${currentPrice}`);
        // In a real app we'd push this via WebSockets to the client.
        // For now, the client will fetch /api/alerts and see it's triggered.
      }
    });
  } catch (e) {
    console.error("Alert check error:", e);
  }
}

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
