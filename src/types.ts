export type MarketAssetCategory = "US" | "Vietnam" | "Crypto" | "ETFs";

export interface MarketAssetConfig {
  symbol: string;
  name: string;
  category: MarketAssetCategory;
  currencySymbol?: string;
}

export interface Holding {
  id: string;
  asset: string; // Ticker (e.g. AAPL)
  name: string;
  qty: number;
  avgCost: number;
  currentPrice: number;
  category: "Technology" | "Crypto" | "Financials" | "Energy" | "Automotive" | "Others";
}

export interface MarketAsset {
  symbol: string;
  name: string;
  price: number;
  currencySymbol?: string; // e.g. "$" or "đ"
  changePercent: number;
  marketCap: string;
  peRatio: string;
  volume: string;
  category: MarketAssetCategory;
  provider?: string;
  logo?: string;
  dataQuality?: "live" | "cached" | "unfetched";
  updatedAt?: string;
}

export type MarketDataSource = "live" | "mixed" | "cached" | "empty";

export interface MarketDataResponse {
  assets: MarketAsset[];
  updatedAt: string;
  source: MarketDataSource;
  stale: boolean;
  errors: string[];
  providerStatus: {
    stocks: string;
    crypto: string;
    vietnam: string;
    database: string;
  };
}

export interface TrendingSector {
  name: string;
  change: number;
  inflow: string;
  isPositive: boolean;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  summary?: string;
  technicalView?: string;
  riskFactors?: string;
  isLoading?: boolean;
}

export interface ChatHistoryItem {
  id: string;
  title: string;
  timeLabel: string;
  messages: ChatMessage[];
}

export type PredictionHorizon = "1D" | "1W" | "1M" | "3M";

export type PredictionSignal = "Bullish" | "Neutral" | "Bearish";

export interface PredictionForecastPoint {
  date: string;
  price: number;
  bullPrice: number;
  bearPrice: number;
}

export interface PredictionScenario {
  label: string;
  probability: number;
  targetPrice: number;
  movePercent: number;
}

export interface PredictionDriver {
  label: string;
  value: string;
  stance: "positive" | "neutral" | "negative";
}

export interface AIPrediction {
  symbol: string;
  name: string;
  horizon: PredictionHorizon;
  signal: PredictionSignal;
  recommendation: string;
  confidence: number;
  score: number;
  currentPrice: number;
  expectedPrice: number;
  expectedMovePercent: number;
  volatility: number;
  rsi: number;
  support: number;
  resistance: number;
  stopLoss: number;
  forecast: PredictionForecastPoint[];
  scenarios: PredictionScenario[];
  drivers: PredictionDriver[];
  thesis: string;
  actionPlan: string;
  riskControls: string;
  dataQuality: string;
  updatedAt: string;
  isSimulatedHistory: boolean;
}

export interface MarketSummary {
  name: string;
  value: string;
  changePercent: number;
  trend: "up" | "down";
}

export interface NewsArticle {
  id: number;
  headline: string;
  summary: string;
  url: string;
  source: string;
  datetime: number;
  image: string;
  category: string;
}
