import express from "express";
import rateLimit from "express-rate-limit";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { createServer as createViteServer } from "vite";
import { createServer as createHttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import type { Request, Response } from "express";
import { SEARCHABLE_ASSETS, TRACKED_ASSETS } from "./src/data";
import type {
  AIPrediction,
  DisplayCurrency,
  MarketAsset,
  MarketAssetCategory,
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

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests from this IP, please try again after 15 minutes" }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: "Too many login attempts, please try again after 15 minutes" }
});

app.use("/api/", apiLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/local-workspace", authLimiter);

const AUTH_COOKIE_NAME = "laxs_studio_session";
const AUTH_SESSION_TTL_MS = Number(process.env.AUTH_SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000);
const LEGACY_USER_ID = "local_legacy_user";
const LOCAL_WORKSPACE_USER_ID = "local_workspace_user";
const LOCAL_WORKSPACE_EMAIL = process.env.AUTH_LOCAL_WORKSPACE_EMAIL || "workspace@laxs.local";
const AUTH_LOCAL_WORKSPACE_ENABLED = process.env.AUTH_LOCAL_WORKSPACE_ENABLED
  ? process.env.AUTH_LOCAL_WORKSPACE_ENABLED === "true"
  : process.env.NODE_ENV !== "production";

type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  two_factor_enabled?: number;
  email_verified?: number;
  avatar_url?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, hash] = String(storedHash || "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookies(req: Request) {
  return String(req.headers.cookie || "")
    .split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) return cookies;
      const key = part.slice(0, separatorIndex);
      const value = part.slice(separatorIndex + 1);
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function serializeCookie(name: string, value: string, options: {
  httpOnly?: boolean;
  maxAgeMs?: number;
  expires?: Date;
}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Lax"
  ];

  if (options.httpOnly) parts.push("HttpOnly");
  if (options.maxAgeMs !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeMs / 1000))}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (process.env.NODE_ENV === "production") parts.push("Secure");

  return parts.join("; ");
}

function publicUser(row: any): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    two_factor_enabled: row.two_factor_enabled,
    email_verified: row.email_verified,
    avatar_url: row.avatar_url,
  };
}

async function createSessionForUser(userId: string, res: Response) {
  const db = await getMarketDb();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + AUTH_SESSION_TTL_MS);
  const sessionId = `sess_${randomBytes(12).toString("hex")}`;

  db.prepare(`
    INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, userId, hashSessionToken(token), expiresAt.toISOString(), nowIso(), nowIso());

  res.setHeader("Set-Cookie", serializeCookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    maxAgeMs: AUTH_SESSION_TTL_MS,
    expires: expiresAt
  }));
}

async function getOptionalUser(req: Request): Promise<AuthUser | null> {
  const token = parseCookies(req)[AUTH_COOKIE_NAME];
  if (!token) return null;

  const db = await getMarketDb();
  const tokenHash = hashSessionToken(token);
  const row = db.prepare(`
    SELECT users.id, users.email, users.name, users.two_factor_enabled, users.email_verified, users.avatar_url, auth_sessions.id AS session_id
    FROM auth_sessions
    INNER JOIN users ON users.id = auth_sessions.user_id
    WHERE auth_sessions.token_hash = ?
      AND auth_sessions.expires_at > ?
  `).get(tokenHash, nowIso());

  if (!row) return null;

  db.prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?").run(nowIso(), row.session_id);
  return publicUser(row);
}

async function requireUser(req: Request, res: Response): Promise<AuthUser | null> {
  const user = await getOptionalUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return user;
}

async function clearCurrentSession(req: Request, res: Response) {
  const token = parseCookies(req)[AUTH_COOKIE_NAME];
  if (token) {
    const db = await getMarketDb();
    db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(hashSessionToken(token));
  }

  res.setHeader("Set-Cookie", serializeCookie(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    maxAgeMs: 0,
    expires: new Date(0)
  }));
}

type ResponseLanguage = "en" | "vi";

function getResponseLanguage(value: unknown): ResponseLanguage {
  return value === "vi" ? "vi" : "en";
}

function languageInstruction(language: ResponseLanguage) {
  return language === "vi"
    ? "CRITICAL: You must respond in natural, polished Vietnamese regardless of the input language. Keep ticker symbols, company names, JSON keys, numbers, and common financial abbreviations unchanged."
    : "Respond in the SAME language that the user used in their most recent message. If they ask in Vietnamese, respond in Vietnamese. If they ask in English, respond in English. Maintain a professional tone.";
}

function getNvidiaModel() {
  return process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct";
}

type AiTask =
  | "chat"
  | "stream"
  | "prediction"
  | "portfolio"
  | "macro"
  | "news"
  | "sentiment"
  | "assetProfile"
  | "searchIntent";

type AiMessage = { role: "system" | "user" | "assistant"; content: string };

type AiCallOptions = {
  task?: AiTask;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  cacheTtlMs?: number;
  timeoutMs?: number;
};

const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 60000);
const AI_CACHE_TTL_MS = Number(process.env.AI_CACHE_TTL_MS || 5 * 60 * 1000);
const AI_CACHE_MAX_ENTRIES = Number(process.env.AI_CACHE_MAX_ENTRIES || 200);
const AI_TASK_CACHE_TTL_MS: Record<AiTask, number> = {
  chat: 0,
  stream: 0,
  prediction: Number(process.env.AI_PREDICTION_CACHE_TTL_MS || 90 * 1000),
  portfolio: Number(process.env.AI_PORTFOLIO_CACHE_TTL_MS || 60 * 1000),
  macro: Number(process.env.AI_MACRO_CACHE_TTL_MS || 5 * 60 * 1000),
  news: Number(process.env.AI_NEWS_CACHE_TTL_MS || 10 * 60 * 1000),
  sentiment: Number(process.env.AI_SENTIMENT_CACHE_TTL_MS || 60 * 60 * 1000),
  assetProfile: Number(process.env.AI_ASSET_PROFILE_CACHE_TTL_MS || 6 * 60 * 60 * 1000),
  searchIntent: Number(process.env.AI_SEARCH_INTENT_CACHE_TTL_MS || 60 * 1000)
};

const aiTaskEnvKey: Record<AiTask, string> = {
  chat: "NVIDIA_CHAT_MODEL",
  stream: "NVIDIA_CHAT_MODEL",
  prediction: "NVIDIA_PREDICTION_MODEL",
  portfolio: "NVIDIA_PORTFOLIO_MODEL",
  macro: "NVIDIA_MACRO_MODEL",
  news: "NVIDIA_NEWS_MODEL",
  sentiment: "NVIDIA_SENTIMENT_MODEL",
  assetProfile: "NVIDIA_PROFILE_MODEL",
  searchIntent: "NVIDIA_ROUTER_MODEL"
};

const aiResponseCache = new Map<string, { expiresAt: number; value: any; task: AiTask; model: string }>();
const aiInflightRequests = new Map<string, Promise<any>>();

function getAiModelForTask(task: AiTask = "chat") {
  return process.env[aiTaskEnvKey[task]] || getNvidiaModel();
}

function getAiCacheTtl(task: AiTask, override?: number) {
  if (typeof override === "number") return Math.max(0, override);
  return AI_TASK_CACHE_TTL_MS[task] ?? AI_CACHE_TTL_MS;
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function pruneAiCache() {
  const now = Date.now();
  for (const [key, entry] of aiResponseCache) {
    if (entry.expiresAt <= now) aiResponseCache.delete(key);
  }

  while (aiResponseCache.size > AI_CACHE_MAX_ENTRIES) {
    const oldestKey = aiResponseCache.keys().next().value;
    if (!oldestKey) break;
    aiResponseCache.delete(oldestKey);
  }
}

function buildAiCacheKey(task: AiTask, model: string, mode: "json" | "text", messages: AiMessage[], options: AiCallOptions) {
  return stableHash({
    task,
    mode,
    model,
    temperature: options.temperature ?? 0.2,
    maxTokens: options.maxTokens ?? 700,
    messages
  });
}

async function runCachedAiRequest<T>(
  cacheKey: string,
  task: AiTask,
  model: string,
  ttlMs: number,
  producer: () => Promise<T>
): Promise<T> {
  pruneAiCache();

  const cached = aiResponseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const inflight = aiInflightRequests.get(cacheKey);
  if (inflight) {
    return inflight as Promise<T>;
  }

  const request = producer()
    .then((value) => {
      if (ttlMs > 0) {
        aiResponseCache.set(cacheKey, {
          expiresAt: Date.now() + ttlMs,
          value,
          task,
          model
        });
      }
      return value;
    })
    .finally(() => {
      aiInflightRequests.delete(cacheKey);
    });

  aiInflightRequests.set(cacheKey, request);
  return request;
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

function chatFallbackResponse(message = "", language: ResponseLanguage = "en") {
  const asset = (message.match(/\b[A-Z]{2,5}\b/) || ["AAPL"])[0];
  if (language === "vi") {
    return {
      text: `Chế độ dự phòng AI cho ${asset}: cấu trúc thị trường vẫn có trong nguồn dữ liệu local, nhưng endpoint NVIDIA inference đang tạm thời không khả dụng.`,
      summary: `${asset} đang được phân tích bằng chế độ dự phòng local. Hãy thử làm mới lại sau khi provider hoạt động ổn định.`,
      technicalView: "Dữ liệu giá live vẫn hoạt động khi provider đã cấu hình. Phần diễn giải kỹ thuật do AI đang tạm dừng.",
      riskFactors: "Không xem bình luận dự phòng là lời khuyên đầu tư. Hãy xác nhận dữ liệu thị trường và trạng thái AI provider trước khi ra quyết định.",
      fallback: true
    };
  }

  return {
    text: `AI fallback for ${asset}: market structure is available from the local data feed, while the NVIDIA inference endpoint is temporarily unavailable.`,
    summary: `${asset} analysis is running in local fallback mode. Refresh again after the provider becomes available.`,
    technicalView: "Live quote data remains active where providers are configured. AI-generated technical details are paused.",
    riskFactors: "Do not treat fallback commentary as investment advice. Confirm market data and AI provider status before making decisions.",
    fallback: true
  };
}

function portfolioFallbackResponse(language: ResponseLanguage = "en") {
  if (language === "vi") {
    return {
      concentrationText: "Đánh giá danh mục đang chạy ở chế độ dự phòng vì endpoint NVIDIA inference tạm thời không khả dụng. Hãy kiểm tra mức tập trung theo ngành và tránh phân bổ quá nặng vào một nhóm tài sản.",
      optimizationIdea: "Cân nhắc cân bằng lại các vị thế quá lớn và duy trì một phần phòng thủ hoặc broad-market exposure cho đến khi AI inference hoạt động trở lại.",
      fallback: true
    };
  }

  return {
    concentrationText: "Portfolio AI review is running in fallback mode because the NVIDIA inference endpoint is temporarily unavailable. Check concentration by sector and avoid over-weighting one asset class.",
    optimizationIdea: "Consider rebalancing oversized positions and keeping defensive or broad-market exposure until AI inference is available again.",
    fallback: true
  };
}

function newsFallbackResponse(symbol?: string, language: ResponseLanguage = "en") {
  if (language === "vi") {
    return {
      summary: `Tóm tắt dự phòng FinPilot: ${symbol || "Tài sản này"} có dữ liệu thị trường live, nhưng ngữ cảnh tin tức từ AI đang tạm dừng cho đến khi NVIDIA inference khả dụng.`,
      fallback: true
    };
  }

  return {
    summary: `FinPilot fallback summary: ${symbol || "This asset"} has live market data available, but AI headline context is temporarily paused until NVIDIA inference is available.`,
    fallback: true
  };
}

function parseJsonObject(text: string): any {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("AI response did not contain valid JSON");
  }
}

async function callNvidiaChat<T>(
  messages: AiMessage[],
  fallback: T,
  options: AiCallOptions = {}
): Promise<T> {
  const task = options.task || "chat";
  let model = options.model || getAiModelForTask(task);
  
  let key = process.env.NVIDIA_API_KEY;
  let baseUrl = getNvidiaBaseUrl();
  
  if (model.startsWith("groq-")) {
    key = process.env.GROQ_API_KEY;
    baseUrl = "https://api.groq.com/openai/v1";
    model = "llama3-70b-8192";
  }

  if (!key) {
    return fallback;
  }
  const cacheTtlMs = getAiCacheTtl(task, options.cacheTtlMs);
  const cacheKey = buildAiCacheKey(task, model, "json", messages, options);

  return runCachedAiRequest(cacheKey, task, model, cacheTtlMs, async () => {
    const response = await fetchJson<any>(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 700,
        response_format: { type: "json_object" }
      }),
      timeoutMs: options.timeoutMs ?? AI_REQUEST_TIMEOUT_MS
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("NVIDIA response did not include message content");
    }

    return parseJsonObject(content) as T;
  });
}

async function callNvidiaText(
  messages: AiMessage[],
  fallback: string,
  options: AiCallOptions = {}
): Promise<string> {
  const task = options.task || "chat";
  let model = options.model || getAiModelForTask(task);
  
  let key = process.env.NVIDIA_API_KEY;
  let baseUrl = getNvidiaBaseUrl();
  
  if (model.startsWith("groq-")) {
    key = process.env.GROQ_API_KEY;
    baseUrl = "https://api.groq.com/openai/v1";
    model = "llama3-70b-8192";
  }

  if (!key) return fallback;
  const cacheTtlMs = getAiCacheTtl(task, options.cacheTtlMs);
  const cacheKey = buildAiCacheKey(task, model, "text", messages, options);

  return runCachedAiRequest(cacheKey, task, model, cacheTtlMs, async () => {
    const response = await fetchJson<any>(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0,
        max_tokens: options.maxTokens ?? 80
      }),
      timeoutMs: options.timeoutMs ?? AI_REQUEST_TIMEOUT_MS
    });

    return response?.choices?.[0]?.message?.content?.trim() || fallback;
  });
}

async function searchTavily(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    // Fallback to DuckDuckGo HTML scraping if Tavily API key is missing
    try {
      const res = await fetch("https://html.duckduckgo.com/html/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        },
        body: `q=${encodeURIComponent(query)}`
      });
      if (!res.ok) return "";
      const html = await res.text();
      const regex = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/g;
      let match;
      const results: string[] = [];
      while ((match = regex.exec(html)) !== null && results.length < 3) {
        results.push(match[1].replace(/<[^>]+>/g, '').trim());
      }
      return results.map((r, i) => `Result ${i+1}: ${r}`).join("\n");
    } catch (e) {
      console.error("DuckDuckGo Search Error:", e);
      return "";
    }
  }
  
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        search_depth: "basic",
        include_answer: true,
        max_results: 3
      })
    });
    if (!res.ok) return "";
    const data = await res.json();
    return data.answer || data.results?.map((r: any) => `${r.title}: ${r.content}`).join("\n") || "";
  } catch (e) {
    console.error("Tavily Search Error:", e);
    return "";
  }
}

async function determineSearchIntent(message: string, history: any[] = []): Promise<string | null> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return null;
  
  const systemInstruction = "You are a search intent classifier. Analyze the user's latest message and conversation history. If the user asks about recent news, current events, live market prices, or requires up-to-date internet search, output the optimized web search query string ONLY. Do not explain. If NO search is needed, output exactly 'NO_SEARCH'.";
  
  const historyMessages: AiMessage[] = history.map(h => ({
    role: h.role === "user" ? "user" : "assistant",
    content: typeof h.content === 'string' ? h.content : JSON.stringify(h.content)
  }));

  try {
    const reply = await callNvidiaText(
      [
        { role: "system", content: systemInstruction },
        ...historyMessages,
        { role: "user", content: message }
      ],
      "NO_SEARCH",
      { task: "searchIntent", temperature: 0, maxTokens: 50 }
    );
    return (reply === "NO_SEARCH" || reply === "") ? null : reply.replace(/^["']|["']$/g, '');
  } catch (e) {
    console.error("Intent Classification Error:", e);
    return null;
  }
}

async function getTavilyContext(message: string, history: any[] = []): Promise<string> {
  const searchQuery = await determineSearchIntent(message, history);
  if (!searchQuery) return "";
  
  const searchResult = await searchTavily(searchQuery);
  if (searchResult) {
    return `\n\nLIVE WEB SEARCH RESULTS:\nQuery: "${searchQuery}"\n${searchResult}\nCRITICAL INSTRUCTION: You MUST explicitly mention in your response that you have just searched the web for real-time data to answer this query, so the user knows you are not using outdated memory.`;
  }
  return "";
}

const MARKET_CACHE_TTL_MS = Number(process.env.MARKET_CACHE_TTL_MS || 60000);
const MARKET_REQUEST_TIMEOUT_MS = Number(process.env.MARKET_REQUEST_TIMEOUT_MS || 8000);
const MARKET_REFRESH_INTERVAL_MS = Number(process.env.MARKET_REFRESH_INTERVAL_MS || MARKET_CACHE_TTL_MS);
const MARKET_STALE_AFTER_MS = Number(process.env.MARKET_STALE_AFTER_MS || Math.max(MARKET_CACHE_TTL_MS * 3, 180000));
const MARKET_FORCE_REFRESH_MIN_INTERVAL_MS = Number(process.env.MARKET_FORCE_REFRESH_MIN_INTERVAL_MS || 15000);
const MARKET_STOCK_FETCH_LIMIT = Number(process.env.MARKET_STOCK_FETCH_LIMIT || 15);
const MARKET_STOCK_FETCH_CONCURRENCY = Number(process.env.MARKET_STOCK_FETCH_CONCURRENCY || 3);
const MARKET_STOCK_FETCH_CHUNK_DELAY_MS = Number(process.env.MARKET_STOCK_FETCH_CHUNK_DELAY_MS || 750);
const MARKET_PROVIDER_FAILURE_THRESHOLD = Number(process.env.MARKET_PROVIDER_FAILURE_THRESHOLD || 3);
const MARKET_PROVIDER_COOLDOWN_MS = Number(process.env.MARKET_PROVIDER_COOLDOWN_MS || 120000);
const MARKET_DB_PATH = process.env.MARKET_DB_PATH || path.join(process.cwd(), "data", "finpilot-market.sqlite");
const FX_CACHE_TTL_MS = Number(process.env.FX_CACHE_TTL_MS || 12 * 60 * 60 * 1000);
const FX_SUPPORTED_CURRENCIES: DisplayCurrency[] = ["USD", "VND", "EUR", "JPY", "SGD", "GBP"];
let fxRateCache: {
  updatedAt: number;
  payload: {
    base: "USD";
    rates: Record<string, number>;
    date?: string;
    provider: string;
    updatedAt: string;
    source: "live" | "cached" | "fallback";
  };
} | null = null;
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

type AssetSearchResult = {
  symbol: string;
  name: string;
  category: MarketAssetCategory;
  currencySymbol: string;
  provider: string;
  alreadyTracked?: boolean;
  dataQuality?: MarketAsset["dataQuality"];
};

const SEARCHABLE_ASSET_BY_SYMBOL = new Map(SEARCHABLE_ASSETS.map(asset => [asset.symbol, asset]));
const ETF_SYMBOLS = new Set(SEARCHABLE_ASSETS.filter(asset => asset.category === "ETFs").map(asset => asset.symbol));

let marketDataCache: { timestamp: number; payload: MarketDataResponse } | null = null;
let marketRefreshPromise: Promise<MarketDataResponse> | null = null;
let marketRefreshQueuedAt = 0;
let lastManualMarketRefreshAt = 0;
let marketDb: any | null = null;
let databaseCtor: any | null = null;

function tableColumns(db: any, tableName: string) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().map((row: any) => row.name as string);
}

function hasColumn(db: any, tableName: string, columnName: string) {
  return tableColumns(db, tableName).includes(columnName);
}

function rebuildTable(db: any, tableName: string, createSql: string, copySql: (legacyName: string) => string) {
  const legacyName = `${tableName}_legacy_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  db.exec(`ALTER TABLE ${tableName} RENAME TO ${legacyName}`);
  db.exec(createSql);
  db.exec(copySql(legacyName));
  db.exec(`DROP TABLE ${legacyName}`);
}

