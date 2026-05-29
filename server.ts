import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { MARKET_ASSETS } from "./src/data";
import type { MarketAsset, MarketDataResponse } from "./src/types";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini API client with appropriate headers
let ai: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("WARNING: GEMINI_API_KEY is not defined. AI features will fallback to elegant mock data.");
    }
    ai = new GoogleGenAI({
      apiKey: key || "MOCK_KEY",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return ai;
}

const MARKET_CACHE_TTL_MS = Number(process.env.MARKET_CACHE_TTL_MS || 60000);
const MARKET_REQUEST_TIMEOUT_MS = Number(process.env.MARKET_REQUEST_TIMEOUT_MS || 8000);

const CRYPTO_ID_BY_SYMBOL: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple"
};

let marketDataCache: { timestamp: number; payload: MarketDataResponse } | null = null;

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

  if (ids.length === 0) {
    return { updates, errors: [] as string[] };
  }

  const url =
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}` +
    "&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&precision=full";

  try {
    const data = await fetchJson<Record<string, Record<string, number>>>(url);

    for (const asset of cryptoAssets) {
      const coinId = CRYPTO_ID_BY_SYMBOL[asset.symbol];
      const quote = data[coinId];
      const price = quote?.usd;

      if (!Number.isFinite(price)) continue;

      updates.set(asset.symbol, {
        ...asset,
        price: normalizePrice(price),
        changePercent: normalizePercent(quote.usd_24h_change),
        marketCap: formatCompactNumber(quote.usd_market_cap),
        volume: formatCompactNumber(quote.usd_24h_vol),
        currencySymbol: "$"
      });
    }

    return { updates, errors: [] as string[] };
  } catch (error: any) {
    return {
      updates,
      errors: [`CoinGecko crypto feed unavailable: ${error.message || "request failed"}`]
    };
  }
}

function getStockProvider() {
  if (process.env.FINNHUB_API_KEY) return "finnhub";
  if (process.env.ALPHA_VANTAGE_API_KEY) return "alpha_vantage";
  return "mock";
}

async function fetchFinnhubQuote(asset: MarketAsset): Promise<MarketAsset> {
  const token = process.env.FINNHUB_API_KEY;
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(asset.symbol)}&token=${encodeURIComponent(token || "")}`;
  const data = await fetchJson<{ c?: number; dp?: number }>(url);
  const price = Number(data.c);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`empty quote for ${asset.symbol}`);
  }

  return {
    ...asset,
    price: normalizePrice(price),
    changePercent: normalizePercent(data.dp)
  };
}

async function fetchAlphaVantageQuote(asset: MarketAsset): Promise<MarketAsset> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  const url =
    "https://www.alphavantage.co/query?function=GLOBAL_QUOTE" +
    `&symbol=${encodeURIComponent(asset.symbol)}&apikey=${encodeURIComponent(apiKey || "")}`;
  const data = await fetchJson<Record<string, any>>(url);

  if (data.Note || data.Information || data["Error Message"]) {
    throw new Error(String(data.Note || data.Information || data["Error Message"]));
  }

  const quote = data["Global Quote"];
  const price = Number(quote?.["05. price"]);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`empty quote for ${asset.symbol}`);
  }

  return {
    ...asset,
    price: normalizePrice(price),
    changePercent: normalizePercent(quote?.["10. change percent"]),
    volume: quote?.["06. volume"] ? formatCompactNumber(quote["06. volume"]) : asset.volume
  };
}

async function fetchStockQuotes(assets: MarketAsset[]) {
  const provider = getStockProvider();
  const stockAssets = assets.filter(asset => asset.category === "US" || asset.category === "ETFs");
  const updates = new Map<string, MarketAsset>();
  const errors: string[] = [];

  if (provider === "mock" || stockAssets.length === 0) {
    return {
      updates,
      errors,
      status: provider === "mock" ? "mock: set FINNHUB_API_KEY or ALPHA_VANTAGE_API_KEY" : "not configured"
    };
  }

  const fetchQuote = provider === "finnhub" ? fetchFinnhubQuote : fetchAlphaVantageQuote;
  const results = await Promise.allSettled(stockAssets.map(asset => fetchQuote(asset)));

  results.forEach((result, index) => {
    const symbol = stockAssets[index].symbol;
    if (result.status === "fulfilled") {
      updates.set(symbol, result.value);
    } else {
      errors.push(`${provider} stock feed failed for ${symbol}: ${result.reason?.message || "request failed"}`);
    }
  });

  return {
    updates,
    errors,
    status: provider
  };
}

