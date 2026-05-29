import { MarketAssetConfig } from "./types";

export const TRACKED_ASSETS: MarketAssetConfig[] = [
  { symbol: "AAPL", name: "Apple Inc.", category: "US", currencySymbol: "$" },
  { symbol: "MSFT", name: "Microsoft Corp.", category: "US", currencySymbol: "$" },
  { symbol: "NVDA", name: "NVIDIA Corp.", category: "US", currencySymbol: "$" },
  { symbol: "TSLA", name: "Tesla, Inc.", category: "US", currencySymbol: "$" },
  { symbol: "BTC", name: "Bitcoin", category: "Crypto", currencySymbol: "$" },
  { symbol: "ETH", name: "Ethereum", category: "Crypto", currencySymbol: "$" }
];