function ensureUserScopedSchema(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_futures_positions (
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      entry_price REAL NOT NULL,
      qty REAL NOT NULL,
      leverage INTEGER NOT NULL,
      margin REAL NOT NULL,
      added_at TEXT NOT NULL,
      margin_mode TEXT DEFAULT 'ISOLATED',
      stop_loss REAL,
      take_profit REAL,
      PRIMARY KEY(user_id, symbol),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_futures_trades (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      type TEXT NOT NULL,
      qty REAL NOT NULL,
      price REAL NOT NULL,
      leverage INTEGER NOT NULL,
      realized_pnl REAL NOT NULL,
      fee REAL NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  if (!hasColumn(db, "user_futures_positions", "margin_mode")) {
    db.exec(`ALTER TABLE user_futures_positions ADD COLUMN margin_mode TEXT DEFAULT 'ISOLATED'`);
  }
  if (!hasColumn(db, "user_futures_positions", "stop_loss")) {
    db.exec(`ALTER TABLE user_futures_positions ADD COLUMN stop_loss REAL`);
  }
  if (!hasColumn(db, "user_futures_positions", "take_profit")) {
    db.exec(`ALTER TABLE user_futures_positions ADD COLUMN take_profit REAL`);
  }

  if (!hasColumn(db, "users", "two_factor_secret")) {
    db.exec(`ALTER TABLE users ADD COLUMN two_factor_secret TEXT`);
  }
  if (!hasColumn(db, "users", "two_factor_enabled")) {
    db.exec(`ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER DEFAULT 0`);
  }
  if (!hasColumn(db, "users", "email_verified")) {
    db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`);
  }
  if (!hasColumn(db, "users", "avatar_url")) {
    db.exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT`);
  }

  const timestamp = nowIso();
  const existingLegacyUser = db.prepare("SELECT id FROM users WHERE id = ?").get(LEGACY_USER_ID);
  if (!existingLegacyUser) {
    db.prepare(`
      INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      LEGACY_USER_ID,
      "local@laxs.studio",
      "Local Workspace",
      hashPassword(randomBytes(16).toString("hex")),
      timestamp,
      timestamp
    );
  }

  const foreignKeyState = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys?: number } | undefined;
  const shouldRestoreForeignKeys = foreignKeyState?.foreign_keys === 1;

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN TRANSACTION");
  try {
    if (!hasColumn(db, "user_watchlist", "user_id")) {
      rebuildTable(
        db,
        "user_watchlist",
        `
          CREATE TABLE user_watchlist (
            user_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            added_at TEXT NOT NULL,
            PRIMARY KEY(user_id, symbol),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
          );
        `,
        legacyName => `
          INSERT OR IGNORE INTO user_watchlist (user_id, symbol, added_at)
          SELECT '${LEGACY_USER_ID}', symbol, COALESCE(added_at, '${timestamp}')
          FROM ${legacyName}
          WHERE symbol IS NOT NULL;
        `
      );
    }

    if (!hasColumn(db, "user_holdings", "user_id")) {
      rebuildTable(
        db,
        "user_holdings",
        `
          CREATE TABLE user_holdings (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            asset TEXT NOT NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            qty REAL NOT NULL,
            avg_cost REAL NOT NULL,
            added_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
          );
        `,
        legacyName => `
          INSERT OR IGNORE INTO user_holdings (id, user_id, asset, name, category, qty, avg_cost, added_at)
          SELECT id, '${LEGACY_USER_ID}', asset, name, category, qty, avg_cost, COALESCE(added_at, '${timestamp}')
          FROM ${legacyName}
          WHERE id IS NOT NULL AND asset IS NOT NULL;
        `
      );
    }

    if (!hasColumn(db, "user_settings", "user_id")) {
      rebuildTable(
        db,
        "user_settings",
        `
          CREATE TABLE user_settings (
            user_id TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            PRIMARY KEY(user_id, key),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
          );
        `,
        legacyName => `
          INSERT OR REPLACE INTO user_settings (user_id, key, value)
          SELECT '${LEGACY_USER_ID}', key, value
          FROM ${legacyName}
          WHERE key IS NOT NULL;
        `
      );
    }

    if (!hasColumn(db, "user_alerts", "user_id")) {
      rebuildTable(
        db,
        "user_alerts",
        `
          CREATE TABLE user_alerts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            target_price REAL NOT NULL,
            condition TEXT NOT NULL,
            is_triggered INTEGER NOT NULL DEFAULT 0,
            added_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
          );
        `,
        legacyName => `
          INSERT OR IGNORE INTO user_alerts (id, user_id, symbol, target_price, condition, is_triggered, added_at)
          SELECT id, '${LEGACY_USER_ID}', symbol, target_price, condition, COALESCE(is_triggered, 0), COALESCE(added_at, '${timestamp}')
          FROM ${legacyName}
          WHERE id IS NOT NULL AND symbol IS NOT NULL;
        `
      );
    }

    let rebuiltChatSessions = false;
    if (!hasColumn(db, "chat_sessions", "user_id")) {
      rebuiltChatSessions = true;
      rebuildTable(
        db,
        "chat_sessions",
        `
          CREATE TABLE chat_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            time_label TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
          );
        `,
        legacyName => `
          INSERT OR IGNORE INTO chat_sessions (id, user_id, title, time_label, updated_at)
          SELECT id, '${LEGACY_USER_ID}', title, time_label, COALESCE(updated_at, '${timestamp}')
          FROM ${legacyName}
          WHERE id IS NOT NULL;
        `
      );
    }

    if (rebuiltChatSessions) {
      rebuildTable(
        db,
        "chat_messages",
        `
          CREATE TABLE chat_messages (
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
        `,
        legacyName => `
          INSERT OR IGNORE INTO chat_messages (
            id, session_id, sender, text, timestamp, summary, technical_view, risk_factors
          )
          SELECT id, session_id, sender, text, timestamp, summary, technical_view, risk_factors
          FROM ${legacyName}
          WHERE session_id IN (SELECT id FROM chat_sessions);
        `
      );
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, expires_at);
      CREATE INDEX IF NOT EXISTS idx_user_watchlist_user_added ON user_watchlist(user_id, added_at);
      CREATE INDEX IF NOT EXISTS idx_user_holdings_user_added ON user_holdings(user_id, added_at);
      CREATE INDEX IF NOT EXISTS idx_user_alerts_user_added ON user_alerts(user_id, added_at);
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated ON chat_sessions(user_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session_time ON chat_messages(session_id, timestamp ASC);
    `);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    if (shouldRestoreForeignKeys) db.exec("PRAGMA foreign_keys = ON");
    throw error;
  }

  if (shouldRestoreForeignKeys) db.exec("PRAGMA foreign_keys = ON");
}

