import { Holding, MarketAsset, TrendingSector, ChatHistoryItem, MarketSummary } from "./types";

export const INITIAL_HOLDINGS: Holding[] = [
  {
    id: "h1",
    asset: "AAPL",
    name: "Apple Inc.",
    qty: 1240.0,
    avgCost: 142.1,
    currentPrice: 189.43,
    category: "Technology"
  },
  {
    id: "h2",
    asset: "BTC",
    name: "Bitcoin",
    qty: 4.21,
    avgCost: 24200.0,
    currentPrice: 64120.0,
    category: "Crypto"
  },
  {
    id: "h3",
    asset: "NVDA",
    name: "Nvidia Corp",
    qty: 450.0,
    avgCost: 310.2,
    currentPrice: 924.12,
    category: "Technology"
  },
  {
    id: "h4",
    asset: "TSLA",
    name: "Tesla Inc.",
    qty: 600.0,
    avgCost: 242.0,
    currentPrice: 174.12,
    category: "Automotive"
  }
];

export const MARKET_ASSETS: MarketAsset[] = [
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    price: 185.92,
    currencySymbol: "$",
    changePercent: 1.42,
    marketCap: "2.85T",
    peRatio: "28.4",
    volume: "42.8M",
    category: "US"
  },
  {
    symbol: "NVDA",
    name: "NVIDIA Corp.",
    price: 924.35,
    currencySymbol: "$",
    changePercent: 3.58,
    marketCap: "2.31T",
    peRatio: "74.2",
    volume: "38.1M",
    category: "US"
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corp.",
    price: 428.74,
    currencySymbol: "$",
    changePercent: -0.12,
    marketCap: "3.18T",
    peRatio: "37.1",
    volume: "19.5M",
    category: "US"
  },
  {
    symbol: "VIC",
    name: "Vingroup JSC",
    price: 48200,
    currencySymbol: "đ",
    changePercent: 0.85,
    marketCap: "184.2T",
    peRatio: "12.5",
    volume: "2.1M",
    category: "Vietnam"
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    price: 68412,
    currencySymbol: "$",
    changePercent: -0.45,
    marketCap: "1.34T",
    peRatio: "N/A",
    volume: "32.4B",
    category: "Crypto"
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    price: 3890.22,
    currencySymbol: "$",
    changePercent: 2.11,
    marketCap: "467.2B",
    peRatio: "N/A",
    volume: "18.6B",
    category: "Crypto"
  },
  {
    symbol: "TSLA",
    name: "Tesla, Inc.",
    price: 172.63,
    currencySymbol: "$",
    changePercent: -1.65,
    marketCap: "549.6B",
    peRatio: "41.8",
    volume: "88.2M",
    category: "US"
  },
  {
    symbol: "FPT",
    name: "FPT Corp",
    price: 135000,
    currencySymbol: "đ",
    changePercent: 4.20,
    marketCap: "171.4T",
    peRatio: "22.1",
    volume: "3.8M",
    category: "Vietnam"
  },
  {
    symbol: "VHM",
    name: "Vinhomes",
    price: 41200,
    currencySymbol: "đ",
    changePercent: 6.90,
    marketCap: "179.5T",
    peRatio: "8.4",
    volume: "5.1M",
    category: "Vietnam"
  },
  {
    symbol: "MSN",
    name: "Masan Group",
    price: 74500,
    currencySymbol: "đ",
    changePercent: -2.80,
    marketCap: "106.8T",
    peRatio: "34.2",
    volume: "1.9M",
    category: "Vietnam"
  }
];

export const MARKET_SUMMARIES: MarketSummary[] = [
  {
    name: "VN-Index",
    value: "1,254.30",
    changePercent: 1.2,
    trend: "up"
  },
  {
    name: "S&P 500",
    value: "5,130.20",
    changePercent: 0.4,
    trend: "up"
  },
  {
    name: "Nasdaq",
    value: "16,274.94",
    changePercent: -0.2,
    trend: "down"
  }
];

