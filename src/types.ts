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