function cloneLegacyWorkspaceForUser(db: any, userId: string) {
  db.exec("BEGIN TRANSACTION");
  try {
    db.prepare(`
      INSERT OR IGNORE INTO user_watchlist (user_id, symbol, added_at)
      SELECT ?, symbol, added_at
      FROM user_watchlist
      WHERE user_id = ?
    `).run(userId, LEGACY_USER_ID);

    db.prepare(`
      INSERT OR IGNORE INTO user_holdings (id, user_id, asset, name, category, qty, avg_cost, added_at)
      SELECT ? || ':' || id, ?, asset, name, category, qty, avg_cost, added_at
      FROM user_holdings
      WHERE user_id = ?
    `).run(userId, userId, LEGACY_USER_ID);

    db.prepare(`
      INSERT OR REPLACE INTO user_settings (user_id, key, value)
      SELECT ?, key, value
      FROM user_settings
      WHERE user_id = ?
    `).run(userId, LEGACY_USER_ID);

    db.prepare(`
      INSERT OR IGNORE INTO user_alerts (id, user_id, symbol, target_price, condition, is_triggered, added_at)
      SELECT ? || ':' || id, ?, symbol, target_price, condition, is_triggered, added_at
      FROM user_alerts
      WHERE user_id = ?
    `).run(userId, userId, LEGACY_USER_ID);

    db.prepare(`
      INSERT OR IGNORE INTO chat_sessions (id, user_id, title, time_label, updated_at)
      SELECT ? || ':' || id, ?, title, time_label, updated_at
      FROM chat_sessions
      WHERE user_id = ?
    `).run(userId, userId, LEGACY_USER_ID);

    db.prepare(`
      INSERT OR IGNORE INTO chat_messages (id, session_id, sender, text, timestamp, summary, technical_view, risk_factors)
      SELECT ? || ':' || chat_messages.id,
             ? || ':' || chat_messages.session_id,
             chat_messages.sender,
             chat_messages.text,
             chat_messages.timestamp,
             chat_messages.summary,
             chat_messages.technical_view,
             chat_messages.risk_factors
      FROM chat_messages
      INNER JOIN chat_sessions ON chat_sessions.id = chat_messages.session_id
      WHERE chat_sessions.user_id = ?
    `).run(userId, userId, LEGACY_USER_ID);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

type MarketProviderKey = "coingecko" | "finnhub" | "alpha_vantage";

type ProviderCircuitState = {
  failures: number;
  openUntil: number;
  lastError?: string;
};

const providerCircuitState = new Map<MarketProviderKey, ProviderCircuitState>();

function getProviderCircuit(provider: MarketProviderKey): ProviderCircuitState {
  let state = providerCircuitState.get(provider);
  if (!state) {
    state = { failures: 0, openUntil: 0 };
    providerCircuitState.set(provider, state);
  }
  return state;
}

function isProviderCoolingDown(provider: MarketProviderKey) {
  return getProviderCircuit(provider).openUntil > Date.now();
}

function providerCooldownSeconds(provider: MarketProviderKey) {
  const remaining = getProviderCircuit(provider).openUntil - Date.now();
  return Math.max(0, Math.ceil(remaining / 1000));
}

function providerStatusLabel(provider: MarketProviderKey, baseLabel: string) {
  if (!isProviderCoolingDown(provider)) return baseLabel;
  const state = getProviderCircuit(provider);
  return `${baseLabel} cooling down ${providerCooldownSeconds(provider)}s${state.lastError ? ` after ${state.lastError}` : ""}`;
}

function recordProviderSuccess(provider: MarketProviderKey) {
  const state = getProviderCircuit(provider);
  state.failures = 0;
  state.openUntil = 0;
  state.lastError = undefined;
}

function recordProviderFailure(provider: MarketProviderKey, error: unknown) {
  const state = getProviderCircuit(provider);
  state.failures += 1;
  state.lastError = error instanceof Error ? error.message : String(error || "request failed");

  if (state.failures >= MARKET_PROVIDER_FAILURE_THRESHOLD) {
    state.openUntil = Date.now() + MARKET_PROVIDER_COOLDOWN_MS;
  }
}

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
    ensureUserScopedSchema(marketDb);
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

  // Keep user-added symbols in the local universe. The seed list should hydrate defaults,
  // not erase assets that were added through the search workflow.
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

async function readPriorityMarketSymbols(): Promise<Set<string>> {
  try {
    const db = await getMarketDb();
    const rows = db.prepare(`
      SELECT symbol FROM user_watchlist
      UNION
      SELECT asset AS symbol FROM user_holdings
    `).all();

    return new Set(rows.map((row: any) => normalizeAssetSymbol(row.symbol)).filter(Boolean));
  } catch (error) {
    console.warn("Unable to read market priority symbols:", error);
    return new Set();
  }
}

function assetFreshnessScore(asset: MarketAsset) {
  if (!asset.updatedAt) return 0;
  const timestamp = new Date(asset.updatedAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function prioritizeAssetsForProvider(assets: MarketAsset[], prioritySymbols: Set<string>, limit: number) {
  const sorted = [...assets].sort((a, b) => {
    const priorityDelta = Number(prioritySymbols.has(b.symbol)) - Number(prioritySymbols.has(a.symbol));
    if (priorityDelta !== 0) return priorityDelta;

    const unfetchedDelta = Number(b.dataQuality === "unfetched") - Number(a.dataQuality === "unfetched");
    if (unfetchedDelta !== 0) return unfetchedDelta;

    return assetFreshnessScore(a) - assetFreshnessScore(b);
  });

  return sorted.slice(0, Math.max(0, limit));
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

function normalizeAssetSymbol(value: unknown): string {
  const upper = String(value || "").toUpperCase().trim().replace(/\s+/g, "");
  if (upper.endsWith("-USD")) {
    const base = upper.slice(0, -4);
    if (CRYPTO_ID_BY_SYMBOL[base]) return base;
  }
  return upper;
}

function isValidAssetSymbol(symbol: string): boolean {
  return /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol);
}

function normalizeAssetCategory(value: unknown, symbol: string): MarketAssetCategory {
  const requested = String(value || "").trim();
  if (requested === "US" || requested === "Crypto" || requested === "ETFs" || requested === "Vietnam") {
    return requested;
  }
  if (CRYPTO_ID_BY_SYMBOL[symbol]) return "Crypto";
  if (ETF_SYMBOLS.has(symbol)) return "ETFs";
  return "US";
}

function assetConfigToSearchResult(
  asset: { symbol: string; name: string; category: MarketAssetCategory; currencySymbol?: string },
  provider = "local directory"
): AssetSearchResult {
  return {
    symbol: asset.symbol,
    name: asset.name,
    category: asset.category,
    currencySymbol: asset.currencySymbol || "$",
    provider
  };
}

async function attachTrackedState(results: AssetSearchResult[]): Promise<AssetSearchResult[]> {
  if (results.length === 0) return results;

  const db = await getMarketDb();
  const rows = db.prepare("SELECT symbol, data_quality FROM market_assets").all();
  const tracked = new Map<string, MarketAsset["dataQuality"]>(
    rows.map((row: any) => [row.symbol, row.data_quality as MarketAsset["dataQuality"]])
  );

  return results.map(result => ({
    ...result,
    alreadyTracked: tracked.has(result.symbol),
    dataQuality: tracked.get(result.symbol)
  }));
}

function mergeAssetSearchResults(...groups: AssetSearchResult[][]): AssetSearchResult[] {
  const bySymbol = new Map<string, AssetSearchResult>();

  for (const group of groups) {
    for (const item of group) {
      if (!MARKET_VISIBLE_CATEGORIES.has(item.category)) continue;
      if (!bySymbol.has(item.symbol)) {
        bySymbol.set(item.symbol, item);
      }
    }
  }

  return [...bySymbol.values()];
}

function searchLocalAssetDirectory(query: string): AssetSearchResult[] {
  const normalized = query.trim().toLowerCase();
  const exactSymbol = normalizeAssetSymbol(query);

  if (!normalized) {
    return SEARCHABLE_ASSETS.slice(0, 18).map(asset => assetConfigToSearchResult(asset));
  }

  return SEARCHABLE_ASSETS
    .filter(asset => (
      asset.symbol.toLowerCase().includes(normalized) ||
      asset.name.toLowerCase().includes(normalized) ||
      asset.symbol === exactSymbol
    ))
    .slice(0, 24)
    .map(asset => assetConfigToSearchResult(asset));
}

async function searchDatabaseAssets(query: string): Promise<AssetSearchResult[]> {
  const db = await getMarketDb();
  const like = `%${query.trim()}%`;
  const rows = db.prepare(`
    SELECT symbol, name, category, currency_symbol, provider, data_quality
    FROM market_assets
    WHERE symbol LIKE ? OR name LIKE ?
    ORDER BY
      CASE data_quality
        WHEN 'live' THEN 1
        WHEN 'cached' THEN 2
        ELSE 3
      END,
      symbol
    LIMIT 24
  `).all(like, like);

  return rows.map((row: any) => ({
    symbol: row.symbol,
    name: row.name,
    category: row.category,
    currencySymbol: row.currency_symbol || "$",
    provider: row.provider || "database",
    alreadyTracked: true,
    dataQuality: row.data_quality
  }));
}

function providerAssetCategory(symbol: string, typeText: string): MarketAssetCategory {
  const text = typeText.toLowerCase();
  if (CRYPTO_ID_BY_SYMBOL[symbol]) return "Crypto";
  if (ETF_SYMBOLS.has(symbol) || text.includes("etf") || text.includes("fund")) return "ETFs";
  return "US";
}

async function searchFinnhubSymbols(query: string): Promise<AssetSearchResult[]> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token || query.trim().length < 2) return [];

  const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query.trim())}&token=${encodeURIComponent(token)}`;
  const data = await fetchJson<{ result?: Array<Record<string, any>> }>(url, { timeoutMs: 6000 });

  return (data.result || [])
    .map(item => {
      const symbol = normalizeAssetSymbol(item.displaySymbol || item.symbol);
      const name = String(item.description || symbol).trim();
      const typeText = String(item.type || "");
      return {
        symbol,
        name,
        category: providerAssetCategory(symbol, typeText),
        currencySymbol: "$",
        provider: "finnhub search"
      };
    })
    .filter(item => isValidAssetSymbol(item.symbol) && item.name)
    .slice(0, 16);
}

async function searchAlphaVantageSymbols(query: string): Promise<AssetSearchResult[]> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey || query.trim().length < 2) return [];

  const url =
    "https://www.alphavantage.co/query?function=SYMBOL_SEARCH" +
    `&keywords=${encodeURIComponent(query.trim())}&apikey=${encodeURIComponent(apiKey)}`;
  const data = await fetchJson<Record<string, any>>(url, { timeoutMs: 6000 });

  return (data.bestMatches || [])
    .map((item: Record<string, any>) => {
      const symbol = normalizeAssetSymbol(item["1. symbol"]);
      const name = String(item["2. name"] || symbol).trim();
      const typeText = String(item["3. type"] || "");
      return {
        symbol,
        name,
        category: providerAssetCategory(symbol, typeText),
        currencySymbol: "$",
        provider: "alpha vantage search"
      };
    })
    .filter((item: AssetSearchResult) => isValidAssetSymbol(item.symbol) && item.name)
    .slice(0, 16);
}

async function searchProviderAssets(query: string): Promise<AssetSearchResult[]> {
  try {
    if (process.env.FINNHUB_API_KEY) return await searchFinnhubSymbols(query);
    if (process.env.ALPHA_VANTAGE_API_KEY) return await searchAlphaVantageSymbols(query);
  } catch (error: any) {
    console.warn("Asset provider search unavailable:", error.message || error);
  }

  return [];
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
  if (normalized === "JPY") return "¥";
  if (normalized === "SGD") return "S$";
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
  const date = new Date();
  if (horizonDays === 1) {
    const hoursPerStep = 6.5 / Math.max(totalPoints - 1, 1); // standard market hours
    date.setMinutes(date.getMinutes() + (index * hoursPerStep * 60));
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  
  const step = Math.max(1, Math.round((horizonDays / Math.max(totalPoints - 1, 1)) * index));
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
  confidence: number,
  language: ResponseLanguage = "en"
) {
  if (language === "vi") {
    return {
      thesis: `${asset.symbol} đang có thiết lập ${signal.toLowerCase()} cho khung ${horizon}, với kỳ vọng biến động ${expectedMovePercent >= 0 ? "+" : ""}${expectedMovePercent.toFixed(2)}% và độ tin cậy mô hình ${confidence}%.`,
      actionPlan: signal === "Bullish"
        ? "Ưu tiên vào lệnh theo từng phần gần vùng hỗ trợ và tránh đuổi giá khi biến động intraday đã kéo giãn."
        : signal === "Bearish"
          ? "Ưu tiên bảo toàn vốn, giảm tỷ trọng khi giá hồi mạnh, và chờ tín hiệu ổn định trước khi tăng vị thế."
          : "Giữ sizing vừa phải cho đến khi momentum, volume, và trend alignment cải thiện rõ hơn.",
      riskControls: "Dùng dữ liệu thị trường live, xác nhận thanh khoản, và sizing mỗi giao dịch sao cho một lần chạm stop-loss không làm hỏng rủi ro cấp danh mục."
    };
  }

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
  const normalizedRange = ["1D", "5D", "1W", "1M", "3M", "6M", "YTD", "1Y", "5Y", "ALL"].includes(range) ? range : "1M";
  let days: string | number = 30;
  if (normalizedRange === "1D") days = 1;
  else if (normalizedRange === "5D" || normalizedRange === "1W") days = 7;
  else if (normalizedRange === "3M") days = 90;
  else if (normalizedRange === "6M") days = 180;
  else if (normalizedRange === "YTD") {
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    days = Math.max(1, Math.ceil((new Date().getTime() - startOfYear.getTime()) / (1000 * 3600 * 24)));
  }
  else if (normalizedRange === "1Y") days = 365;
  else if (normalizedRange === "5Y") days = 1825;
  else if (normalizedRange === "ALL") days = "max";

  const formatDate = (d: Date) => {
    if (normalizedRange === "1D") return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (normalizedRange === "5D" || normalizedRange === "1W") return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.toLocaleTimeString("en-US", { hour: "numeric" })}`;
    if (normalizedRange === "1Y" || normalizedRange === "5Y" || normalizedRange === "ALL") return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatFullDate = (d: Date) => {
    if (normalizedRange === "1D" || normalizedRange === "5D" || normalizedRange === "1W") {
      return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

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

      if (normalizedRange === "1D") {
        yahooRange = "1d";
        yahooInterval = "5m";
      } else if (normalizedRange === "5D" || normalizedRange === "1W") {
        yahooRange = "5d";
        yahooInterval = "60m";
      } else if (normalizedRange === "3M") {
        yahooRange = "3mo";
      } else if (normalizedRange === "6M") {
        yahooRange = "6mo";
      } else if (normalizedRange === "YTD") {
        yahooRange = "ytd";
      } else if (normalizedRange === "1Y") {
        yahooRange = "1y";
        yahooInterval = "1wk";
      } else if (normalizedRange === "5Y") {
        yahooRange = "5y";
        yahooInterval = "1mo";
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

async function buildAiPrediction(symbol: string, horizon: PredictionHorizon, language: ResponseLanguage = "en", model: string = "finpilot-v1"): Promise<AIPrediction> {
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
    confidence,
    language
  );

  let narrative = deterministicNarrative;
  try {
    narrative = await callNvidiaChat(
      [
        {
          role: "system",
          content:
            (model === "deepseek-r1" 
              ? "You are DeepSeek-R1 Institutional AI, a highly critical, data-focused quantitative analyst. Be direct, skeptical, and focus heavily on technical levels and momentum. " 
              : model === "llama-3-sent"
              ? "You are Llama-3 Sentiment Oracle. Focus heavily on market psychology, retail vs institutional positioning, and sentiment shifts in your analysis. "
              : model === "mistral-macro"
              ? "You are Mistral Macro-Economic AI. Frame the prediction around broader market trends, liquidity, interest rates, and macro-economic factors impacting this asset. "
              : model === "claude-3-opus"
              ? "You are Claude 3 Opus, an expert fundamental analyst. Focus heavily on intrinsic value, long-term business/network prospects, and structural market strength. "
              : model === "gpt-4-quant"
              ? "You are GPT-4 Quant Master. Focus strictly on statistical arbitrage, mean reversion probabilities, and mathematical anomalies in price action. "
              : model === "whale-tracker"
              ? "You are Whale Wallet Tracker AI. Your analysis focuses on institutional accumulation patterns, dark pool prints, and large block trade liquidity zones. "
              : model === "retail-fomo"
              ? "You are Retail FOMO Indicator. You analyze the market purely through the lens of retail hype, social media momentum, and short squeeze or panic sell potential. "
              : "You are FinPilot AI Prediction, a concise quantitative market strategist. ") +
            languageInstruction(language) + " " +
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
      { task: "prediction", model, maxTokens: 360, temperature: 0.18 }
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
  const providerKey: MarketProviderKey = "coingecko";

  if (ids.length === 0) {
    return { updates, errors: [] as string[], provider };
  }

  if (isProviderCoolingDown(providerKey)) {
    return {
      updates,
      errors: [`CoinGecko feed cooling down for ${providerCooldownSeconds(providerKey)}s after repeated failures.`],
      provider: providerStatusLabel(providerKey, provider)
    };
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
        currencySymbol: "$",
        logo: quote.image || asset.logo
      });
    }

    recordProviderSuccess(providerKey);
    return { updates, errors: [] as string[], provider };
  } catch (error: any) {
    recordProviderFailure(providerKey, error);
    return {
      updates,
      errors: [`CoinGecko crypto feed unavailable: ${error.message || "request failed"}`],
      provider: providerStatusLabel(providerKey, provider)
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
  const providerKey = provider === "finnhub" || provider === "alpha_vantage"
    ? provider as MarketProviderKey
    : null;

  if (provider === "unconfigured" || stockAssets.length === 0) {
    return {
      updates,
      errors,
      status: provider === "unconfigured" ? "unconfigured: set FINNHUB_API_KEY or ALPHA_VANTAGE_API_KEY" : "not configured"
    };
  }

  if (providerKey && isProviderCoolingDown(providerKey)) {
    return {
      updates,
      providers,
      errors: [`${provider} stock feed cooling down for ${providerCooldownSeconds(providerKey)}s after repeated failures.`],
      status: providerStatusLabel(providerKey, provider)
    };
  }

  const fetchQuote = provider === "finnhub" ? fetchFinnhubQuote : fetchAlphaVantageQuote;

  const prioritySymbols = await readPriorityMarketSymbols();
  const providerLimit = provider === "alpha_vantage"
    ? Math.min(MARKET_STOCK_FETCH_LIMIT, 5)
    : MARKET_STOCK_FETCH_LIMIT;
  const assetsToFetch = prioritizeAssetsForProvider(stockAssets, prioritySymbols, providerLimit);

  const results = [];
  const chunkSize = Math.max(1, MARKET_STOCK_FETCH_CONCURRENCY);
  for (let i = 0; i < assetsToFetch.length; i += chunkSize) {
    const chunk = assetsToFetch.slice(i, i + chunkSize);
    const chunkResults = await Promise.allSettled(chunk.map(asset => fetchQuote(asset)));
    results.push(...chunkResults);
    if (i + chunkSize < assetsToFetch.length) {
      await new Promise(resolve => setTimeout(resolve, MARKET_STOCK_FETCH_CHUNK_DELAY_MS));
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

  if (providerKey) {
    if (updates.size > 0) {
      recordProviderSuccess(providerKey);
    } else if (errors.length > 0) {
      recordProviderFailure(providerKey, errors[0]);
    }
  }

  const priorityStatus = assetsToFetch.length < stockAssets.length
    ? `; prioritized ${assetsToFetch.length}/${stockAssets.length}`
    : "";

  return {
    updates,
    providers,
    errors,
    status: providerKey ? `${providerStatusLabel(providerKey, provider)}${priorityStatus}` : provider
  };
}

async function buildCachedMarketPayload(errors: string[] = []): Promise<MarketDataResponse> {
  const storedAssets = await readMarketAssetsFromDatabase(true);
  const databaseStatus = await getMarketDbStatus();
  const newestAssetTime = storedAssets
    .map(asset => asset.updatedAt ? new Date(asset.updatedAt).getTime() : 0)
    .filter(timestamp => Number.isFinite(timestamp) && timestamp > 0)
    .sort((a, b) => b - a)[0];

  return {
    assets: storedAssets,
    updatedAt: newestAssetTime ? new Date(newestAssetTime).toISOString() : new Date().toISOString(),
    source: storedAssets.length > 0 ? "cached" : "empty",
    stale: true,
    errors,
    providerStatus: {
      stocks: getStockProvider() === "unconfigured"
        ? "unconfigured: set FINNHUB_API_KEY or ALPHA_VANTAGE_API_KEY"
        : providerStatusLabel(getStockProvider() as MarketProviderKey, getStockProvider()),
      crypto: providerStatusLabel("coingecko", process.env.COINGECKO_API_KEY || process.env.COINGECKO_DEMO_API_KEY ? "coingecko demo" : "coingecko public"),
      vietnam: MARKET_VISIBLE_CATEGORIES.has("Vietnam")
        ? "unconfigured: add a licensed Vietnam market-data vendor"
        : "hidden",
      database: `sqlite: ${databaseStatus.path} (${databaseStatus.assetCount} assets, ${databaseStatus.snapshotCount} snapshots)`
    }
  };
}

function decorateMarketSnapshot(payload: MarketDataResponse, timestamp: number): MarketDataResponse {
  const cacheAgeMs = Math.max(0, Date.now() - timestamp);
  return {
    ...payload,
    stale: payload.stale || cacheAgeMs > MARKET_STALE_AFTER_MS,
    cacheAgeMs,
    refreshing: Boolean(marketRefreshPromise),
    refreshQueuedAt: marketRefreshQueuedAt ? new Date(marketRefreshQueuedAt).toISOString() : undefined
  };
}

async function refreshMarketSnapshotInternal(): Promise<MarketDataResponse> {
  const baseAssets = await readMarketAssetsFromDatabase(true);
  const [cryptoResult, stockResult] = await Promise.all([
    fetchCryptoQuotes(baseAssets),
    fetchStockQuotes(baseAssets)
  ]);

  const errors = [...cryptoResult.errors, ...stockResult.errors];

  for (const [symbol, asset] of cryptoResult.updates) {
    await persistMarketAsset(asset, cryptoResult.provider, "live");
  }

  for (const [symbol, asset] of stockResult.updates) {
    await persistMarketAsset(asset, stockResult.providers.get(symbol) || stockResult.status, "live");
  }

  const storedAssets = await readMarketAssetsFromDatabase(true);
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

  return payload;
}

function queueMarketRefresh(reason: string, force = false) {
  if (marketRefreshPromise) return marketRefreshPromise;

  const now = Date.now();
  if (force && now - lastManualMarketRefreshAt < MARKET_FORCE_REFRESH_MIN_INTERVAL_MS) {
    return null;
  }
  if (!force && marketDataCache && now - marketDataCache.timestamp < MARKET_REFRESH_INTERVAL_MS) {
    return null;
  }

  if (force) lastManualMarketRefreshAt = now;
  marketRefreshQueuedAt = now;
  console.log(`[market] queued ${reason} refresh`);

  marketRefreshPromise = refreshMarketSnapshotInternal()
    .then((payload) => {
      marketDataCache = { timestamp: Date.now(), payload };
      broadcastMarketSnapshot(decorateMarketSnapshot(payload, marketDataCache.timestamp));
      checkPriceAlerts(payload).catch(console.error);
      return payload;
    })
    .catch(async (error: any) => {
      console.error(`[market] ${reason} refresh failed:`, error);
      if (!marketDataCache) {
        const fallback = await buildCachedMarketPayload([error.message || "Market refresh failed"]);
        marketDataCache = { timestamp: Date.now(), payload: fallback };
      } else {
        marketDataCache = {
          ...marketDataCache,
          payload: {
            ...marketDataCache.payload,
            stale: true,
            errors: [error.message || "Market refresh failed", ...(marketDataCache.payload.errors || [])].slice(0, 6)
          }
        };
      }
      return marketDataCache.payload;
    })
    .finally(() => {
      marketRefreshPromise = null;
    });

  return marketRefreshPromise;
}

async function getMarketSnapshot(forceRefresh = false): Promise<MarketDataResponse> {
  if (!marketDataCache) {
    const cachedPayload = await buildCachedMarketPayload();
    const cacheTimestamp = cachedPayload.source === "empty"
      ? 0
      : new Date(cachedPayload.updatedAt).getTime() || 0;
    marketDataCache = {
      timestamp: cacheTimestamp > 0 ? cacheTimestamp : Date.now() - MARKET_REFRESH_INTERVAL_MS,
      payload: cachedPayload
    };
    queueMarketRefresh("warm-start", true);
    return decorateMarketSnapshot(marketDataCache.payload, marketDataCache.timestamp);
  }

  if (forceRefresh) {
    queueMarketRefresh("manual", true);
  } else if (Date.now() - marketDataCache.timestamp >= MARKET_REFRESH_INTERVAL_MS) {
    queueMarketRefresh("ttl", false);
  }

  return decorateMarketSnapshot(marketDataCache.payload, marketDataCache.timestamp);
}

const marketStreamClients = new Set<any>();

function sendMarketStreamEvent(client: any, payload: MarketDataResponse) {
  client.write(`event: market-data\n`);
  client.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastMarketSnapshot(payload: MarketDataResponse) {
  for (const client of marketStreamClients) {
    try {
      sendMarketStreamEvent(client, payload);
    } catch {
      marketStreamClients.delete(client);
    }
  }
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

app.get("/api/market-stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  marketStreamClients.add(res);

  const keepAlive = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 30000);

  try {
    sendMarketStreamEvent(res, await getMarketSnapshot(false));
  } catch (error) {
    res.write(`event: market-error\n`);
    res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : "market stream failed" })}\n\n`);
  }

  req.on("close", () => {
    clearInterval(keepAlive);
    marketStreamClients.delete(res);
    res.end();
  });
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

app.get("/api/ai/status", async (_req, res) => {
  const tasks: AiTask[] = [
    "chat",
    "stream",
    "prediction",
    "portfolio",
    "macro",
    "news",
    "sentiment",
    "assetProfile",
    "searchIntent"
  ];

  res.setHeader("Cache-Control", "no-store");
  res.json({
    provider: "nvidia-nim-openai-compatible",
    configured: Boolean(process.env.NVIDIA_API_KEY),
    baseUrl: getNvidiaBaseUrl(),
    defaultModel: getNvidiaModel(),
    requestTimeoutMs: AI_REQUEST_TIMEOUT_MS,
    cache: {
      entries: aiResponseCache.size,
      inflight: aiInflightRequests.size,
      maxEntries: AI_CACHE_MAX_ENTRIES
    },
    tasks: Object.fromEntries(tasks.map(task => [
      task,
      {
        model: getAiModelForTask(task),
        env: aiTaskEnvKey[task],
        cacheTtlMs: getAiCacheTtl(task)
      }
    ]))
  });
});

// 1.5. API Endpoint: Inline Asset Analysis
app.post("/api/analyze-asset", async (req, res) => {
  try {
    const { asset } = req.body;
    const responseLanguage = getResponseLanguage(req.body?.language);
    if (!asset || !asset.symbol) {
      return res.status(400).json({ error: "Asset data is required" });
    }

    const systemInstruction = 
      "You are FinPilot AI, an elite financial analyst. The user will provide a stock/asset symbol and its current data. " +
      languageInstruction(responseLanguage) + " " +
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
      { task: "assetProfile", maxTokens: 400, temperature: 0.15 }
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
    const responseLanguage = getResponseLanguage(req.body?.language);
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const mappedHistory: AiMessage[] = (history || []).map((msg: any) => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.sender === 'user' 
        ? msg.text 
        : `<text>${msg.text}</text><summary>${msg.summary}</summary><technicalView>${msg.technicalView}</technicalView><riskFactors>${msg.riskFactors}</riskFactors>`
    })).slice(-10);

    let cacheContext = "";
    if (marketAnalysisCache.size > 0) {
      const topVol = Array.from(marketAnalysisCache.entries()).sort((a,b) => b[1].volatility - a[1].volatility).slice(0, 3).map(e => `${e[0]} (${e[1].volatility.toFixed(2)}%)`).join(", ");
      const topSma = Array.from(marketAnalysisCache.entries()).sort((a,b) => b[1].sma30 - a[1].sma30).slice(0, 3).map(e => `${e[0]} (SMA30: ${e[1].sma30.toFixed(4)})`).join(", ");
      cacheContext = `\nCurrent Market Context: Top Volatile pairs: ${topVol}. Top High SMA30 pairs: ${topSma}.\n`;
    }

    const tavilyContext = await getTavilyContext(message, mappedHistory);
    const systemInstruction =
      "You are FinPilot AI, an elite financial intelligence and technical/fundamental market analysis advisor. " +
      languageInstruction(responseLanguage) + " " +
      "CRITICAL RULE: You must STRICTLY focus only on financial markets, investing, crypto, and economic topics. If the user asks about unrelated topics, politely decline and steer the conversation back to the financial market. " +
      cacheContext +
      "Analyze the user's question. If the user asks about an asset, portfolio, or market event, generate a highly structured analysis. " +
      "Return only JSON with keys: text, summary, technicalView, riskFactors. Do not include markdown fences." +
      tavilyContext;

    const parsedData = await callNvidiaChat(
      [
        { role: "system", content: systemInstruction },
        ...mappedHistory,
        { role: "user", content: message }
      ],
      chatFallbackResponse(message, responseLanguage),
      { task: "chat", model: req.body?.model, maxTokens: 700, cacheTtlMs: 0 }
    );
    res.json(parsedData);
  } catch (error: any) {
    const message = getAiErrorMessage(error);
    console.error("NVIDIA Chat Error:", message);
    if (isRecoverableAiError(error)) {
      return res.json(chatFallbackResponse(req.body?.message, getResponseLanguage(req.body?.language)));
    }
    res.status(500).json({ error: error.message || "Failed to generate chat response" });
  }
});

// Streaming Chat API Endpoint
app.post("/api/chat/stream", async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    const responseLanguage = getResponseLanguage(req.body?.language);
    if (!message) return res.status(400).json({ error: "Message is required" });

    const key = process.env.NVIDIA_API_KEY;
    if (!key) return res.status(500).json({ error: "NVIDIA_API_KEY missing" });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const mappedHistory: AiMessage[] = history.map((msg: any) => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.sender === 'user' 
        ? msg.text 
        : `<text>${msg.text}</text><summary>${msg.summary}</summary><technicalView>${msg.technicalView}</technicalView><riskFactors>${msg.riskFactors}</riskFactors>`
    })).slice(-10);

    let cacheContext = "";
    if (marketAnalysisCache.size > 0) {
      const topVol = Array.from(marketAnalysisCache.entries()).sort((a,b) => b[1].volatility - a[1].volatility).slice(0, 3).map(e => `${e[0]} (${e[1].volatility.toFixed(2)}%)`).join(", ");
      const topSma = Array.from(marketAnalysisCache.entries()).sort((a,b) => b[1].sma30 - a[1].sma30).slice(0, 3).map(e => `${e[0]} (SMA30: ${e[1].sma30.toFixed(4)})`).join(", ");
      cacheContext = `\nCurrent Market Context: Top Volatile pairs: ${topVol}. Top High SMA30 pairs: ${topSma}.\n`;
    }

    const tavilyContext = await getTavilyContext(message, mappedHistory);
    const systemInstruction =
      "You are FinPilot AI, an elite financial intelligence advisor. " +
      languageInstruction(responseLanguage) + " " +
      "CRITICAL RULE: You must STRICTLY focus only on financial markets, investing, crypto, and economic topics. If the user asks about unrelated topics, politely decline and steer the conversation back to the financial market. " +
      cacheContext +
      "Analyze the user's question and respond exclusively using these EXACT XML tags to structure your response. Do not output anything outside of these tags:\n" +
      "<text>Your main detailed analysis here.</text>\n" +
      "<summary>A short 1-sentence summary here.</summary>\n" +
      "<technicalView>Key technical bullet points or numbers here.</technicalView>\n" +
      "<riskFactors>Key risks identified here.</riskFactors>" +
      tavilyContext;

    const messages: AiMessage[] = [
      { role: "system", content: systemInstruction },
      ...mappedHistory,
      { role: "user", content: message }
    ];
    const streamModel = getAiModelForTask("stream");

    const response = await fetch(`${getNvidiaBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: streamModel,
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
    const responseLanguage = getResponseLanguage(req.body?.language);
    
    if (!holdings || holdings.length === 0) {
      return res.json(responseLanguage === "vi"
        ? {
            concentrationText: "Chưa có vị thế nào trong danh mục để phân tích.",
            optimizationIdea: "Hãy thêm ít nhất một tài sản có giá live trước khi yêu cầu AI đánh giá danh mục."
          }
        : {
            concentrationText: "No portfolio holdings were submitted.",
            optimizationIdea: "Add at least one live-priced holding before requesting an AI portfolio review."
          });
    }

    const portfolioString = holdings.map((h: any) => `${h.name} (${h.asset}): Qty ${h.qty}, Avg Cost $${h.avgCost}, Current Price $${h.currentPrice}`).join("; ");

    const systemInstruction =
      "You are FinPilot AI portfolio optimizer. Analyze the provided user portfolio and suggest rebalancing advice " +
      languageInstruction(responseLanguage) + " " +
      "specifically calling out direct percentage concentration, sectors, and clear optimization strategies in JSON format. " +
      "Be professional and direct, focusing on smart risk mitigation. Return only JSON with keys: concentrationText, optimizationIdea.";

    const parsedData = await callNvidiaChat(
      [
        { role: "system", content: systemInstruction },
        { role: "user", content: `Analyze this portfolio: ${portfolioString}` }
      ],
      portfolioFallbackResponse(responseLanguage),
      { task: "portfolio", maxTokens: 500, temperature: 0.15 }
    );
    res.json(parsedData);
  } catch (error: any) {
    const message = getAiErrorMessage(error);
    console.error("NVIDIA Portfolio Review Error:", message);
    if (isRecoverableAiError(error)) {
      return res.json(portfolioFallbackResponse(getResponseLanguage(req.body?.language)));
    }
    res.status(500).json({ error: error.message || "Failed to analyze portfolio" });
  }
});

function macroFallbackResponse(stats?: any, language: ResponseLanguage = "en") {
  const isPositive = stats?.positiveAssets > (stats?.totalAssets / 2) || false;
  if (language === "vi") {
    return {
      macroTrend: isPositive ? "Bullish" : "Mixed",
      keyObservations: [
        `Áp lực thanh khoản tổng thể đang ổn định trên ${stats?.totalAssets || 15} tài sản theo dõi live.`,
        "Nhóm crypto đang phân kỳ rõ so với dòng tiền trú ẩn truyền thống."
      ],
      actionableStrategy: isPositive
        ? "Tăng tỷ trọng có kiểm soát vào tài sản beta cao, đồng thời bảo vệ downside bằng trailing stop."
        : "Giữ dự trữ tiền mặt và giải ngân từng phần tại các vùng hỗ trợ quan trọng."
    };
  }

  return {
    macroTrend: isPositive ? "Bullish" : "Mixed",
    keyObservations: [
      `Overall liquidity pressure remains steady across ${stats?.totalAssets || 15} live tracking assets.`,
      `Crypto sector showing marked divergence from traditional safe-haven inflows.`
    ],
    actionableStrategy: isPositive 
      ? "Scale up allocations to high-beta assets while protecting downside with trailing stops." 
      : "Conserve cash reserves and deploy incrementally into key support zones."
  };
}

// 2b. API Endpoint: Macro AI Crawler
app.post("/api/macro-analysis", async (req, res) => {
  try {
    const { stats } = req.body;
    const responseLanguage = getResponseLanguage(req.body?.language);
    
    if (!stats || !stats.totalAssets) {
      return res.json(macroFallbackResponse(undefined, responseLanguage));
    }

    const payloadString = JSON.stringify(stats);

    const systemInstruction = 
      "You are the FinPilot Macro Economist AI. Analyze the provided live market statistics payload and generate a structured macro report. " +
      languageInstruction(responseLanguage) + " " +
      "Return ONLY valid JSON matching this schema: { \"macroTrend\": \"Bullish\" | \"Bearish\" | \"Mixed\", \"keyObservations\": string[], \"actionableStrategy\": string }. " +
      "Keep observations concise and data-driven.";

    const parsedData = await callNvidiaChat(
      [
        { role: "system", content: systemInstruction },
        { role: "user", content: `Generate macro report based on these live market stats: ${payloadString}` }
      ],
      macroFallbackResponse(stats, responseLanguage),
      { task: "macro", maxTokens: 400, temperature: 0.15 }
    );
    res.json(parsedData);
  } catch (error: any) {
    const message = getAiErrorMessage(error);
    console.error("NVIDIA Macro Analysis Error:", message);
    if (isRecoverableAiError(error)) {
      return res.json(macroFallbackResponse(req.body?.stats, getResponseLanguage(req.body?.language)));
    }
    res.status(500).json({ error: error.message || "Failed to generate macro analysis" });
  }
});

// 3. API Endpoint: Ticker/News Summarizer
app.post("/api/summarize-news", async (req, res) => {
  try {
    const { title, source, symbol } = req.body;
    const responseLanguage = getResponseLanguage(req.body?.language);
    const prompt = `Summarize and provide institutional investor context for this news article: "${title}" by ${source || "analysts"} concerning ${symbol || "the asset"}. Keep the response under 60 words.`;

    const parsedData = await callNvidiaChat(
      [
        {
          role: "system",
          content: "You are an institutional financial analyst. " + languageInstruction(responseLanguage) + " Provide a swift, dense summary and technical implications of news headlines. Return only JSON with key: summary."
        },
        { role: "user", content: prompt }
      ],
      newsFallbackResponse(symbol, responseLanguage),
      { task: "news", maxTokens: 220, temperature: 0.12 }
    );

    res.json(parsedData);
  } catch (error: any) {
    const message = getAiErrorMessage(error);
    console.error("NVIDIA Summarize Error:", message);
    if (isRecoverableAiError(error)) {
      return res.json(newsFallbackResponse(req.body?.symbol, getResponseLanguage(req.body?.language)));
    }
    res.status(500).json({ error: error.message });
  }
});

// 3.5. API Endpoint: Local Account Auth
app.get("/api/auth/me", async (req, res) => {
  try {
    const user = await getOptionalUser(req);
    res.setHeader("Cache-Control", "no-store");
    res.json({ user });
  } catch (error: any) {
    console.error("Auth Me Error:", error);
    res.status(500).json({ error: error.message || "Failed to read session" });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const name = String(req.body?.name || "").trim().slice(0, 80) || null;

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Use a valid email address." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const db = await getMarketDb();
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const realUserCount = db.prepare("SELECT COUNT(*) AS count FROM users WHERE id != ?").get(LEGACY_USER_ID).count;
    const timestamp = nowIso();
    const userId = `usr_${randomBytes(12).toString("hex")}`;
    db.prepare(`
      INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, email, name, hashPassword(password), timestamp, timestamp);

    if (realUserCount === 0) {
      cloneLegacyWorkspaceForUser(db, userId);
    }

    await createSessionForUser(userId, res);
    res.status(201).json({ user: { id: userId, email, name } });
  } catch (error: any) {
    console.error("Register Error:", error);
    res.status(500).json({ error: error.message || "Failed to create account" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const db = await getMarketDb();
    const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

    if (!row || !verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    if (row.two_factor_enabled) {
      const tempToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      db.prepare("INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(
        randomBytes(16).toString("hex"), row.id, hashSessionToken(tempToken), expiresAt, nowIso()
      );
      return res.json({ require2FA: true, tempToken });
    }

    await createSessionForUser(row.id, res);
    res.json({ user: publicUser(row) });
  } catch (error: any) {
    console.error("Login Error:", error);
    res.status(500).json({ error: error.message || "Failed to sign in" });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    await clearCurrentSession(req, res);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Logout Error:", error);
    res.status(500).json({ error: error.message || "Failed to sign out" });
  }
});

app.post("/api/auth/local-workspace", async (req, res) => {
  try {
    if (!AUTH_LOCAL_WORKSPACE_ENABLED) {
      return res.status(403).json({
        error: "Local workspace login is disabled. Set AUTH_LOCAL_WORKSPACE_ENABLED=true to enable it."
      });
    }

    const db = await getMarketDb();
    let row = db.prepare("SELECT * FROM users WHERE id = ?").get(LOCAL_WORKSPACE_USER_ID);

    if (!row) {
      const timestamp = nowIso();
      db.prepare(`
        INSERT INTO users (id, email, name, password_hash, created_at, updated_at, email_verified)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        LOCAL_WORKSPACE_USER_ID,
        LOCAL_WORKSPACE_EMAIL,
        "Local Workspace",
        hashPassword(randomBytes(24).toString("hex")),
        timestamp,
        timestamp,
        1
      );

      cloneLegacyWorkspaceForUser(db, LOCAL_WORKSPACE_USER_ID);
      row = db.prepare("SELECT * FROM users WHERE id = ?").get(LOCAL_WORKSPACE_USER_ID);
    }

    await createSessionForUser(row.id, res);
    res.json({ user: publicUser(row), localWorkspace: true });
  } catch (error: any) {
    console.error("Local Workspace Login Error:", error);
    res.status(500).json({ error: error.message || "Failed to open local workspace" });
  }
});

app.post("/api/auth/2fa/login", async (req, res) => {
  try {
    const { tempToken, token } = req.body;
    const db = await getMarketDb();
    const tempReq = db.prepare("SELECT * FROM password_resets WHERE token_hash = ? AND expires_at > ?").get(hashSessionToken(tempToken), nowIso());
    if (!tempReq) return res.status(401).json({ error: "2FA session expired" });
    
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(tempReq.user_id);
    if (!user || !user.two_factor_secret) return res.status(400).json({ error: "Invalid 2FA state" });
    
    const isValid = speakeasy.totp.verify({ secret: user.two_factor_secret, encoding: 'base32', token });
    if (!isValid) return res.status(401).json({ error: "Invalid 2FA token" });
    
    db.prepare("DELETE FROM password_resets WHERE id = ?").run(tempReq.id);
    await createSessionForUser(user.id, res);
    res.json({ user: publicUser(user) });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to login with 2FA" });
  }
});

app.put("/api/auth/profile", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { name, avatar_url } = req.body;
    const db = await getMarketDb();
    db.prepare("UPDATE users SET name = ?, avatar_url = ?, updated_at = ? WHERE id = ?").run(name, avatar_url, nowIso(), user.id);
    res.json({ success: true, user: { ...user, name, avatar_url } });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to update profile" });
  }
});

app.put("/api/auth/change-password", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { current_password, new_password } = req.body;
    const db = await getMarketDb();
    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id);
    if (!row || !verifyPassword(current_password, row.password_hash)) {
      return res.status(401).json({ error: "Incorrect current password" });
    }
    db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(hashPassword(new_password), nowIso(), user.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to change password" });
  }
});

app.get("/api/auth/export-backup", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const db = await getMarketDb();
    
    const userRow = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    if (!userRow) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const watchlist = db.prepare("SELECT symbol, added_at FROM user_watchlist WHERE user_id = ?").all(user.id);
    const holdings = db.prepare("SELECT id, asset, name, category, qty, avg_cost, added_at FROM user_holdings WHERE user_id = ?").all(user.id);
    const settings = db.prepare("SELECT key, value FROM user_settings WHERE user_id = ?").all(user.id);
    const alerts = db.prepare("SELECT id, symbol, target_price, condition, is_triggered, added_at FROM user_alerts WHERE user_id = ?").all(user.id);
    const futuresPositions = db.prepare("SELECT * FROM user_futures_positions WHERE user_id = ?").all(user.id);
    const futuresTrades = db.prepare("SELECT * FROM user_futures_trades WHERE user_id = ?").all(user.id);
    
    const chats = [];
    const sessions = db.prepare("SELECT id, title, time_label, updated_at FROM chat_sessions WHERE user_id = ?").all(user.id);
    for (const session of sessions) {
      const messages = db.prepare("SELECT id, sender, text, timestamp, summary, technical_view, risk_factors FROM chat_messages WHERE session_id = ? ORDER BY timestamp ASC").all(session.id);
      chats.push({ session, messages });
    }
    
    res.json({
      version: 1,
      user: {
        email: userRow.email,
        name: userRow.name,
        two_factor_enabled: userRow.two_factor_enabled,
        email_verified: userRow.email_verified,
        avatar_url: userRow.avatar_url
      },
      watchlist,
      holdings,
      settings,
      alerts,
      chats,
      futuresPositions,
      futuresTrades
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to export backup" });
  }
});

app.post("/api/auth/import-backup", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    
    const { backup } = req.body;
    if (!backup || !backup.user || !backup.user.email) {
      return res.status(400).json({ error: "Invalid backup file structure" });
    }
    
    if (normalizeEmail(backup.user.email) !== normalizeEmail(user.email)) {
      return res.status(403).json({ error: "You can only import backup data into your own account" });
    }
    
    const db = await getMarketDb();
    
    db.exec("BEGIN TRANSACTION");
    try {
      const userId = user.id;
      
      // Clear old data for this user
      db.prepare("DELETE FROM user_watchlist WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM user_holdings WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM user_settings WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM user_alerts WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM chat_sessions WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM user_futures_positions WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM user_futures_trades WHERE user_id = ?").run(userId);
      
      // 2. Restore Watchlist
      if (Array.isArray(backup.watchlist)) {
        const stmt = db.prepare("INSERT OR REPLACE INTO user_watchlist (user_id, symbol, added_at) VALUES (?, ?, ?)");
        for (const item of backup.watchlist) {
          stmt.run(userId, item.symbol, item.added_at || timestamp);
        }
      }
      
      // 3. Restore Holdings
      if (Array.isArray(backup.holdings)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO user_holdings (id, user_id, asset, name, category, qty, avg_cost, added_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const item of backup.holdings) {
          stmt.run(
            item.id || `hld_${randomBytes(12).toString("hex")}`,
            userId,
            item.asset,
            item.name,
            item.category,
            item.qty,
            item.avg_cost,
            item.added_at || timestamp
          );
        }
      }
      
      // 4. Restore Settings
      if (Array.isArray(backup.settings)) {
        const stmt = db.prepare("INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)");
        for (const item of backup.settings) {
          stmt.run(userId, item.key, item.value);
        }
      }
      
      // 5. Restore Alerts
      if (Array.isArray(backup.alerts)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO user_alerts (id, user_id, symbol, target_price, condition, is_triggered, added_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const item of backup.alerts) {
          stmt.run(
            item.id || `alr_${randomBytes(12).toString("hex")}`,
            userId,
            item.symbol,
            item.target_price,
            item.condition,
            item.is_triggered || 0,
            item.added_at || timestamp
          );
        }
      }
      
      // 6. Restore Chats
      if (Array.isArray(backup.chats)) {
        const sessStmt = db.prepare(`
          INSERT OR REPLACE INTO chat_sessions (id, user_id, title, time_label, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `);
        const msgStmt = db.prepare(`
          INSERT OR REPLACE INTO chat_messages (id, session_id, sender, text, timestamp, summary, technical_view, risk_factors)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        for (const chat of backup.chats) {
          if (!chat.session || !chat.session.id) continue;
          sessStmt.run(
            chat.session.id,
            userId,
            chat.session.title,
            chat.session.time_label || "Recent",
            chat.session.updated_at || timestamp
          );
          
          if (Array.isArray(chat.messages)) {
            for (const msg of chat.messages) {
              msgStmt.run(
                msg.id || `msg_${randomBytes(12).toString("hex")}`,
                chat.session.id,
                msg.sender,
                msg.text,
                msg.timestamp || timestamp,
                msg.summary || null,
                msg.technical_view || null,
                msg.risk_factors || null
              );
            }
          }
        }
      }

      // 7. Restore Futures Positions
      if (Array.isArray(backup.futuresPositions)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO user_futures_positions (user_id, symbol, side, entry_price, qty, leverage, margin, added_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const item of backup.futuresPositions) {
          stmt.run(userId, item.symbol, item.side, item.entry_price, item.qty, item.leverage, item.margin, item.added_at || timestamp);
        }
      }

      // 8. Restore Futures Trades
      if (Array.isArray(backup.futuresTrades)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO user_futures_trades (id, user_id, symbol, side, type, qty, price, leverage, realized_pnl, fee, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const item of backup.futuresTrades) {
          stmt.run(
            item.id || `ftr_${randomBytes(12).toString("hex")}`,
            userId,
            item.symbol,
            item.side,
            item.type,
            item.qty,
            item.price,
            item.leverage,
            item.realized_pnl,
            item.fee,
            item.timestamp || timestamp
          );
        }
      }
      
      db.exec("COMMIT");
      
      // Create session for user
      await createSessionForUser(userId, res);
      res.json({ success: true, user: { id: userId, email: backup.user.email, name: backup.user.name, avatar_url: backup.user.avatar_url } });
    } catch (err: any) {
      db.exec("ROLLBACK");
      throw err;
    }
  } catch (error: any) {
    console.error("Import Backup Error:", error);
    res.status(500).json({ error: error.message || "Failed to import backup" });
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const db = await getMarketDb();
    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (user) {
      const resetToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      db.prepare("INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(
        randomBytes(16).toString("hex"), user.id, hashSessionToken(resetToken), expiresAt, nowIso()
      );
      const PORT = Number(process.env.PORT || 3000);
      console.log(`\n\n[MOCK EMAIL] To: ${email}\nSubject: Password Reset\nLink: http://localhost:${PORT}/reset-password?token=${resetToken}\n\n`);
    }
    res.json({ success: true, message: "If that email exists, a reset link has been sent." });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to process request" });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, new_password } = req.body;
    const db = await getMarketDb();
    const resetReq = db.prepare("SELECT * FROM password_resets WHERE token_hash = ? AND expires_at > ?").get(hashSessionToken(token), nowIso());
    if (!resetReq) return res.status(400).json({ error: "Invalid or expired reset token" });
    
    db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(hashPassword(new_password), nowIso(), resetReq.user_id);
    db.prepare("DELETE FROM password_resets WHERE id = ?").run(resetReq.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to reset password" });
  }
});

app.post("/api/auth/2fa/generate", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const secretInfo = speakeasy.generateSecret({ name: user.email, issuer: "Lax's Studio" });
    const secret = secretInfo.base32;
    const otpauth = secretInfo.otpauth_url as string;
    const qrCodeDataUrl = await QRCode.toDataURL(otpauth);
    
    const db = await getMarketDb();
    db.prepare("UPDATE users SET two_factor_secret = ? WHERE id = ?").run(secret, user.id);
    res.json({ secret, qrCodeDataUrl });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to generate 2FA" });
  }
});