export const TRENDING_SECTORS: TrendingSector[] = [
  {
    name: "Technology",
    change: 2.8,
    inflow: "$4.2B",
    isPositive: true
  },
  {
    name: "Banking",
    change: 1.2,
    inflow: "$1.8B",
    isPositive: true
  },
  {
    name: "Energy",
    change: -0.4,
    inflow: "$0.9B",
    isPositive: false
  }
];

export const LATEST_NEWS = [
  {
    category: "Finance",
    title: "Global Markets React to Fed's Newest Policy Shift",
    time: "12 minutes ago",
    source: "Wall Street Journal",
    symbol: "AAPL"
  },
  {
    category: "Technology",
    title: "AI Chip Demand Reaches Record Highs in Q1 Report",
    time: "1 hour ago",
    source: "Bloomberg",
    symbol: "NVDA"
  },
  {
    category: "Real Estate",
    title: "VinFast Expansion Plans Boost Local Supply Chain",
    time: "3 hours ago",
    source: "Reuters",
    symbol: "VIC"
  }
];

export const INITIAL_CHAT_HISTORY: ChatHistoryItem[] = [
  {
    id: "c1",
    title: "NVIDIA Q3 Earning Impact",
    timeLabel: "JUST NOW",
    messages: [
      {
        id: "m1_1",
        sender: "user",
        text: "Can you analyze the recent price action for Apple (AAPL) and give me a summary of the technical indicators for the next week?",
        timestamp: "12:44 PM"
      },
      {
        id: "m1_2",
        sender: "ai",
        text: "Current price action shows a consolidation phase following the Q3 earnings report. Stock is stabilizing after test of local EMA lines.",
        timestamp: "12:45 PM",
        summary: "Stock is trading above the 50-day EMA. Immediate resistance found at $195.80, with strong support at $188.50.",
        technicalView: "RSI sits at 58 (Neutral/Bullish). MACD histogram shows decreasing bearish momentum. Volume is consistent with 20-day average.",
        riskFactors: "Macroeconomic pressure from bond yields may weigh on tech multiples. Watch for break below $185 as a trend reversal signal."
      }
    ]
  },
  {
    id: "c2",
    title: "S&P 500 Bullish Patterns",
    timeLabel: "2 HOURS AGO",
    messages: [
      {
        id: "m2_1",
        sender: "user",
        text: "Are we seeing double-bottom bullish patterns on the S&P 500?",
        timestamp: "10:30 AM"
      },
      {
        id: "m2_2",
        sender: "ai",
        text: "The S&P 500 validated structural swing lows at 5,060, displaying double-bottom properties verified by expanding visual volume.",
        timestamp: "10:31 AM",
        summary: "Forming bullish candles off key support zone at 5,100.",
        technicalView: "RSI is currently rebounding from 38 oversold zone towards 52 neutral status.",
        riskFactors: "Heavy resistance expected in the 5,180-5,220 range."
      }
    ]
  },
  {
    id: "c3",
    title: "Crypto Market Volatility",
    timeLabel: "YESTERDAY",
    messages: [
      {
        id: "m3_1",
        sender: "user",
        text: "What triggered the sell-off in BTC yesterday?",
        timestamp: "04:15 PM"
      },
      {
        id: "m4_1",
        sender: "ai",
        text: "BTC underwent spot liquidation over leverage-flush, testing 63,400 successfully. Liquidations totaled over 120M.",
        timestamp: "04:16 PM",
        summary: "Spot leverages flushed. Active buyers stepped in around 64,000.",
        technicalView: "RSI hit local low of 29 before immediately bounding back.",
        riskFactors: "Watch for regulatory guidance or sudden stablecoin outflows."
      }
    ]
  },
  {
    id: "c4",
    title: "Renewable Energy Sector",
    timeLabel: "OCT 12",
    messages: [
      {
        id: "m4_1",
        sender: "user",
        text: "Tell me about the renewable energy sector shift.",
        timestamp: "02:00 PM"
      }
      // Can list simple messages
    ]
  }
];