async function getMarketSnapshot(forceRefresh = false): Promise<MarketDataResponse> {
  const now = Date.now();

  if (!forceRefresh && marketDataCache && now - marketDataCache.timestamp < MARKET_CACHE_TTL_MS) {
    return {
      ...marketDataCache.payload,
      stale: false
    };
  }

  const baseAssets = MARKET_ASSETS.map(asset => ({ ...asset }));
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

  const liveSymbols = new Set<string>([
    ...cryptoResult.updates.keys(),
    ...stockResult.updates.keys()
  ]);

  const source = liveSymbols.size === 0
    ? "mock"
    : liveSymbols.size === mergedAssets.length
      ? "live"
      : "mixed";

  const payload: MarketDataResponse = {
    assets: mergedAssets,
    updatedAt: new Date().toISOString(),
    source,
    stale: false,
    errors,
    providerStatus: {
      stocks: stockResult.status,
      crypto: cryptoResult.updates.size > 0 ? "coingecko" : "mock",
      vietnam: "mock: configure a licensed Vietnam market-data vendor"
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

// 1. API Endpoint: Technical & Market Analysis Chat
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      // Fallback response for mock-up mode when API key is missing
      return setTimeout(() => {
        res.json({
          text: `**Technical Review for AAPL**\n\nStock is currently consolidating around key support levels with positive RSI indications. In light mode, our advanced sentiment registers robust inflows.`,
          summary: "Consolidation phase with standard 50-day EMA support.",
          technicalView: "RSI sits at 58 (Neutral/Bullish) with active volume.",
          riskFactors: "Macroeconomic pressure from bond yields might affect high valuation multiples."
        });
      }, 500);
    }

    const client = getGeminiClient();
    
    // We want a structured JSON response to fill the beautiful panels of Screen 2:
    // "AI Analysis: TICKER", "SUMMARY", "TECHNICAL VIEW", "RISK FACTORS"
    const systemInstruction = 
      "You are FinPilot AI, an elite financial intelligence and technical/fundamental market analysis advisor. " +
      "Analyze the user's question. If the user asks about an asset, portfolio, or market event, generate a highly structured analysis. " +
      "Provide your output exactly matching the following JSON schema with structured answers, including technical summary, view indicators, and risk factors.";

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: message,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: {
              type: Type.STRING,
              description: "The main text analysis response (e.g. 'Current price action shows a consolidation phase...'). Follow with standard friendly, professional feedback."
            },
            summary: {
              type: Type.STRING,
              description: "A short 1-2 sentence technical summary (e.g. 'Stock is trading above the 50-day EMA. Immediate resistance found at $195.80...')"
            },
            technicalView: {
              type: Type.STRING,
              description: "A technical evaluation indicator summary (e.g. 'RSI sits at 58 (Neutral/Bullish). MACD histogram shows decreasing bearish momentum.')"
            },
            riskFactors: {
              type: Type.STRING,
              description: "1-2 potential risk factors for the asset or scenario (e.g. 'Macroeconomic pressure from bond yields may weigh on tech multiples.')"
            }
          },
          required: ["text", "summary", "technicalView", "riskFactors"]
        }
      }
    });

    const parsedData = JSON.parse(response.text || "{}");
    res.json(parsedData);
  } catch (error: any) {
    console.error("Gemini Chat Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// 2. API Endpoint: Smart Portfolio Review
app.post("/api/portfolio-review", async (req, res) => {
  try {
    const { holdings } = req.body; // Array of { asset, name, qty, avgCost, currentPrice }
    
    const key = process.env.GEMINI_API_KEY;
    if (!key || !holdings || holdings.length === 0) {
      // Fallback mock portfolio reviews matching Screen 1's "AI Portfolio Review" panel
      return res.json({
        concentrationText: "Your portfolio is currently 64% concentrated in Technology. FinPilot AI recommends increasing exposure to Consumer Staples or Energy to reduce volatility.",
        optimizationIdea: "Consider rebalancing $45k from TSLA into a diversified index fund to mitigate specific sector risk."
      });
    }

    const client = getGeminiClient();
    const portfolioString = holdings.map((h: any) => `${h.name} (${h.asset}): Qty ${h.qty}, Avg Cost $${h.avgCost}, Current Price $${h.currentPrice}`).join("; ");

    const systemInstruction = 
      "You are FinPilot AI portfolio optimizer. Analyze the provided user portfolio and suggest rebalancing advice " +
      "specifically calling out direct percentage concentration, sectors, and clear optimization strategies in JSON format. " +
      "Be professional and direct, focusing on smart risk mitigation.";

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Analyze this portfolio: ${portfolioString}`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            concentrationText: {
              type: Type.STRING,
              description: "Advice outlining the main concentration of their assets and a recommended sector diversification strategy (e.g., 'Your portfolio is currently heavily weighted in...')."
            },
            optimizationIdea: {
              type: Type.STRING,
              description: "A specific actionable rebalancing or mitigation strategy (e.g., 'Consider rebalancing ... from ... to mitigate market risks.')."
            }
          },
          required: ["concentrationText", "optimizationIdea"]
        }
      }
    });

    const parsedData = JSON.parse(response.text || "{}");
    res.json(parsedData);
  } catch (error: any) {
    console.error("Gemini Portfolio Review Error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze portfolio" });
  }
});

// 3. API Endpoint: Ticker/News Summarizer
app.post("/api/summarize-news", async (req, res) => {
  try {
    const { title, source, symbol } = req.body;
    const key = process.env.GEMINI_API_KEY;
    
    if (!key) {
      return res.json({
        summary: `FinPilot AI Summary: The latest reports suggest continuous structural tailwinds for ${symbol || "this asset"}. Financial metrics remain stable, aligned with key volume indicators.`
      });
    }

    const client = getGeminiClient();
    const prompt = `Summarize and provide institutional investor context for this news article: "${title}" by ${source || "analysts"} concerning ${symbol || "the asset"}. Keep the response under 60 words.`;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an institutional financial analyst. Provide a swift, dense summary and technical implications of news headlines."
      }
    });

    res.json({ summary: response.text || "No summary available." });
  } catch (error: any) {
    console.error("Gemini Summarize Error:", error);
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