app.post("/api/auth/2fa/enable", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { token } = req.body;
    const db = await getMarketDb();
    const row = db.prepare("SELECT two_factor_secret FROM users WHERE id = ?").get(user.id);
    if (!row?.two_factor_secret) return res.status(400).json({ error: "2FA not initialized" });
    
    const isValid = speakeasy.totp.verify({ secret: row.two_factor_secret, encoding: 'base32', token });
    if (!isValid) return res.status(400).json({ error: "Invalid 2FA token" });
    
    db.prepare("UPDATE users SET two_factor_enabled = 1 WHERE id = ?").run(user.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to enable 2FA" });
  }
});

app.post("/api/auth/2fa/disable", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { password } = req.body;
    const db = await getMarketDb();
    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id);
    if (!row || !verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ error: "Incorrect password" });
    }
    db.prepare("UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL WHERE id = ?").run(user.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to disable 2FA" });
  }
});

// --- 3.8 API Endpoint: OAuth (Placeholders) ---
app.get("/api/auth/oauth/google", (req, res) => {
  res.status(501).json({ error: "Google OAuth is not configured. Please add GOOGLE_CLIENT_ID to .env and implement the callback." });
});

app.get("/api/auth/oauth/github", (req, res) => {
  res.status(501).json({ error: "GitHub OAuth is not configured. Please add GITHUB_CLIENT_ID to .env and implement the callback." });
});

