import { MarketAssetConfig } from "./types";

export const TRACKED_ASSETS: MarketAssetConfig[] = [
  // Top 5 US Stocks
  { symbol: "AAPL", name: "Apple Inc.", category: "US", currencySymbol: "$" },
  { symbol: "MSFT", name: "Microsoft Corp.", category: "US", currencySymbol: "$" },
  { symbol: "NVDA", name: "NVIDIA Corp.", category: "US", currencySymbol: "$" },
  { symbol: "TSLA", name: "Tesla Inc.", category: "US", currencySymbol: "$" },
  { symbol: "META", name: "Meta Platforms Inc.", category: "US", currencySymbol: "$" },

  // Top 5 Crypto
  { symbol: "BTC", name: "Bitcoin", category: "Crypto", currencySymbol: "$" },
  { symbol: "ETH", name: "Ethereum", category: "Crypto", currencySymbol: "$" },
  { symbol: "SOL", name: "Solana", category: "Crypto", currencySymbol: "$" },
  { symbol: "BNB", name: "BNB", category: "Crypto", currencySymbol: "$" },
  { symbol: "DOGE", name: "Dogecoin", category: "Crypto", currencySymbol: "$" },

  // Top 5 ETFs
  { symbol: "SPY", name: "SPDR S&P 500", category: "ETFs", currencySymbol: "$" },
  { symbol: "QQQ", name: "Invesco QQQ", category: "ETFs", currencySymbol: "$" },
  { symbol: "VOO", name: "Vanguard S&P 500", category: "ETFs", currencySymbol: "$" },
  { symbol: "ARKK", name: "ARK Innovation ETF", category: "ETFs", currencySymbol: "$" },
  { symbol: "VNQ", name: "Vanguard Real Estate", category: "ETFs", currencySymbol: "$" },
];