// 4. API Endpoint: Search and Add Custom Tickers
app.get("/api/assets/search", async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();
    const localResults = searchLocalAssetDirectory(query);
    const [databaseResults, providerResults] = await Promise.all([
      query ? searchDatabaseAssets(query) : Promise.resolve([]),
      query ? searchProviderAssets(query) : Promise.resolve([])
    ]);

    const results = await attachTrackedState(
      mergeAssetSearchResults(databaseResults, localResults, providerResults).slice(0, 18)
    );

    res.setHeader("Cache-Control", "no-store");
    res.json({ results });
  } catch (error: any) {
    console.error("Asset Search Error:", error);
    res.status(500).json({ error: error.message || "Failed to search assets" });
  }
});

app.post("/api/assets/add", async (req, res) => {
  try {
    let { symbol, category, name } = req.body;
    if (!symbol) return res.status(400).json({ error: "Symbol is required" });

    symbol = normalizeAssetSymbol(symbol);
    if (!isValidAssetSymbol(symbol)) {
      return res.status(400).json({ error: "Use a valid stock, ETF, or crypto symbol." });
    }

    const knownAsset = SEARCHABLE_ASSET_BY_SYMBOL.get(symbol);
    const resolvedCategory = normalizeAssetCategory(category || knownAsset?.category, symbol);
    const asset: MarketAsset = {
      symbol,
      name: String(name || knownAsset?.name || symbol).trim(),
      category: resolvedCategory,
      price: 0,
      changePercent: 0,
      marketCap: "N/A",
      peRatio: "N/A",
      volume: "N/A",
      currencySymbol: knownAsset?.currencySymbol || "$"
    };

    let assetToPersist = asset;
    let provider = "user";
    let dataQuality: MarketAsset["dataQuality"] = "unfetched";

    if (asset.category === "Crypto") {
      const cryptoResult = await fetchCryptoQuotes([asset]);
      const liveAsset = cryptoResult.updates.get(asset.symbol);
      if (liveAsset) {
        assetToPersist = liveAsset;
        provider = cryptoResult.provider;
        dataQuality = "live";
      }
    } else if (asset.category === "US" || asset.category === "ETFs") {
      const stockResult = await fetchStockQuotes([asset]);
      const liveAsset = stockResult.updates.get(asset.symbol);
      if (liveAsset) {
        assetToPersist = liveAsset;
        provider = stockResult.providers.get(asset.symbol) || stockResult.status;
        dataQuality = "live";
      } else {
        provider = stockResult.status;
      }
    }

    await persistMarketAsset(assetToPersist, provider, dataQuality);
    marketDataCache = null;
    
    res.json({ success: true, asset: assetToPersist, provider, dataQuality });
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
      { task: "sentiment", maxTokens: 150, temperature: 0.05 }
    );

    cachedSentiment = parsedData;
    cachedSentimentTime = now;
    res.json(parsedData);
  } catch (error) {
    console.error("Sentiment API Error:", error);
    res.status(500).json({ error: "Failed to calculate sentiment" });
  }
});

// 4.3 API Endpoint: Deep Analysis Web Search & Summary
app.get("/api/futures/analyze/:symbol", async (req, res) => {
  try {
    const symbol = String(req.params.symbol || "").toUpperCase().trim();
    if (!symbol) {
      return res.status(400).json({ error: "Symbol is required" });
    }

    const baseSymbol = symbol.replace(/USDT$/, "").replace(/USD$/, "");
    
    // Simulate web search
    const searchQuery = `Crypto coin ${baseSymbol} project fundamental analysis, latest news, use case, tokenomics`;
    let searchResult = "";
    try {
      searchResult = await searchTavily(searchQuery);
    } catch (e) {
      console.warn("Tavily search failed for deep analysis:", e);
    }

    const systemInstruction = 
      `You are a senior quantitative cryptocurrency researcher. You are providing a deep fundamental overview of the asset ${baseSymbol}. ` +
      `Read the following recent web search results about the project (if any). ` +
      `Then write a highly professional, dense 1-2 paragraph summary of the coin's fundamental value, current narrative/news, and potential long-term use case. ` +
      `Do NOT use markdown headers, just plain text paragraphs. If search results are empty, rely on your internal knowledge of ${baseSymbol}.`;

    const promptText = searchResult 
      ? `Web Search Results for ${baseSymbol}:\n${searchResult}\n\nProvide the fundamental summary.`
      : `Provide the fundamental summary for ${baseSymbol} based on your training data.`;

    const aiSummary = await callNvidiaText(
      [
        { role: "system", content: systemInstruction },
        { role: "user", content: promptText }
      ],
      "Fundamental analysis is currently unavailable. The asset primarily trades on momentum and technical levels.",
      { task: "assetProfile", maxTokens: 300, temperature: 0.2 }
    );

    res.json({
      symbol,
      baseSymbol,
      summary: aiSummary,
      searchPerformed: !!searchResult
    });
  } catch (error: any) {
    console.error("Deep Analyze API Error:", error);
    res.status(500).json({ error: "Failed to run deep analysis" });
  }
});

// 4.5. API Endpoint: Quantitative AI Prediction
app.post("/api/prediction", async (req, res) => {
  try {
    const symbol = String(req.body?.symbol || "").toUpperCase().trim();
    const horizon = (req.body?.horizon || "1M") as PredictionHorizon;
    const model = String(req.body?.model || "finpilot-v1");
    const responseLanguage = getResponseLanguage(req.body?.language);

    if (!symbol) {
      return res.status(400).json({ error: "Symbol is required" });
    }

    const prediction = await buildAiPrediction(symbol, horizon, responseLanguage, model);
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
    const user = await requireUser(req, res);
    if (!user) return;
    const db = await getMarketDb();
    const rows = db.prepare("SELECT symbol FROM user_watchlist WHERE user_id = ? ORDER BY added_at ASC").all(user.id);
    res.json(rows.map((r: any) => r.symbol));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/watchlist", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { symbol } = req.body;
    if (!symbol) return res.status(400).json({ error: "symbol required" });
    const db = await getMarketDb();
    db.prepare("INSERT OR REPLACE INTO user_watchlist (user_id, symbol, added_at) VALUES (?, ?, ?)").run(user.id, symbol, new Date().toISOString());
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/watchlist/:symbol", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { symbol } = req.params;
    const db = await getMarketDb();
    db.prepare("DELETE FROM user_watchlist WHERE user_id = ? AND symbol = ?").run(user.id, symbol);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/watchlist/reorder", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { order } = req.body; // array of symbols
    const db = await getMarketDb();
    const stmt = db.prepare("UPDATE user_watchlist SET added_at = ? WHERE user_id = ? AND symbol = ?");
    db.exec("BEGIN TRANSACTION");
    try {
      order.forEach((sym: string, idx: number) => {
        // use timestamp based on index to preserve ordering
        const date = new Date(Date.now() + idx * 1000).toISOString();
        stmt.run(date, user.id, sym);
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

app.get("/api/fx/rates", async (req, res) => {
  try {
    const requestedSymbols = String(req.query.symbols || FX_SUPPORTED_CURRENCIES.join(","))
      .split(",")
      .map(symbol => symbol.trim().toUpperCase())
      .filter((symbol): symbol is DisplayCurrency => (FX_SUPPORTED_CURRENCIES as string[]).includes(symbol));

    const symbols = Array.from(new Set(["USD", ...requestedSymbols]));
    const now = Date.now();
    if (fxRateCache && now - fxRateCache.updatedAt < FX_CACHE_TTL_MS) {
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.json({
        ...fxRateCache.payload,
        rates: Object.fromEntries(symbols.map(symbol => [symbol, fxRateCache!.payload.rates[symbol] || 1])),
        source: "cached"
      });
    }

    const quoteSymbols = symbols.filter(symbol => symbol !== "USD");
    const url = `https://api.frankfurter.dev/v2/rates?base=USD&quotes=${encodeURIComponent(quoteSymbols.join(","))}`;
    const rows = await fetchJson<Array<{ date: string; base: string; quote: string; rate: number }>>(url, {
      timeoutMs: 10000
    });

    const rates = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.quote.toUpperCase()] = row.rate;
      return acc;
    }, { USD: 1 });

    const payload = {
      base: "USD" as const,
      rates,
      date: rows[0]?.date,
      provider: "Frankfurter",
      updatedAt: new Date().toISOString(),
      source: "live" as const
    };

    fxRateCache = { updatedAt: now, payload };
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json(payload);
  } catch (error: any) {
    console.error("FX Rates Error:", error);
    if (fxRateCache) {
      return res.json({ ...fxRateCache.payload, source: "cached" });
    }
    res.json({
      base: "USD",
      rates: { USD: 1 },
      provider: "Frankfurter",
      updatedAt: new Date().toISOString(),
      source: "fallback",
      error: error.message || "Failed to load exchange rates"
    });
  }
});

// 5. API Endpoints: Holdings
app.get("/api/portfolio", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const db = await getMarketDb();
    const rows = db.prepare("SELECT * FROM user_holdings WHERE user_id = ? ORDER BY added_at ASC").all(user.id);
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
    const user = await requireUser(req, res);
    if (!user) return;
    const { id, asset, name, category, qty, avgCost } = req.body;
    const db = await getMarketDb();
    const holdingId = id || Date.now().toString();
    db.prepare("INSERT INTO user_holdings (id, user_id, asset, name, category, qty, avg_cost, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      holdingId, user.id, asset, name, category, qty, avgCost, new Date().toISOString()
    );
    res.json({ success: true, id: holdingId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/portfolio/:id", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { id } = req.params;
    const db = await getMarketDb();
    db.prepare("DELETE FROM user_holdings WHERE id = ? AND user_id = ?").run(id, user.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. API Endpoints: Settings
app.get("/api/settings", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const db = await getMarketDb();
    const rows = db.prepare("SELECT key, value FROM user_settings WHERE user_id = ?").all(user.id);
    const settings: Record<string, string> = {};
    rows.forEach((r: any) => settings[r.key] = r.value);
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/settings", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const settings = req.body; // Record<string, string>
    const db = await getMarketDb();
    const stmt = db.prepare("INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)");
    db.exec("BEGIN TRANSACTION");
    try {
      Object.entries(settings).forEach(([key, value]) => {
        stmt.run(user.id, key, String(value));
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
    const user = await requireUser(req, res);
    if (!user) return;
    const db = await getMarketDb();
    const sessions = db.prepare("SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC").all(user.id);
    const messages = db.prepare(`
      SELECT chat_messages.*
      FROM chat_messages
      INNER JOIN chat_sessions ON chat_sessions.id = chat_messages.session_id
      WHERE chat_sessions.user_id = ?
      ORDER BY chat_messages.timestamp ASC
    `).all(user.id);
    
    const storagePrefix = `${user.id}:`;
    const result = sessions.map((s: any) => ({
      id: String(s.id).startsWith(storagePrefix) ? String(s.id).slice(storagePrefix.length) : s.id,
      title: s.title,
      timeLabel: s.time_label,
      messages: messages.filter((m: any) => m.session_id === s.id).map((m: any) => ({
        id: String(m.id).startsWith(storagePrefix) ? String(m.id).slice(storagePrefix.length) : m.id,
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
    const user = await requireUser(req, res);
    if (!user) return;
    const session = req.body;
    const db = await getMarketDb();
    const { id, title, timeLabel, messages } = session;
    const clientSessionId = String(id || `session_${Date.now()}`);
    const storagePrefix = `${user.id}:`;
    const storageSessionId = `${storagePrefix}${clientSessionId}`;
    
    db.exec("BEGIN TRANSACTION");
    try {
      db.prepare("INSERT OR REPLACE INTO chat_sessions (id, user_id, title, time_label, updated_at) VALUES (?, ?, ?, ?, ?)").run(
        storageSessionId, user.id, title, timeLabel, new Date().toISOString()
      );
      
      db.prepare(`
        DELETE FROM chat_messages
        WHERE session_id = ?
          AND session_id IN (SELECT id FROM chat_sessions WHERE user_id = ?)
      `).run(storageSessionId, user.id);
      
      const stmt = db.prepare("INSERT INTO chat_messages (id, session_id, sender, text, timestamp, summary, technical_view, risk_factors) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      messages.forEach((m: any) => {
        stmt.run(`${storagePrefix}${m.id}`, storageSessionId, m.sender, m.text, m.timestamp, m.summary || null, m.technicalView || null, m.riskFactors || null);
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
    const user = await requireUser(req, res);
    if (!user) return;
    const db = await getMarketDb();
    const alerts = db.prepare("SELECT * FROM user_alerts WHERE user_id = ? ORDER BY added_at DESC").all(user.id);
    res.json(alerts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/alerts", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { symbol, targetPrice, condition } = req.body;
    const db = await getMarketDb();
    const id = `alt_${user.id}_${Date.now()}`;
    db.prepare("INSERT INTO user_alerts (id, user_id, symbol, target_price, condition, added_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      id, user.id, symbol, targetPrice, condition, new Date().toISOString()
    );
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/alerts/:id", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { id } = req.params;
    const db = await getMarketDb();
    db.prepare("DELETE FROM user_alerts WHERE id = ? AND user_id = ?").run(id, user.id);
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

// 9. API Endpoints: Futures Demo Simulator
app.get("/api/futures/account", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const db = await getMarketDb();
    
    // 1. Get or initialize demo balance
    let balanceRow = db.prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'demo_balance'").get(user.id);
    let balance = 10000;
    if (!balanceRow) {
      db.prepare("INSERT INTO user_settings (user_id, key, value) VALUES (?, 'demo_balance', '10000')").run(user.id);
    } else {
      balance = parseFloat(balanceRow.value);
    }
    
    // 2. Get open positions
    const positions = db.prepare("SELECT * FROM user_futures_positions WHERE user_id = ?").all(user.id);
    
    // 3. Get recent trades (last 50)
    const trades = db.prepare("SELECT * FROM user_futures_trades WHERE user_id = ? ORDER BY timestamp DESC LIMIT 50").all(user.id);
    
    res.json({
      balance,
      positions: positions.map((p: any) => ({
        symbol: p.symbol,
        side: p.side,
        entryPrice: p.entry_price,
        qty: p.qty,
        leverage: p.leverage,
        margin: p.margin,
        addedAt: p.added_at,
        marginMode: p.margin_mode,
        stopLoss: p.stop_loss,
        takeProfit: p.take_profit
      })),
      trades: trades.map((t: any) => ({
        id: t.id,
        symbol: t.symbol,
        side: t.side,
        type: t.type,
        qty: t.qty,
        price: t.price,
        leverage: t.leverage,
        realizedPnl: t.realized_pnl,
        fee: t.fee,
        timestamp: t.timestamp
      }))
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/futures/order", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { symbol, side, qty, leverage, marginMode = 'ISOLATED', stopLoss, takeProfit } = req.body;
    if (!symbol || !side || !qty || !leverage) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    const price = tickerPrices.get(symbol);
    if (!price) {
      return res.status(400).json({ error: "Market price not currently available for " + symbol });
    }
    
    const db = await getMarketDb();
    
    // 1. Get balance
    let balanceRow = db.prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'demo_balance'").get(user.id);
    let balance = balanceRow ? parseFloat(balanceRow.value) : 10000;
    
    const margin = (qty * price) / leverage;
    const fee = qty * price * 0.0005; // 0.05% fee
    const totalCost = margin + fee;
    
    if (balance < totalCost) {
      return res.status(400).json({ error: "Insufficient demo balance to cover margin and entry fee" });
    }
    
    // Check if position already exists for this symbol
    const existing = db.prepare("SELECT * FROM user_futures_positions WHERE user_id = ? AND symbol = ?").get(user.id, symbol);
    
    db.exec("BEGIN TRANSACTION");
    try {
      const timestamp = new Date().toISOString();
      const tradeId = `ftr_${randomBytes(12).toString("hex")}`;
      let pnl = 0;

      if (existing) {
        if (existing.side === side) {
          // Same side: Average entry price, accumulate qty and margin, update SL/TP
          const newQty = existing.qty + qty;
          const newEntryPrice = ((existing.entry_price * existing.qty) + (price * qty)) / newQty;
          const newMargin = existing.margin + margin;
          
          db.prepare(`
            UPDATE user_futures_positions 
            SET entry_price = ?, qty = ?, margin = ?, added_at = ?, margin_mode = ?, stop_loss = ?, take_profit = ?
            WHERE user_id = ? AND symbol = ?
          `).run(newEntryPrice, newQty, newMargin, timestamp, marginMode, stopLoss !== undefined ? (stopLoss || null) : existing.stop_loss, takeProfit !== undefined ? (takeProfit || null) : existing.take_profit, user.id, symbol);

          // Deduct totalCost (margin + fee) from balance
          const newBalance = balance - totalCost;
          db.prepare("INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, 'demo_balance', ?)").run(user.id, String(newBalance));
        } else {
          // Opposite side: Netting
          if (qty < existing.qty) {
            // Reduce position size
            const remainingQty = existing.qty - qty;
            const closedRatio = qty / existing.qty;
            const closedMargin = existing.margin * closedRatio;
            const remainingMargin = existing.margin - closedMargin;

            if (existing.side === "LONG") {
              pnl = qty * (price - existing.entry_price);
            } else {
              pnl = qty * (existing.entry_price - price);
            }

            // Refund closedMargin + margin (since it was deducted from totalCost) + pnl
            const newBalance = balance - fee + closedMargin + pnl;
            db.prepare("INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, 'demo_balance', ?)").run(user.id, String(newBalance));

            db.prepare(`
              UPDATE user_futures_positions 
              SET qty = ?, margin = ?
              WHERE user_id = ? AND symbol = ?
            `).run(remainingQty, remainingMargin, user.id, symbol);
          } else if (qty === existing.qty) {
            // Close position completely
            if (existing.side === "LONG") {
              pnl = qty * (price - existing.entry_price);
            } else {
              pnl = qty * (existing.entry_price - price);
            }

            // Refund entire existing margin + margin (since it was deducted from totalCost) + pnl
            const newBalance = balance - fee + existing.margin + pnl;
            db.prepare("INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, 'demo_balance', ?)").run(user.id, String(newBalance));
            db.prepare("DELETE FROM user_futures_positions WHERE user_id = ? AND symbol = ?").run(user.id, symbol);
          } else {
            // qty > existing.qty: Reverse the position!
            const closedQty = existing.qty;
            if (existing.side === "LONG") {
              pnl = closedQty * (price - existing.entry_price);
            } else {
              pnl = closedQty * (existing.entry_price - price);
            }

            const newQty = qty - existing.qty;
            const newPosMargin = (newQty * price) / leverage;

            const newBalance = balance - totalCost + existing.margin + pnl;
            db.prepare("INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, 'demo_balance', ?)").run(user.id, String(newBalance));

            db.prepare(`
              UPDATE user_futures_positions 
              SET side = ?, entry_price = ?, qty = ?, leverage = ?, margin = ?, added_at = ?, margin_mode = ?, stop_loss = ?, take_profit = ?
              WHERE user_id = ? AND symbol = ?
            `).run(side, price, newQty, leverage, newPosMargin, timestamp, marginMode, stopLoss || null, takeProfit || null, user.id, symbol);
          }
        }
      } else {
        // No existing position: Insert normally
        const newBalance = balance - totalCost;
        db.prepare("INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, 'demo_balance', ?)").run(user.id, String(newBalance));
        
        db.prepare(`
          INSERT INTO user_futures_positions (user_id, symbol, side, entry_price, qty, leverage, margin, added_at, margin_mode, stop_loss, take_profit)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(user.id, symbol, side, price, qty, leverage, margin, timestamp, marginMode, stopLoss || null, takeProfit || null);
      }

      // Record trade in history
      db.prepare(`
        INSERT INTO user_futures_trades (id, user_id, symbol, side, type, qty, price, leverage, realized_pnl, fee, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(tradeId, user.id, symbol, side === "LONG" ? "BUY" : "SELL", "MARKET", qty, price, leverage, pnl, fee, timestamp);
      
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

app.post("/api/futures/update-sl-tp", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { symbol, stopLoss, takeProfit } = req.body;
    if (!symbol) return res.status(400).json({ error: "Symbol is required" });

    const db = await getMarketDb();
    db.prepare(`
      UPDATE user_futures_positions 
      SET stop_loss = ?, take_profit = ?
      WHERE user_id = ? AND symbol = ?
    `).run(stopLoss !== undefined ? (stopLoss || null) : null, takeProfit !== undefined ? (takeProfit || null) : null, user.id, symbol);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/futures/close", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { symbol, closePrice } = req.body;
    if (!symbol || !closePrice) {
      return res.status(400).json({ error: "Missing symbol or close price" });
    }
    
    const db = await getMarketDb();
    const position = db.prepare("SELECT * FROM user_futures_positions WHERE user_id = ? AND symbol = ?").get(user.id, symbol);
    if (!position) {
      return res.status(404).json({ error: "Position not found" });
    }
    
    // Calculate PnL
    let pnl = 0;
    if (position.side === "LONG") {
      pnl = position.qty * (closePrice - position.entry_price);
    } else {
      pnl = position.qty * (position.entry_price - closePrice);
    }
    
    const fee = position.qty * closePrice * 0.0005; // 0.05% close fee
    
    let balanceRow = db.prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'demo_balance'").get(user.id);
    let balance = balanceRow ? parseFloat(balanceRow.value) : 10000;
    
    db.exec("BEGIN TRANSACTION");
    try {
      // Add back margin + PnL - fee to balance
      const newBalance = balance + position.margin + pnl - fee;
      db.prepare("INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, 'demo_balance', ?)").run(user.id, String(newBalance));
      
      // Delete position
      db.prepare("DELETE FROM user_futures_positions WHERE user_id = ? AND symbol = ?").run(user.id, symbol);
      
      // Record trade in history
      const timestamp = new Date().toISOString();
      const tradeId = `ftr_${randomBytes(12).toString("hex")}`;
      db.prepare(`
        INSERT INTO user_futures_trades (id, user_id, symbol, side, type, qty, price, leverage, realized_pnl, fee, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(tradeId, user.id, symbol, position.side === "LONG" ? "SELL" : "BUY", "MARKET", position.qty, closePrice, position.leverage, pnl, fee, timestamp);
      
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

app.post("/api/futures/liquidate", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { symbol, liqPrice } = req.body;
    if (!symbol || !liqPrice) {
      return res.status(400).json({ error: "Missing symbol or liquidation price" });
    }
    
    const db = await getMarketDb();
    const position = db.prepare("SELECT * FROM user_futures_positions WHERE user_id = ? AND symbol = ?").get(user.id, symbol);
    if (!position) {
      return res.status(404).json({ error: "Position not found" });
    }
    
    const fee = position.qty * liqPrice * 0.0005; // 0.05% fee
    const pnl = -position.margin; // entire margin is lost on liquidation
    
    let balanceRow = db.prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'demo_balance'").get(user.id);
    let balance = balanceRow ? parseFloat(balanceRow.value) : 10000;
    
    db.exec("BEGIN TRANSACTION");
    try {
      // Deduct close fee only (since margin is already deducted and not returned)
      const newBalance = balance - fee;
      db.prepare("INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, 'demo_balance', ?)").run(user.id, String(newBalance));
      
      // Delete position
      db.prepare("DELETE FROM user_futures_positions WHERE user_id = ? AND symbol = ?").run(user.id, symbol);
      
      // Record trade in history
      const timestamp = new Date().toISOString();
      const tradeId = `ftr_${randomBytes(12).toString("hex")}`;
      db.prepare(`
        INSERT INTO user_futures_trades (id, user_id, symbol, side, type, qty, price, leverage, realized_pnl, fee, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(tradeId, user.id, symbol, position.side === "LONG" ? "SELL" : "BUY", "LIQUIDATION", position.qty, liqPrice, position.leverage, pnl, fee, timestamp);
      
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

app.post("/api/futures/reset", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const db = await getMarketDb();
    db.exec("BEGIN TRANSACTION");
    try {
      db.prepare("DELETE FROM user_futures_positions WHERE user_id = ?").run(user.id);
      // Optionally clear history too
      db.prepare("DELETE FROM user_futures_trades WHERE user_id = ?").run(user.id);
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

app.use("/api", (req, res) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.originalUrl}. Restart the server if this route was just added.`
  });
});

// --- CACHE LAYER FOR SMA & VOLATILITY ---
export const marketAnalysisCache = new Map<string, { sma30: number, volatility: number, pumpDays: number, dumpDays: number }>();

async function updateMarketAnalysisCache() {
  try {
    const tickerRes = await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr");
    if (!tickerRes.ok) return;
    const tickers = await tickerRes.json();
    
    // Analyze top 50 pairs by volume to save rate limit
    const topPairs = tickers
      .filter((t: any) => t.symbol.endsWith("USDT"))
      .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 50);

    for (let i = 0; i < topPairs.length; i++) {
      const coin = topPairs[i];
      try {
        const klinesRes = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${coin.symbol}&interval=1d&limit=30`);
        if (!klinesRes.ok) continue;
        const klines = await klinesRes.json();
        if (klines.length < 15) continue;
        
        let pumpDays = 0;
        let dumpDays = 0;
        let sumClose = 0;
        let sumRange = 0;
        
        for (let j = 0; j < klines.length; j++) {
          const open = parseFloat(klines[j][1]);
          const high = parseFloat(klines[j][2]);
          const low = parseFloat(klines[j][3]);
          const close = parseFloat(klines[j][4]);
          
          const dailyChange = ((close - open) / open) * 100;
          if (dailyChange > 10) pumpDays++; 
          if (dailyChange < -10) dumpDays++;
          
          sumClose += close;
          sumRange += ((high - low) / open) * 100;
        }
        
        const sma30 = sumClose / klines.length;
        const volatility = sumRange / klines.length;
        
        marketAnalysisCache.set(coin.symbol, { sma30, volatility, pumpDays, dumpDays });
        
        await new Promise(r => setTimeout(r, 50)); 
      } catch (e) {
      }
    }
  } catch (e) {
    console.error("Failed to update Market Analysis Cache", e);
  }
}

export const tickerPrices = new Map<string, number>();
let lastCheckTime = 0;

async function checkPositionsAndTriggerSLTPLiquidations(tickers: any[], io: any) {
  try {
    const db = await getMarketDb();
    const positions = db.prepare("SELECT * FROM user_futures_positions").all();
    if (positions.length === 0) return;

    for (const pos of positions) {
      const ticker = tickers.find(t => t.symbol === pos.symbol);
      if (!ticker) continue;
      const currentPrice = ticker.price;

      // 1. Calculate Liquidation Price
      let liqPrice = 0;
      if (pos.margin_mode === "CROSS") {
        let balanceRow = db.prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'demo_balance'").get(pos.user_id);
        let balance = balanceRow ? parseFloat(balanceRow.value) : 10000;
        
        if (pos.side === "LONG") {
          liqPrice = pos.entry_price - ((pos.margin + balance) / pos.qty);
          if (liqPrice < 0) liqPrice = 0;
        } else {
          liqPrice = pos.entry_price + ((pos.margin + balance) / pos.qty);
        }
      } else {
        // ISOLATED
        if (pos.side === "LONG") {
          liqPrice = pos.entry_price * (1 - 1 / pos.leverage);
        } else {
          liqPrice = pos.entry_price * (1 + 1 / pos.leverage);
        }
      }

      // 2. Check Liquidation
      let isLiquidated = false;
      if (pos.side === "LONG" && currentPrice <= liqPrice) {
        isLiquidated = true;
      } else if (pos.side === "SHORT" && currentPrice >= liqPrice) {
        isLiquidated = true;
      }

      if (isLiquidated) {
        console.log(`⚡ Liquidation triggered for ${pos.user_id} - ${pos.symbol} (Side: ${pos.side}, Price: ${currentPrice}, Liq Price: ${liqPrice})`);
        
        db.exec("BEGIN TRANSACTION");
        try {
          let balanceRow = db.prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'demo_balance'").get(pos.user_id);
          let balance = balanceRow ? parseFloat(balanceRow.value) : 10000;
          
          let newBalance = balance;
          let pnl = 0;
          if (pos.margin_mode === "CROSS") {
            if (pos.side === "LONG") {
              pnl = pos.qty * (currentPrice - pos.entry_price);
            } else {
              pnl = pos.qty * (pos.entry_price - currentPrice);
            }
            newBalance = Math.max(0, balance + pos.margin + pnl);
          } else {
            // Isolated: Wipes only the position margin. ví chính giữ nguyên.
          }
          
          db.prepare("INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, 'demo_balance', ?)").run(pos.user_id, String(newBalance));
          db.prepare("DELETE FROM user_futures_positions WHERE user_id = ? AND symbol = ?").run(pos.user_id, pos.symbol);
          
          // Record trade
          const tradeId = `ftr_${randomBytes(12).toString("hex")}`;
          db.prepare(`
            INSERT INTO user_futures_trades (id, user_id, symbol, side, type, qty, price, leverage, realized_pnl, fee, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(tradeId, pos.user_id, pos.symbol, pos.side === "LONG" ? "SELL" : "BUY", "LIQUIDATION", pos.qty, currentPrice, pos.leverage, pos.margin_mode === "CROSS" ? pnl : -pos.margin, 0, new Date().toISOString());

          db.exec("COMMIT");
          
          io.to("user_" + pos.user_id).emit("position_liquidated", { userId: pos.user_id, symbol: pos.symbol, side: pos.side, liqPrice, price: currentPrice, newBalance });
        } catch (e) {
          db.exec("ROLLBACK");
          console.error(e);
        }
        continue;
      }

      // 3. Check Stop Loss (SL)
      let isSL = false;
      if (pos.stop_loss) {
        if (pos.side === "LONG" && currentPrice <= pos.stop_loss) {
          isSL = true;
        } else if (pos.side === "SHORT" && currentPrice >= pos.stop_loss) {
          isSL = true;
        }
      }

      if (isSL) {
        console.log(`🎯 Stop Loss triggered for ${pos.user_id} - ${pos.symbol} (Side: ${pos.side}, SL Price: ${pos.stop_loss}, Price: ${currentPrice})`);
        await closePositionWithReason(db, pos, pos.stop_loss, "STOP_LOSS", io);
        continue;
      }

      // 4. Check Take Profit (TP)
      let isTP = false;
      if (pos.take_profit) {
        if (pos.side === "LONG" && currentPrice >= pos.take_profit) {
          isTP = true;
        } else if (pos.side === "SHORT" && currentPrice <= pos.take_profit) {
          isTP = true;
        }
      }

      if (isTP) {
        console.log(`💰 Take Profit triggered for ${pos.user_id} - ${pos.symbol} (Side: ${pos.side}, TP Price: ${pos.take_profit}, Price: ${currentPrice})`);
        await closePositionWithReason(db, pos, pos.take_profit, "TAKE_PROFIT", io);
        continue;
      }
    }
  } catch (err) {
    console.error("Error checking positions:", err);
  }
}

async function closePositionWithReason(db: any, pos: any, triggerPrice: number, type: "STOP_LOSS" | "TAKE_PROFIT", io: any) {
  db.exec("BEGIN TRANSACTION");
  try {
    let pnl = 0;
    if (pos.side === "LONG") {
      pnl = pos.qty * (triggerPrice - pos.entry_price);
    } else {
      pnl = pos.qty * (pos.entry_price - triggerPrice);
    }
    const fee = pos.qty * triggerPrice * 0.0005;
    
    let balanceRow = db.prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'demo_balance'").get(pos.user_id);
    let balance = balanceRow ? parseFloat(balanceRow.value) : 10000;

    const newBalance = balance + pos.margin + pnl - fee;
    db.prepare("INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, 'demo_balance', ?)").run(pos.user_id, String(newBalance));
    db.prepare("DELETE FROM user_futures_positions WHERE user_id = ? AND symbol = ?").run(pos.user_id, pos.symbol);

    const tradeId = `ftr_${randomBytes(12).toString("hex")}`;
    db.prepare(`
      INSERT INTO user_futures_trades (id, user_id, symbol, side, type, qty, price, leverage, realized_pnl, fee, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tradeId, pos.user_id, pos.symbol, pos.side === "LONG" ? "SELL" : "BUY", type, pos.qty, triggerPrice, pos.leverage, pnl, fee, new Date().toISOString());

    db.exec("COMMIT");
    io.to("user_" + pos.user_id).emit("position_closed_auto", { userId: pos.user_id, symbol: pos.symbol, type, triggerPrice, pnl, newBalance });
  } catch (e) {
    db.exec("ROLLBACK");
    console.error("Failed to execute auto close position:", e);
  }
}

async function startServer() {
  const httpServer = createHttpServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*" }
  });

  io.engine.use(async (req: any, res: any, next: any) => {
    const isHandshake = req._query.sid === undefined;
    if (isHandshake) {
      const user = await getOptionalUser(req);
      if (user) {
        req.user = user;
      }
    }
    next();
  });

  io.on("connection", (socket: any) => {
    if (socket.request.user) {
      socket.join("user_" + socket.request.user.id);
    }
  });

  // Binance WebSocket connection for real-time pushing
  function connectBinanceWS() {
    try {
      const ws = new WebSocket('wss://fstream.binance.com/ws/!ticker@arr');
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data.toString());
          const usdtPairs = data.filter((item: any) => item.s.endsWith("USDT")).map((item: any) => ({
            symbol: item.s,
            price: parseFloat(item.c),
            change24h: parseFloat(item.P),
            volume24h: parseFloat(item.q)
          }));
          
          // Cache current prices
          usdtPairs.forEach((t: any) => tickerPrices.set(t.symbol, t.price));

          // Run checks every 3 seconds
          const now = Date.now();
          if (now - lastCheckTime > 3000) {
            lastCheckTime = now;
            checkPositionsAndTriggerSLTPLiquidations(usdtPairs, io);
          }

          io.emit("market_tickers", usdtPairs);
        } catch (e) {}
      };

      ws.onclose = () => {
        console.log("Binance WS closed. Reconnecting in 5s...");
        setTimeout(connectBinanceWS, 5000);
      };
      
      ws.onerror = (err) => {
        console.error("Binance WS error:", err);
      };
    } catch (err) {
      console.log("WebSocket built-in not found or failed, using polling fallback. Note: Upgrade to Node 22+ to use native fetch/WebSocket.");
    }
  }

  // Start Funding Rate Payments (simulated every 1 minute)
  const fundingRate = 0.0001; // 0.01%
  setInterval(async () => {
    try {
      const db = await getMarketDb();
      const positions = db.prepare("SELECT * FROM user_futures_positions").all();
      if (positions.length === 0) return;

      console.log(`⏱️  Applying funding rate (${(fundingRate * 100).toFixed(4)}%) to ${positions.length} active positions...`);
      db.exec("BEGIN TRANSACTION");
      try {
        for (const pos of positions) {
          const price = tickerPrices.get(pos.symbol) || pos.entry_price;
          const value = pos.qty * price;
          const fundingFee = value * fundingRate;
          
          let balanceRow = db.prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'demo_balance'").get(pos.user_id);
          let balance = balanceRow ? parseFloat(balanceRow.value) : 10000;

          // LONG pays, SHORT receives
          const feeAmount = pos.side === "LONG" ? -fundingFee : fundingFee;
          const newBalance = Math.max(0, balance + feeAmount);

          db.prepare("INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, 'demo_balance', ?)").run(pos.user_id, String(newBalance));
          
          io.to("user_" + pos.user_id).emit("funding_applied", { 
            userId: pos.user_id, 
            symbol: pos.symbol, 
            feeAmount, 
            fundingRate,
            newBalance 
          });
        }
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        console.error(err);
      }
    } catch (e) {
      console.error("Funding interval error:", e);
    }
  }, 60000).unref();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, {
      setHeaders(res, filePath) {
        const normalizedPath = filePath.replace(/\\/g, "/");

        if (normalizedPath.endsWith("/index.html")) {
          res.setHeader("Cache-Control", "no-store");
          return;
        }

        if (normalizedPath.includes("/assets/")) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }

        res.setHeader("Cache-Control", "public, max-age=3600");
      },
    }));
    app.get("/assets/*", (req, res) => {
      res.status(404).type("text/plain").send("Asset not found. Refresh the page to load the latest build.");
    });
    // Serve index.html for all SPA routes in Express v4
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Initial fetch and start cron job for analysis cache
  updateMarketAnalysisCache();
  const cacheTimer = setInterval(updateMarketAnalysisCache, 60 * 60 * 1000); // 1 hour
  cacheTimer.unref?.();

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`FinPilot AI Server listening at http://localhost:${PORT}`);
    connectBinanceWS();
    queueMarketRefresh("startup", true);
    const refreshTimer = setInterval(() => {
      queueMarketRefresh("interval", false);
    }, MARKET_REFRESH_INTERVAL_MS);
    refreshTimer.unref?.();
  });
}

startServer();
