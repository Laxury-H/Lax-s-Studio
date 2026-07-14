import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  RefreshCw, 
  Copy, 
  Search, 
  Database, 
  Info,
  X,
  Play,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Download,
  Bot,
  Settings
} from "lucide-react";
import { useSettings } from "../SettingsContext";
import TradingViewChart from "./TradingViewChart";
import ProfessionalTradingTerminal from "./ProfessionalTradingTerminal";
import ApiSettingsModal from "./ApiSettingsModal";

interface OpenPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  qty: number;
  leverage: number;
  margin: number;
  addedAt: string;
  marginMode?: "CROSS" | "ISOLATED";
  stopLoss?: number | null;
  takeProfit?: number | null;
}

interface TradeHistoryItem {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: string;
  qty: number;
  price: number;
  leverage: number;
  realizedPnl: number;
  fee: number;
  timestamp: string;
}

interface ScannerItem {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  priceChange1h?: number;
  priceChange15m?: number;
  volumeRatio?: number;
  pumpScore?: number;
  lastPrice?: number;
  priceChangePercent?: number;
  volume?: number;
}

interface PumpAlert {
  symbol: string;
  change24h: number;
  pct15m: number;
  volRatio: number;
  timestamp: string;
  markPrice: number;
  suggestedShort: number;
  stopLoss: number;
  price?: number;
  percent?: number;
  type?: "PUMP" | "DUMP";
}

interface DeepAnalysisItem {
  symbol: string;
  change24h: number;
  pumpDays: number;
  dumpDays: number;
  overextension: number;
  volatility: number;
}

export default function FuturesHubView() {
  const settingsCtx = useSettings();
  const t = settingsCtx?.t || ((k: string) => k);
  const [activeSubTab, setActiveSubTab] = useState<"trading" | "scanner" | "history" | "deep_analysis">("trading");
  
  // Demo Account States
  const [balance, setBalance] = useState<number>(10000);
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [trades, setTrades] = useState<TradeHistoryItem[]>([]);
  const [loadingAccount, setLoadingAccount] = useState<boolean>(true);
  const [isRealAccount, setIsRealAccount] = useState<boolean>(false);
  const [connectionMode, setConnectionMode] = useState<"PAPER" | "TESTNET" | "MAINNET">("PAPER");
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  
  // Trading Form States
  const [selectedSymbol, setSelectedSymbol] = useState<string>("BTCUSDT");
  const [leverage, setLeverage] = useState<number>(20);
  const [orderSize, setOrderSize] = useState<string>("1000"); // in USDT value
  const [orderType, setOrderType] = useState<"USDT" | "COIN">("USDT");
  const [marginMode, setMarginMode] = useState<"CROSS" | "ISOLATED">("ISOLATED");
  const [stopLoss, setStopLoss] = useState<string>("");
  const [takeProfit, setTakeProfit] = useState<string>("");
  const [fundingRate, setFundingRate] = useState<number>(0.0001); // 0.01%
  const [fundingTimeLeft, setFundingTimeLeft] = useState<number>(60);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Autocomplete search states
  const [searchVal, setSearchVal] = useState<string>("BTCUSDT");
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Market Prices state (Mark prices of all pairs from Binance)
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});
  const [scannerData, setScannerData] = useState<ScannerItem[]>([]);
  const [scannerSearch, setScannerSearch] = useState<string>("");
  const [scannerTab, setScannerTab] = useState<"gainers" | "losers" | "all">("all");
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: "asc" | "desc" } | null>({ key: "change24h", direction: "desc" });
  const [loadingScanner, setLoadingScanner] = useState<boolean>(true);
  
  // Pump & Dump Alerts State
  const [alerts, setAlerts] = useState<PumpAlert[]>([]);
  const [copiedAlert, setCopiedAlert] = useState<string | null>(null);

  // Deep Analysis State
  const [analysisLoading, setAnalysisLoading] = useState<boolean>(false);
  const [analysisData, setAnalysisData] = useState<DeepAnalysisItem[]>([]);
  const [analysisCoin, setAnalysisCoin] = useState<string>("TOP20");
  const [analysisTimeframe, setAnalysisTimeframe] = useState<number>(30);
  
  // Auto-Trading Bot State
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(false);
  const autoTradeLock = useRef(false);
  const [analysisProgress, setAnalysisProgress] = useState<string>("");

  // Individual Long-Term Analysis State
  const [longTermAnalysisSymbol, setLongTermAnalysisSymbol] = useState<string | null>(null);
  const [longTermLoadingStep, setLongTermLoadingStep] = useState<string>("");
  const [longTermResult, setLongTermResult] = useState<any>(null);

  const rrRatio = useMemo(() => {
    if (!stopLoss || !takeProfit || !marketPrices[selectedSymbol]) return null;
    const currentPrice = marketPrices[selectedSymbol];
    const slVal = parseFloat(stopLoss);
    const tpVal = parseFloat(takeProfit);
    if (isNaN(slVal) || isNaN(tpVal) || slVal <= 0 || tpVal <= 0) return null;
    
    const longRisk = currentPrice - slVal;
    const longReward = tpVal - currentPrice;
    
    const shortRisk = slVal - currentPrice;
    const shortReward = currentPrice - tpVal;

    if (tpVal > currentPrice && slVal < currentPrice) {
      if (longRisk <= 0) return null;
      return (longReward / longRisk).toFixed(2);
    } else if (tpVal < currentPrice && slVal > currentPrice) {
      if (shortRisk <= 0) return null;
      return (shortReward / shortRisk).toFixed(2);
    }
    return null;
  }, [stopLoss, takeProfit, selectedSymbol, marketPrices]);

  const estimatedLiqPrice = useMemo(() => {
    if (!marketPrices[selectedSymbol]) return null;
    const currentPrice = marketPrices[selectedSymbol];
    const sizeVal = parseFloat(orderSize);
    if (isNaN(sizeVal) || sizeVal <= 0) return null;

    let qty = 0;
    if (orderType === "USDT") {
      qty = sizeVal / currentPrice;
    } else {
      qty = sizeVal;
    }

    if (marginMode === "ISOLATED") {
      const longLiq = currentPrice * (1 - 1 / leverage);
      const shortLiq = currentPrice * (1 + 1 / leverage);
      return { longLiq, shortLiq };
    } else {
      const margin = (qty * currentPrice) / leverage;
      const longLiq = Math.max(0, currentPrice - ((margin + balance) / qty));
      const shortLiq = currentPrice + ((margin + balance) / qty);
      return { longLiq, shortLiq };
    }
  }, [marginMode, selectedSymbol, orderSize, orderType, leverage, balance, marketPrices]);

  // Fetch account status from database
  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch("/api/futures/account");
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setBalance(data.balance);
          setPositions(data.positions);
          setTrades(data.trades);
          setIsRealAccount(!!data.isRealAccount);
          if (data.connectionMode) {
            setConnectionMode(data.connectionMode);
          }
        }
      }
    } catch (e) {
      console.error("Failed to load futures account:", e);
    } finally {
      setLoadingAccount(false);
    }
  }, []);

  // Initialize account and polling
  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  // Fetch mark prices for positions and scanner
  const fetchMarkPrices = useCallback(async () => {
    try {
      const res = await fetch("https://fapi.binance.com/fapi/v1/ticker/price");
      if (res.ok) {
        const data = await res.json();
        const priceMap: Record<string, number> = {};
        data.forEach((item: any) => {
          if (item.symbol.endsWith("USDT")) {
            priceMap[item.symbol] = parseFloat(item.price);
          }
        });
        setMarketPrices(priceMap);
      }
    } catch (e) {
      console.error("Failed to fetch mark prices:", e);
    }
  }, []);

  // Fetch Funding Rate
  useEffect(() => {
    let mounted = true;
    const fetchFundingRate = async () => {
      try {
        const res = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${selectedSymbol}`);
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && data.lastFundingRate) {
          setFundingRate(parseFloat(data.lastFundingRate));
          if (data.nextFundingTime) {
            const now = Date.now();
            const next = parseInt(data.nextFundingTime);
            if (next > now) {
              setFundingTimeLeft(Math.floor((next - now) / 1000));
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch funding rate:", err);
      }
    };
    
    fetchFundingRate();
    const interval = setInterval(fetchFundingRate, 60000); // refresh every minute
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [selectedSymbol]);

  // Connect to backend Socket.io for real-time prices and updates
  useEffect(() => {
    // Initial fetch
    fetchMarkPrices();
    
    // Setup socket connection
    import("socket.io-client").then(({ io }) => {
      const socket = io(window.location.origin);
      
      socket.on("market_tickers", (data: any[]) => {
        setMarketPrices(prev => {
          const next = { ...prev };
          data.forEach(item => {
            next[item.symbol] = item.price;
          });
          return next;
        });
        
        // Also update scannerData if it's there
        setScannerData(prevScanner => {
          if (!prevScanner || prevScanner.length === 0) return prevScanner;
          
          let changed = false;
          const updated = prevScanner.map(coin => {
            const update = data.find(item => item.symbol === coin.symbol);
            if (update && update.price !== coin.lastPrice) {
              changed = true;
              return { ...coin, lastPrice: update.price, priceChangePercent: update.change24h };
            }
            return coin;
          });
          
          return changed ? updated : prevScanner;
        });
      });

      socket.on("position_liquidated", (payload: any) => {
        alert(`⚡ LIQUIDATION TRIGGERED: ${payload.symbol} ${payload.side} position was liquidated at $${payload.price} USDT.`);
        fetchAccount();
      });

      socket.on("position_closed_auto", (payload: any) => {
        alert(`🎯 ${payload.type} TRIGGERED: ${payload.symbol} closed at $${payload.triggerPrice} USDT. PnL: ${payload.pnl.toFixed(2)} USDT.`);
        fetchAccount();
      });

      socket.on("funding_applied", (payload: any) => {
        // Just reload account state silently
        fetchAccount();
      });

      return () => {
        socket.disconnect();
      };
    });
  }, [fetchMarkPrices, fetchAccount]);

  // Funding rate countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setFundingTimeLeft(prev => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync search input with selectedSymbol
  useEffect(() => {
    setSearchVal(selectedSymbol);
  }, [selectedSymbol]);

  // Click outside dropdown handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const popularSymbols = useMemo(() => ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"], []);

  const filteredCoins = useMemo(() => {
    if (!searchVal.trim()) {
      return popularSymbols.map(sym => {
        const coin = scannerData.find(c => c.symbol === sym);
        return {
          symbol: sym,
          price: coin?.price || marketPrices[sym] || 0,
          change24h: coin?.change24h || 0
        };
      });
    }

    const query = searchVal.toUpperCase();
    return scannerData
      .filter(coin => coin.symbol.includes(query))
      .slice(0, 8)
      .map(coin => ({
        symbol: coin.symbol,
        price: coin.price || marketPrices[coin.symbol] || 0,
        change24h: coin.change24h
      }));
  }, [searchVal, scannerData, marketPrices, popularSymbols]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsDropdownOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex(prev => (prev < filteredCoins.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex(prev => (prev > 0 ? prev - 1 : filteredCoins.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < filteredCoins.length) {
        const selected = filteredCoins[focusedIndex];
        setSelectedSymbol(selected.symbol);
        setSearchVal(selected.symbol);
      } else if (searchVal.trim()) {
        setSelectedSymbol(searchVal);
      }
      setIsDropdownOpen(false);
    } else if (e.key === "Escape") {
      setIsDropdownOpen(false);
      e.currentTarget.blur();
    }
  };

  // Handle Order submit
  const handlePlaceOrder = async (side: "LONG" | "SHORT") => {
    setFormError(null);
    setFormSuccess(null);
    
    const currentPrice = marketPrices[selectedSymbol];
    if (!currentPrice) {
      setFormError("Unable to fetch current price for this contract. Please try again.");
      return;
    }

    let qty = 0;
    let value = 0;
    if (orderType === "USDT") {
      value = parseFloat(orderSize);
      qty = value / currentPrice;
    } else {
      qty = parseFloat(orderSize);
      value = qty * currentPrice;
    }

    if (isNaN(qty) || qty <= 0) {
      setFormError("Please enter a valid order size.");
      return;
    }

    const margin = value / leverage;
    const fee = value * 0.0005;
    const totalCost = margin + fee;

    if (balance < totalCost) {
      setFormError(`Insufficient margin balance. You need at least ${totalCost.toFixed(2)} USDT (includes ${(margin).toFixed(2)} USDT margin and ${(fee).toFixed(2)} USDT entry fee).`);
      return;
    }

    let slVal: number | null = stopLoss ? parseFloat(stopLoss) : null;
    let tpVal: number | null = takeProfit ? parseFloat(takeProfit) : null;

    if (stopLoss && (isNaN(slVal!) || slVal! <= 0)) {
      setFormError("Stop Loss must be a valid positive number.");
      return;
    }
    if (takeProfit && (isNaN(tpVal!) || tpVal! <= 0)) {
      setFormError("Take Profit must be a valid positive number.");
      return;
    }

    if (side === "LONG") {
      if (slVal && slVal >= currentPrice) {
        setFormError("For LONG, Stop Loss must be less than Entry Price.");
        return;
      }
      if (tpVal && tpVal <= currentPrice) {
        setFormError("For LONG, Take Profit must be greater than Entry Price.");
        return;
      }
    } else {
      if (slVal && slVal <= currentPrice) {
        setFormError("For SHORT, Stop Loss must be greater than Entry Price.");
        return;
      }
      if (tpVal && tpVal >= currentPrice) {
        setFormError("For SHORT, Take Profit must be less than Entry Price.");
        return;
      }
    }

    setActionLoading(true);
    try {
      const res = await fetch("/api/futures/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: selectedSymbol,
          side,
          qty,
          price: currentPrice,
          leverage,
          marginMode,
          stopLoss: slVal !== null ? slVal : undefined,
          takeProfit: tpVal !== null ? tpVal : undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to place order.");
      }

      setFormSuccess(`Opened ${side} position for ${selectedSymbol} successfully!`);
      setStopLoss("");
      setTakeProfit("");
      fetchAccount();
    } catch (e: any) {
      setFormError(e.message || "Network error while opening position.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateSlTp = async (symbol: string, sl: number | null, tp: number | null) => {
    try {
      const res = await fetch("/api/futures/update-sl-tp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, stopLoss: sl, takeProfit: tp })
      });
      if (res.ok) {
        fetchAccount();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to update SL/TP");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to update SL/TP");
    }
  };

  // Close position
  const handleClosePosition = async (symbol: string) => {
    const currentPrice = marketPrices[symbol];
    if (!currentPrice) {
      alert("No mark price available to close position.");
      return;
    }

    if (!confirm(`Are you sure you want to close your ${symbol} position at the market price of ${currentPrice}?`)) {
      return;
    }

    try {
      const res = await fetch("/api/futures/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, closePrice: currentPrice })
      });

      if (res.ok) {
        fetchAccount();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to close position.");
      }
    } catch (e) {
      console.error("Error closing position:", e);
    }
  };

  // Reset Demo Account
  const handleResetAccount = async () => {
    if (!confirm("Are you sure you want to reset your Demo Account balance to 10,000 USDT and close all active positions?")) {
      return;
    }

    try {
      const res = await fetch("/api/futures/reset", { method: "POST" });
      if (res.ok) {
        fetchAccount();
      }
    } catch (e) {
      console.error("Error resetting demo account:", e);
    }
  };

  // Run Deep Analysis
  const handleRunDeepAnalysis = async () => {
    if (scannerData.length === 0) {
      alert("Scanner data is not loaded yet. Please wait a moment.");
      return;
    }
    
    setAnalysisLoading(true);
    setAnalysisProgress(analysisCoin === "TOP20" ? "Finding Top Gainers and Losers..." : `Preparing ${analysisCoin}...`);
    setAnalysisData([]);
    
    try {
      let targetCoins: any[] = [];
      if (analysisCoin === "TOP20") {
        const sortedByChange = [...scannerData].sort((a, b) => b.change24h - a.change24h);
        const topGainers = sortedByChange.slice(0, 10);
        const topLosers = sortedByChange.slice(-10).reverse();
        targetCoins = [...topGainers, ...topLosers];
      } else {
        const coinData = scannerData.find(c => c.symbol === analysisCoin);
        if (coinData) {
          targetCoins = [coinData];
        } else {
          targetCoins = [{ symbol: analysisCoin, change24h: 0, price: 0, volume24h: 0 }];
        }
      }
      
      const results: DeepAnalysisItem[] = [];
      
      for (let i = 0; i < targetCoins.length; i++) {
        const coin = targetCoins[i];
        setAnalysisProgress(`Analyzing ${coin.symbol} (${i + 1}/${targetCoins.length})...`);
        
        try {
          const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${coin.symbol}&interval=1d&limit=${analysisTimeframe}`);
          if (!res.ok) continue;
          const klines = await res.json();
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
          
          const avgPrice = sumClose / (klines.length || 1);
          const currentPrice = klines.length > 0 ? parseFloat(klines[klines.length - 1][4]) : (coin.price || 0);
          const overextension = currentPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
          const volatility = sumRange / klines.length;
          
          results.push({
            symbol: coin.symbol,
            change24h: coin.change24h || 0,
            pumpDays,
            dumpDays,
            overextension: parseFloat(overextension.toFixed(2)),
            volatility
          });
          
          await new Promise(r => setTimeout(r, 100)); // rate limit delay
        } catch (e) {
          console.error(`Failed to analyze ${coin.symbol}`, e);
        }
      }
      
      setAnalysisData(results.sort((a, b) => b.pumpDays + b.dumpDays - (a.pumpDays + a.dumpDays)));
    } catch (e) {
      console.error("Deep analysis failed", e);
    } finally {
      setAnalysisLoading(false);
      setAnalysisProgress("");
    }
  };
  
  const handleExportCSV = () => {
    if (analysisData.length === 0) return;
    const header = "Symbol,24h Change (%),Days Pumped >10%,Days Dumped <-10%,Overextension vs 30d SMA (%),Avg Daily Volatility (%)\\n";
    const rows = analysisData.map(item => 
      `${item.symbol},${item.change24h.toFixed(2)},${item.pumpDays},${item.dumpDays},${item.overextension.toFixed(2)},${item.volatility.toFixed(2)}`
    ).join("\\n");
    
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `crypto_deep_analysis_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportText = () => {
    if (analysisData.length === 0) return;
    let text = "I need your help analyzing these cryptocurrency pairs. Below is a deep historical analysis of the top 10 current gainers and top 10 losers on Binance Futures over the last 30 days.\\n\\n";
    text += "Data Metrics Explained:\\n";
    text += "- Pump Days: Number of days in the last 30 days where the coin closed > +10%\\n";
    text += "- Dump Days: Number of days where it closed < -10%\\n";
    text += "- Overextension: How far the current price is extended from its 30-day Simple Moving Average (SMA). High positive means it might be overbought, high negative means oversold.\\n";
    text += "- Volatility: Average daily price range ((High - Low) / Open).\\n\\n";
    text += "List of Analyzed Assets:\\n";
    
    analysisData.forEach(item => {
      text += `- ${item.symbol}: 24h Chg: ${item.change24h.toFixed(2)}% | Pump Days (>10%): ${item.pumpDays} | Dump Days (<-10%): ${item.dumpDays} | Overextension: ${item.overextension.toFixed(2)}% | Volatility: ${item.volatility.toFixed(2)}%\\n`;
    });
    
    text += "\\nBased on this data, are there any strong candidates that are historically serial pump/dump coins and are currently overly extended and ripe for a short or long position? Which ones would you recommend and why?";
    
    navigator.clipboard.writeText(text);
    alert("Copied Prompt to Clipboard! You can now paste this into the Neural Chat or any AI assistant.");
  };

  const handleLongTermAnalysis = async (symbol: string) => {
    setLongTermAnalysisSymbol(symbol);
    setLongTermResult(null);
    
    try {
      setLongTermLoadingStep("Downloading historical weekly data from Binance...");
      const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1w&limit=1500`);
      if (!res.ok) throw new Error("Failed to fetch klines");
      const klines = await res.json();
      
      await new Promise(r => setTimeout(r, 800)); // Simulate processing delay
      setLongTermLoadingStep("Analyzing long-term price action and manipulation risks...");
      
      let ath = 0;
      let atl = Infinity;
      let pumpWeeks = 0;
      let dumpWeeks = 0;
      
      for (const k of klines) {
        const open = parseFloat(k[1]);
        const high = parseFloat(k[2]);
        const low = parseFloat(k[3]);
        const close = parseFloat(k[4]);
        
        if (high > ath) ath = high;
        if (low < atl) atl = low;
        
        const change = ((close - open) / open) * 100;
        if (change > 20) pumpWeeks++;
        if (change < -20) dumpWeeks++;
      }
      
      const currentPrice = parseFloat(klines[klines.length - 1][4]);
      const growthToAth = ath > currentPrice ? ((ath - currentPrice) / currentPrice) * 100 : 0;
      const ageWeeks = klines.length;
      
      await new Promise(r => setTimeout(r, 800)); // Simulate processing delay
      setLongTermLoadingStep("Searching the web & synthesizing AI fundamental insights...");
      
      const aiRes = await fetch(`/api/futures/analyze/${symbol}`);
      const aiData = await aiRes.json();
      
      setLongTermResult({
        symbol,
        currentPrice,
        ath,
        atl,
        growthToAth,
        ageWeeks,
        pumpWeeks,
        dumpWeeks,
        aiSummary: aiData.summary || "No AI summary available.",
        searchPerformed: aiData.searchPerformed
      });
      setLongTermLoadingStep("");
    } catch (e) {
      console.error("Long term analysis error:", e);
      setLongTermLoadingStep("Analysis failed. Please try again.");
    }
  };

  // Poll Scanner Data (from Binance 24h Ticker API)
  const fetchScannerData = useCallback(async () => {
    try {
      const res = await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr");
      if (res.ok) {
        const data = await res.json();
        const usdtPairs = data
          .filter((item: any) => item.symbol.endsWith("USDT"))
          .map((item: any) => ({
            symbol: item.symbol,
            price: parseFloat(item.lastPrice),
            change24h: parseFloat(item.priceChangePercent),
            volume24h: parseFloat(item.quoteVolume)
          }));
        
        // Sort by quote volume descending
        usdtPairs.sort((a: any, b: any) => b.volume24h - a.volume24h);
        setScannerData(usdtPairs);
        
        // Run Pump Detection on Top Gainers
        const potentialPumps = usdtPairs.filter((coin: any) => coin.change24h > 6 && coin.volume24h > 1000000);
        detectPumpSpikes(potentialPumps.slice(0, 15)); // Analyze top 15 candidates
      }
    } catch (e) {
      console.error("Failed to load scanner data:", e);
    } finally {
      setLoadingScanner(false);
    }
  }, []);

  useEffect(() => {
    fetchScannerData();
    // Socket.io handles the real-time updates now.
  }, [fetchScannerData]);

  // Pump & Dump Detection Algorithm
  const detectPumpSpikes = async (candidates: ScannerItem[]) => {
    const newAlerts: PumpAlert[] = [];
    const timestamp = new Date().toLocaleTimeString();

    for (const coin of candidates) {
      try {
        // Fetch recent 5m Klines (12 candles = 1 hour)
        const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${coin.symbol}&interval=5m&limit=24`);
        if (!res.ok) continue;
        const klines = await res.json();
        
        if (klines.length < 15) continue;
        
        // 1. Calculate price change in the last 15 minutes (last 3 candles)
        const currentClose = parseFloat(klines[klines.length - 1][4]);
        const open15mAgo = parseFloat(klines[klines.length - 3][1]);
        const pct15m = ((currentClose - open15mAgo) / open15mAgo) * 100;
        
        // 2. Calculate volume ratio (last 3 candles volume vs average of previous 12 candles volume)
        const recentVol = klines.slice(klines.length - 3).reduce((acc: number, c: any) => acc + parseFloat(c[7]), 0);
        const prevVolAvg = klines.slice(klines.length - 15, klines.length - 3).reduce((acc: number, c: any) => acc + parseFloat(c[7]), 0) / 12;
        const volRatio = prevVolAvg > 0 ? recentVol / (prevVolAvg * 3) : 1;
        
        // 3. If Price rises > 3.5% in 15m AND volume is 2x normal average, trigger Pump alert!
        if (pct15m > 3.5 && volRatio > 2.0) {
          const suggestedShort = currentClose;
          const stopLoss = currentClose * (1 + 0.05); // 5% stop loss
          
          newAlerts.push({
            symbol: coin.symbol,
            change24h: coin.change24h,
            pct15m,
            volRatio,
            timestamp,
            markPrice: currentClose,
            suggestedShort,
            stopLoss
          });
        }
      } catch (err) {
        console.error("Failed to analyze klines for " + coin.symbol, err);
      }
    }
    
    // Sort alerts by 15m pump intensity
    newAlerts.sort((a, b) => b.pct15m - a.pct15m);
    setAlerts(newAlerts);
  };

  // Auto liquidation monitor
  useEffect(() => {
    positions.forEach(async (pos) => {
      const currentPrice = marketPrices[pos.symbol];
      if (!currentPrice) return;

      let liqPrice = 0;
      if (pos.side === "LONG") {
        liqPrice = pos.entryPrice * (1 - 1 / pos.leverage * 0.95);
      } else {
        liqPrice = pos.entryPrice * (1 + 1 / pos.leverage * 0.95);
      }

      const isLiquidated = 
        (pos.side === "LONG" && currentPrice <= liqPrice) ||
        (pos.side === "SHORT" && currentPrice >= liqPrice);

      if (isLiquidated) {
        console.log(`[Simulator] Auto liquidating position for ${pos.symbol} at ${currentPrice}`);
        try {
          await fetch("/api/futures/liquidate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol: pos.symbol, liqPrice })
          });
          fetchAccount();
        } catch (err) {
          console.error("Liquidation request failed:", err);
        }
      }
    });
  }, [positions, marketPrices, fetchAccount]);

  // Auto Trading Bot Logic
  useEffect(() => {
    if (!autoTradeEnabled || alerts.length === 0 || autoTradeLock.current) return;
    
    const latestAlert = alerts[0];
    
    // Ensure we don't open multiple positions for the same symbol
    const hasPos = positions.some(p => p.symbol === latestAlert.symbol);
    if (!hasPos) {
      console.log(`[Auto-Trading Bot] Signal detected for ${latestAlert.symbol}, placing order...`);
      autoTradeLock.current = true;
      
      const currentPrice = marketPrices[latestAlert.symbol] || latestAlert.price || 0;
      if (currentPrice === 0) {
        autoTradeLock.current = false;
        return;
      }
      
      // Calculate 10% of balance as margin
      const marginToUse = balance * 0.1;
      // Fixed leverage 10x for bot
      const leverageToUse = 10;
      const orderValue = marginToUse * leverageToUse;
      const qtyToBuy = orderValue / currentPrice;
      
      fetch("/api/futures/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: latestAlert.symbol,
          side: "SHORT", // Pump alerts typically suggest a short on reversal
          qty: qtyToBuy,
          price: currentPrice,
          leverage: leverageToUse,
          marginMode: "ISOLATED",
          stopLoss: latestAlert.stopLoss
        })
      })
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          console.log(`[Auto-Trading Bot] Successfully placed SHORT on ${latestAlert.symbol}`);
          fetchAccount(); // refresh positions
        }
      })
      .catch(err => console.error("[Auto-Trading Bot] Failed to place order:", err))
      .finally(() => {
        setTimeout(() => { autoTradeLock.current = false; }, 5000); // Wait 5s before next trade
      });
    }
  }, [alerts, autoTradeEnabled, positions, balance, marketPrices, fetchAccount]);

  const copyToClipboard = (alert: PumpAlert) => {
    const text = `${alert.symbol} is pumping intensely: +${alert.change24h.toFixed(2)}% in 24h, and +${alert.pct15m.toFixed(2)}% in the last 15m with a volume spike of ${alert.volRatio.toFixed(1)}x. There is no clear fundamental news supporting this move. Analyze this chart, explain if we should Short this asset, and recommend a specific entry range around $${alert.suggestedShort.toFixed(4)}, leverage, stop loss around $${alert.stopLoss.toFixed(4)}, and take profit targets.`;
    
    navigator.clipboard.writeText(text);
    setCopiedAlert(alert.symbol);
    setTimeout(() => setCopiedAlert(null), 3000);
  };

  // Sort Handler
  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "desc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "desc") {
      direction = "asc";
    }
    setSortConfig({ key, direction });
  };

  // Filtered scanner data
  const filteredScanner = React.useMemo(() => {
    let data = scannerData.filter(item => 
      item.symbol.toLowerCase().includes(scannerSearch.toLowerCase())
    );

    if (scannerTab === "gainers") {
      data = data.filter(item => item.change24h > 0);
    } else if (scannerTab === "losers") {
      data = data.filter(item => item.change24h < 0);
    }

    if (sortConfig) {
      data.sort((a, b) => {
        const aVal = (a as any)[sortConfig.key];
        const bVal = (b as any)[sortConfig.key];
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return data;
  }, [scannerData, scannerSearch, scannerTab, sortConfig]);
  // Position Calculations
  const totalMargin = positions.reduce((acc, pos) => acc + pos.margin, 0);
  
  const totalUnrealizedPnl = positions.reduce((acc, pos) => {
    const currentPrice = marketPrices[pos.symbol] || pos.entryPrice;
    let pnl = 0;
    if (pos.side === "LONG") {
      pnl = pos.qty * (currentPrice - pos.entryPrice);
    } else {
      pnl = pos.qty * (pos.entryPrice - currentPrice);
    }
    return acc + pnl;
  }, 0);

  const accountEquity = balance + totalMargin + totalUnrealizedPnl;

  if (activeSubTab === "trading") {
    return (
      <>
      <ProfessionalTradingTerminal
        balance={balance}
        totalMargin={totalMargin}
        totalUnrealizedPnl={totalUnrealizedPnl}
        accountEquity={accountEquity}
        selectedSymbol={selectedSymbol}
        setSelectedSymbol={setSelectedSymbol}
        marketPrices={marketPrices}
        scannerData={scannerData}
        fundingRate={fundingRate}
        fundingTimeLeft={fundingTimeLeft}
        marginMode={marginMode}
        setMarginMode={setMarginMode}
        leverage={leverage}
        setLeverage={setLeverage}
        orderType={orderType}
        setOrderType={setOrderType}
        orderSize={orderSize}
        setOrderSize={setOrderSize}
        stopLoss={stopLoss}
        setStopLoss={setStopLoss}
        takeProfit={takeProfit}
        setTakeProfit={setTakeProfit}
        handlePlaceOrder={handlePlaceOrder}
        actionLoading={actionLoading}
        formError={formError}
        formSuccess={formSuccess}
        estimatedLiqPrice={estimatedLiqPrice}
        rrRatio={rrRatio}
        positions={positions}
        handleClosePosition={handleClosePosition}
        handleUpdateSlTp={handleUpdateSlTp}
        onExit={() => setActiveSubTab("scanner")}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        isRealAccount={isRealAccount}
      />
      <ApiSettingsModal 
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSaved={() => {
          setIsSettingsModalOpen(false);
          fetchAccount();
        }}
      />
      </>
    );
  }

  return (
    <div className="space-y-6" id="futures-hub">
      {/* Header Info */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          {connectionMode === "MAINNET" && <div className="text-[10px] font-bold bg-danger/20 text-danger px-2 py-1 rounded w-fit mb-2 border border-danger/50 animate-pulse">BINANCE MAINNET - LIVE TRADING</div>}
          {connectionMode === "TESTNET" && <div className="text-[10px] font-bold bg-warning/20 text-warning px-2 py-1 rounded w-fit mb-2 border border-warning/50">BINANCE TESTNET</div>}
          {connectionMode === "PAPER" && <div className="text-[10px] font-bold bg-muted-fg/20 text-muted-fg px-2 py-1 rounded w-fit mb-2 border border-muted-fg/50">PAPER TRADING</div>}
          <h2 className="font-sans font-black text-2xl uppercase tracking-normal text-foreground flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFD600] text-black">
              <TrendingDown className="h-5 w-5" />
            </span>
            FUTURES TRADING SIMULATOR &amp; SCANNER
          </h2>
          <p className="text-muted-fg text-sm mt-0.5 font-medium">Track live Binance Futures data, detect abnormal market movements, and practice paper trading.</p>
        </div>
        
        {/* Account balance status bar */}
        <div className="flex flex-wrap items-center gap-3 bg-card/90 backdrop-blur-md border border-border p-3 rounded-2xl relative">
          <div className="absolute right-3 top-3 z-50">
            <button 
              type="button"
              onClick={() => setIsSettingsModalOpen(true)}
              className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-muted-fg hover:text-foreground font-semibold cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              API Settings
            </button>
          </div>
          <div className="px-3 border-r border-border pr-20 sm:pr-3">
            <span className="text-[10px] font-black uppercase text-muted-fg block">
              {isRealAccount ? "Binance Futures Balance" : "Demo Balance"}
            </span>
            <span className="text-base font-black text-[#FFD600]">${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</span>
          </div>
          <div className="px-3 border-r border-border">
            <span className="text-[10px] font-black uppercase text-muted-fg block">Account Equity</span>
            <span className="text-base font-black text-foreground">${accountEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</span>
          </div>
          <div className="px-3 border-r border-border">
            <span className="text-[10px] font-black uppercase text-muted-fg block">Position Margin</span>
            <span className="text-base font-black text-foreground">${totalMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</span>
          </div>
          <div className="px-3 border-r border-border">
            <span className="text-[10px] font-black uppercase text-muted-fg block">Unrealized PnL</span>
            <span className={`text-base font-black ${totalUnrealizedPnl >= 0 ? "text-success" : "text-danger"}`}>
              {totalUnrealizedPnl >= 0 ? "+" : ""}${totalUnrealizedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="px-3">
            <span className="text-[10px] font-black uppercase text-muted-fg block">Funding / Countdown</span>
            <span className="text-xs font-black text-foreground block">
              <span className="text-success">{(fundingRate * 100).toFixed(4)}%</span>
              <span className="text-muted-fg mx-1">/</span>
              <span className="font-mono text-[#FFD600]">00:{fundingTimeLeft < 10 ? '0' : ''}{fundingTimeLeft}</span>
            </span>
          </div>
          <button 
            onClick={handleResetAccount} 
            className="p-2 border border-border rounded-xl text-muted-fg hover:text-danger hover:bg-muted/50 transition-colors"
            title="Reset Demo Account"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          
          <button
            onClick={() => setAutoTradeEnabled(!autoTradeEnabled)}
            className={`flex items-center gap-2 p-2 border rounded-xl font-bold text-[11px] uppercase transition-colors ${autoTradeEnabled ? 'bg-[#FFD600] text-black border-[#FFD600] animate-pulse' : 'bg-transparent text-muted-fg border-border hover:bg-muted/50'}`}
            title="AI Auto-Trading Bot"
          >
            <Bot className="h-4 w-4" />
            {autoTradeEnabled ? "Bot Active" : "Auto Trade"}
          </button>
        </div>
      </div>

      {/* Sub Navigation */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveSubTab("trading")}
          className={`px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 -mb-[2px] transition-colors ${
            (activeSubTab as string) === "trading"
              ? "border--[#FFD600] border-b-2 text-foreground"
              : "border-transparent text-muted-fg hover:text-foreground"
          }`}
          style={{ borderBottomColor: (activeSubTab as string) === "trading" ? "#FFD600" : "transparent" }}
        >
          Trade Simulator
        </button>
        <button
          onClick={() => setActiveSubTab("scanner")}
          className={`px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 -mb-[2px] transition-colors ${
            activeSubTab === "scanner"
              ? "border--[#FFD600] border-b-2 text-foreground"
              : "border-transparent text-muted-fg hover:text-foreground"
          }`}
          style={{ borderBottomColor: activeSubTab === "scanner" ? "#FFD600" : "transparent" }}
        >
          Price Scanner &amp; Pump Alerts
        </button>
        <button
          onClick={() => setActiveSubTab("history")}
          className={`px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 -mb-[2px] transition-colors ${
            activeSubTab === "history"
              ? "border--[#FFD600] border-b-2 text-foreground"
              : "border-transparent text-muted-fg hover:text-foreground"
          }`}
          style={{ borderBottomColor: activeSubTab === "history" ? "#FFD600" : "transparent" }}
        >
          Trade History
        </button>
        <button
          onClick={() => setActiveSubTab("deep_analysis")}
          className={`px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 -mb-[2px] transition-colors ${
            activeSubTab === "deep_analysis"
              ? "border--[#FFD600] border-b-2 text-foreground"
              : "border-transparent text-muted-fg hover:text-foreground"
          }`}
          style={{ borderBottomColor: activeSubTab === "deep_analysis" ? "#FFD600" : "transparent" }}
        >
          Deep Analysis &amp; Export
        </button>
      </div>

      {/* Content Area */}

      {activeSubTab === "scanner" && (
        <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
          {/* Main scanner view */}
          <div className="rounded-3xl border border-border bg-card/90 backdrop-blur-md/60 p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FFD600]">Binance USDT-M Futures Scanner</span>
              
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="flex bg-background border border-border rounded-xl p-1">
                  <button
                    onClick={() => {
                      setScannerTab("all");
                      setSortConfig({ key: "change24h", direction: "desc" });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors ${scannerTab === "all" ? "bg-muted text-foreground" : "text-muted-fg hover:text-foreground"}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => {
                      setScannerTab("gainers");
                      setSortConfig({ key: "change24h", direction: "desc" });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors ${scannerTab === "gainers" ? "bg-success/20 text-success" : "text-muted-fg hover:text-success"}`}
                  >
                    Gainers
                  </button>
                  <button
                    onClick={() => {
                      setScannerTab("losers");
                      setSortConfig({ key: "change24h", direction: "asc" });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors ${scannerTab === "losers" ? "bg-danger/20 text-danger" : "text-muted-fg hover:text-danger"}`}
                  >
                    Losers
                  </button>
                </div>
                <div className="relative flex-1 sm:w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-fg" />
                  <input
                    type="text"
                    value={scannerSearch}
                    onChange={(e) => setScannerSearch(e.target.value)}
                    placeholder="Search symbol..."
                    className="w-full bg-background border border-border rounded-xl py-2 pl-9 pr-4 text-xs font-bold text-foreground focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {loadingScanner ? (
              <div className="text-center py-12 text-sm font-semibold text-muted-fg animate-pulse">
                Loading ticker data from Binance...
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[500px]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-wider text-muted-fg border-b border-border pb-3">
                      <th className="pb-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort("symbol")}>
                        <div className="flex items-center gap-1">
                          Symbol
                          {sortConfig?.key === "symbol" ? (sortConfig.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                        </div>
                      </th>
                      <th className="pb-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort("price")}>
                        <div className="flex items-center gap-1">
                          Mark Price
                          {sortConfig?.key === "price" ? (sortConfig.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                        </div>
                      </th>
                      <th className="pb-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort("change24h")}>
                        <div className="flex items-center gap-1">
                          24h Change
                          {sortConfig?.key === "change24h" ? (sortConfig.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                        </div>
                      </th>
                      <th className="pb-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort("volume24h")}>
                        <div className="flex items-center gap-1">
                          24h Volume
                          {sortConfig?.key === "volume24h" ? (sortConfig.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                        </div>
                      </th>
                      <th className="pb-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-sans font-bold">
                    {filteredScanner.map((coin) => (
                      <tr key={coin.symbol} className="hover:bg-muted/10 transition-colors">
                        <td className="py-3 uppercase tracking-wider text-foreground flex items-center gap-2">
                          {coin.symbol}
                          {coin.change24h > 15 && (
                            <span className="px-1.5 py-0.5 rounded bg-warning/10 text-warning text-[9px] font-black tracking-wide border border-warning/20">
                              HOT PUMP
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-foreground font-mono">${coin.price.toLocaleString(undefined, { maximumFractionDigits: 5 })}</td>
                        <td className={`py-3 font-mono ${coin.change24h >= 0 ? "text-success" : "text-danger"}`}>
                          {coin.change24h >= 0 ? "+" : ""}{coin.change24h.toFixed(2)}%
                        </td>
                        <td className="py-3 text-muted-fg font-mono">${(coin.volume24h / 1000000).toFixed(1)}M USDT</td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleLongTermAnalysis(coin.symbol)}
                              className="h-8 px-3 rounded-lg bg-primary/10 text-primary text-[10px] font-black uppercase tracking-wider hover:bg-primary hover:text-primary-fg transition-all flex items-center gap-1 border border-primary/20"
                            >
                              <Search className="w-3 h-3" /> ANALYZE
                            </button>
                            <button
                              onClick={() => {
                                setSelectedSymbol(coin.symbol);
                                setActiveSubTab("trading");
                              }}
                              className="h-8 px-4 rounded-lg bg-[#FFD600] text-black text-[10px] font-black uppercase tracking-wider hover:shadow-lg hover:shadow-[#FFD600]/20 transition-all"
                            >
                              TRADE
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pump Detector Side alerts Panel */}
          <div className="space-y-6">
            <div className="rounded-3xl border border-border bg-card/90 backdrop-blur-md/60 p-5 space-y-4">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-warning flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" /> PUMP &amp; DUMP ALERTS
              </span>
              
              <p className="text-xs text-muted-fg leading-relaxed">
                Assets experiencing abnormal price increases and volume spikes over the last 15 minutes are detected below:
              </p>

              {alerts.length === 0 ? (
                <div className="p-4 border border-dashed border-border rounded-2xl text-center text-xs text-muted-fg py-8 font-semibold">
                  No abnormal pump behavior detected on Binance Futures.
                </div>
              ) : (
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                  {alerts.map((alert) => (
                    <div key={alert.symbol} className="p-4 bg-warning/5 border border-warning/20 rounded-2xl space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="font-sans font-black text-sm uppercase tracking-wider text-foreground">{alert.symbol}</span>
                        <span className="px-2 py-0.5 rounded bg-warning text-black text-[9px] font-black tracking-widest uppercase">
                          SPIKE ALARM
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-muted-fg">
                        <div>24h Chg: <span className="text-foreground font-black">+{alert.change24h.toFixed(1)}%</span></div>
                        <div>15m Spike: <span className="text-danger font-black">+{alert.pct15m.toFixed(1)}%</span></div>
                        <div className="col-span-2">Vol Spike: <span className="text-foreground font-black">{alert.volRatio.toFixed(1)}x</span></div>
                        <div className="col-span-2">Suggested Entry Short: <span className="text-[#FFD600] font-mono font-black">${alert.suggestedShort.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span></div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedSymbol(alert.symbol);
                            setActiveSubTab("trading");
                          }}
                          className="flex-1 h-8 bg-background border border-border text-[9px] font-black uppercase tracking-wider text-foreground rounded-lg hover:bg-muted transition-colors flex items-center justify-center"
                        >
                          TRADE
                        </button>
                        <button
                          onClick={() => copyToClipboard(alert)}
                          className="h-8 w-24 bg-[#FFD600] text-black text-[9px] font-black uppercase tracking-wider rounded-lg hover:shadow-lg hover:shadow-[#FFD600]/25 transition-all flex items-center justify-center gap-1"
                        >
                          <Copy className="h-3 w-3" />
                          {copiedAlert === alert.symbol ? "COPIED" : "ASK AI"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Guide to ask AI */}
            <div className="p-5 border border-border bg-card/90 backdrop-blur-md/30 rounded-3xl space-y-2">
              <span className="text-[10px] font-black uppercase text-muted-fg block">How to use "Ask AI"</span>
              <p className="text-xs text-muted-fg leading-relaxed">
                Clicking <b>ASK AI</b> copies a structured technical analysis prompt to your clipboard. Open the AI Copilot chat bubble at the bottom right, or go to the <b>NEURAL CHAT</b> tab and paste (Ctrl + V) it to get real-time trading strategy suggestions.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === "history" && (
        <div className="rounded-3xl border border-border bg-card/90 backdrop-blur-md/60 p-5 space-y-4">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FFD600] block">Demo Trade History</span>
          
          {trades.length === 0 ? (
            <div className="text-center py-12 text-sm font-semibold text-muted-fg">
              No trade history recorded for this demo account.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-wider text-muted-fg border-b border-border pb-3">
                    <th className="pb-3">Symbol</th>
                    <th className="pb-3">Side</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Qty</th>
                    <th className="pb-3">Price</th>
                    <th className="pb-3">Leverage</th>
                    <th className="pb-3 text-right">Realized PnL</th>
                    <th className="pb-3 text-right">Fee</th>
                    <th className="pb-3 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-sans font-bold">
                  {trades.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/10 transition-colors">
                      <td className="py-3 uppercase tracking-wider text-foreground">{t.symbol}</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${t.side === "BUY" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
                          {t.side === "BUY" ? "BUY" : "SELL"}
                        </span>
                      </td>
                      <td className="py-3 text-foreground uppercase tracking-wider text-[10px]">{t.type}</td>
                      <td className="py-3 text-foreground">{t.qty.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                      <td className="py-3 text-foreground">${t.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                      <td className="py-3 text-foreground">{t.leverage}x</td>
                      <td className={`py-3 text-right font-mono ${t.realizedPnl > 0 ? "text-success" : t.realizedPnl < 0 ? "text-danger" : "text-muted-fg"}`}>
                        {t.realizedPnl > 0 ? "+" : ""}{t.realizedPnl === 0 ? "0.00" : `${t.realizedPnl.toFixed(2)} USDT`}
                      </td>
                      <td className="py-3 text-right text-muted-fg font-mono">${t.fee.toFixed(4)} USDT</td>
                      <td className="py-3 text-right text-muted-fg">{new Date(t.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {activeSubTab === "deep_analysis" && (
        <div className="rounded-3xl border border-border bg-card/90 backdrop-blur-md/60 p-5 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FFD600] flex items-center gap-2">
                <Database className="h-4 w-4" /> AI DEEP ANALYSIS
              </span>
              <p className="text-xs text-muted-fg mt-1">
                Scans historical market data to find serial pump/dump patterns, volatility, and price overextension.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-xl border border-border">
                <span className="text-[10px] uppercase text-muted-fg font-black">Asset:</span>
                <select 
                  value={analysisCoin} 
                  onChange={(e) => setAnalysisCoin(e.target.value)}
                  className="bg-transparent text-foreground text-xs font-bold outline-none cursor-pointer"
                >
                  <option value="TOP20">Top 10 Gainers & Losers</option>
                  {scannerData.map(c => (
                    <option key={c.symbol} value={c.symbol}>{c.symbol}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-xl border border-border">
                <span className="text-[10px] uppercase text-muted-fg font-black">Period:</span>
                <select 
                  value={analysisTimeframe} 
                  onChange={(e) => setAnalysisTimeframe(Number(e.target.value))}
                  className="bg-transparent text-foreground text-xs font-bold outline-none cursor-pointer"
                >
                  <option value={7}>7 Days</option>
                  <option value={14}>14 Days</option>
                  <option value={30}>30 Days</option>
                  <option value={90}>90 Days</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleRunDeepAnalysis}
                disabled={analysisLoading}
                className="h-10 px-5 rounded-xl bg-[#FFD600] text-black text-xs font-black uppercase tracking-wider hover:shadow-lg hover:shadow-[#FFD600]/20 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {analysisLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {analysisLoading ? "Analyzing..." : "Run Analysis"}
              </button>
              
              <button
                onClick={handleExportCSV}
                disabled={analysisData.length === 0}
                className="h-10 px-4 rounded-xl border border-border bg-background text-foreground text-xs font-black uppercase tracking-wider hover:bg-muted transition-colors disabled:opacity-50 flex items-center gap-2"
                title="Export to CSV"
              >
                <Download className="h-4 w-4" /> CSV
              </button>

              <button
                onClick={handleExportText}
                disabled={analysisData.length === 0}
                className="h-10 px-4 rounded-xl border border-[#FFD600]/30 text-[#FFD600] text-xs font-black uppercase tracking-wider hover:bg-[#FFD600]/10 transition-colors disabled:opacity-50 flex items-center gap-2"
                title="Export as AI Prompt"
              >
                <Copy className="h-4 w-4" /> AI Prompt
              </button>
            </div>
          </div>

          {analysisLoading && (
            <div className="text-center py-12 space-y-3">
              <div className="inline-block p-4 rounded-full bg-muted/50 border border-border animate-pulse">
                <Database className="h-6 w-6 text-[#FFD600]" />
              </div>
              <p className="text-sm font-black text-foreground uppercase tracking-wider animate-pulse">
                {analysisProgress}
              </p>
            </div>
          )}

          {!analysisLoading && analysisData.length === 0 && (
            <div className="text-center py-16 text-sm font-semibold text-muted-fg border border-dashed border-border rounded-2xl bg-muted/10">
              No analysis data yet. Select parameters and click "Run Analysis" to start scraping historical data.
            </div>
          )}

          {!analysisLoading && analysisData.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-wider text-muted-fg border-b border-border pb-3">
                    <th className="pb-3">Symbol</th>
                    <th className="pb-3">24h Change</th>
                    <th className="pb-3">Days Pumped (&gt;10%)</th>
                    <th className="pb-3">Days Dumped (&lt;-10%)</th>
                    <th className="pb-3 text-right">Overextension (vs SMA)</th>
                    <th className="pb-3 text-right">Avg Volatility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-sans font-bold">
                  {analysisData.map((item) => (
                    <tr key={item.symbol} className="hover:bg-muted/10 transition-colors">
                      <td className="py-4 uppercase tracking-wider text-foreground flex items-center gap-2">
                        {item.symbol}
                        {(item.pumpDays >= 3 || item.dumpDays >= 3) && (
                          <span className="px-1.5 py-0.5 rounded bg-warning/10 text-warning text-[9px] font-black tracking-wide border border-warning/20">
                            HIGH RISK
                          </span>
                        )}
                      </td>
                      <td className={`py-4 font-mono ${item.change24h >= 0 ? "text-success" : "text-danger"}`}>
                        {item.change24h >= 0 ? "+" : ""}{item.change24h.toFixed(2)}%
                      </td>
                      <td className="py-4">
                        <span className={`px-3 py-1 rounded-lg font-mono ${item.pumpDays > 0 ? "bg-success/15 text-success" : "text-muted-fg"}`}>
                          {item.pumpDays}
                        </span>
                      </td>
                      <td className="py-4">
                        <span className={`px-3 py-1 rounded-lg font-mono ${item.dumpDays > 0 ? "bg-danger/15 text-danger" : "text-muted-fg"}`}>
                          {item.dumpDays}
                        </span>
                      </td>
                      <td className={`py-4 text-right font-mono ${item.overextension > 20 ? "text-danger" : item.overextension < -20 ? "text-success" : "text-foreground"}`}>
                        {item.overextension > 0 ? "+" : ""}{item.overextension.toFixed(2)}%
                      </td>
                      <td className="py-4 text-right text-muted-fg font-mono">
                        {item.volatility.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Long-Term Deep Analysis Modal */}
      {longTermAnalysisSymbol && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-card/90 backdrop-blur-md border border-border w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-primary/20 text-primary flex items-center justify-center rounded-xl border border-primary/30">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-wider text-foreground">Deep Fundamental Analysis</h3>
                  <p className="text-xs font-semibold text-muted-fg tracking-widest uppercase">{longTermAnalysisSymbol}</p>
                </div>
              </div>
              <button onClick={() => setLongTermAnalysisSymbol(null)} className="p-2 hover:bg-muted rounded-xl transition-colors">
                <X className="w-5 h-5 text-muted-fg" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {!longTermResult ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-6">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-muted border-t-primary animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Search className="w-6 h-6 text-primary animate-pulse" />
                    </div>
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-sm font-black uppercase tracking-widest text-foreground animate-pulse">Running Deep Scan</p>
                    <p className="text-xs font-mono text-muted-fg">{longTermLoadingStep}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-8 animate-in slide-in-from-bottom-4">
                  
                  {/* Summary Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-4 rounded-2xl bg-muted/20 border border-border">
                      <span className="text-[10px] font-black text-muted-fg uppercase tracking-widest block mb-2">Current Price</span>
                      <span className="text-lg font-mono font-bold text-foreground">${longTermResult.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 5 })}</span>
                    </div>
                    <div className="p-4 rounded-2xl bg-muted/20 border border-border">
                      <span className="text-[10px] font-black text-muted-fg uppercase tracking-widest block mb-2">Age on Binance</span>
                      <span className="text-lg font-black text-foreground">{longTermResult.ageWeeks} <span className="text-xs">Weeks</span></span>
                    </div>
                    <div className="p-4 rounded-2xl bg-muted/20 border border-border">
                      <span className="text-[10px] font-black text-muted-fg uppercase tracking-widest block mb-2">Distance to ATH</span>
                      <span className={`text-lg font-mono font-bold ${longTermResult.growthToAth > 0 ? "text-success" : "text-muted-fg"}`}>
                        +{longTermResult.growthToAth.toLocaleString(undefined, { maximumFractionDigits: 1 })}%
                      </span>
                    </div>
                    <div className="p-4 rounded-2xl bg-muted/20 border border-border">
                      <span className="text-[10px] font-black text-muted-fg uppercase tracking-widest block mb-2">Volatility Risk</span>
                      <div className="flex gap-2">
                        <span className="text-sm font-black text-danger bg-danger/10 px-2 py-0.5 rounded border border-danger/20" title="Weeks dumped > 20%">
                          {longTermResult.dumpWeeks} Dumps
                        </span>
                        <span className="text-sm font-black text-success bg-success/10 px-2 py-0.5 rounded border border-success/20" title="Weeks pumped > 20%">
                          {longTermResult.pumpWeeks} Pumps
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* AI Fundamental Analysis */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                      <Database className="w-4 h-4" /> AI Fundamental Report
                    </h4>
                    <div className="p-5 rounded-2xl bg-primary/5 border border-primary/20 text-sm leading-relaxed font-medium text-foreground/90 space-y-4">
                      {longTermResult.searchPerformed ? (
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-success/10 border border-success/20 text-[10px] font-black uppercase tracking-wider text-success mb-2">
                          <Search className="w-3 h-3" /> Live Web Data Synced
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-warning/10 border border-warning/20 text-[10px] font-black uppercase tracking-wider text-warning mb-2">
                          <AlertTriangle className="w-3 h-3" /> Offline Memory Used
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{longTermResult.aiSummary}</p>
                    </div>
                  </div>

                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-border bg-muted/10 flex justify-end">
               <button 
                onClick={() => setLongTermAnalysisSymbol(null)}
                className="h-10 px-6 rounded-xl bg-primary text-primary-fg text-xs font-black uppercase tracking-wider hover:brightness-110 transition-all"
               >
                 Close Report
               </button>
            </div>
          </div>
        </div>
      )}

      <ApiSettingsModal 
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSaved={() => {
          setIsSettingsModalOpen(false);
          fetchAccount(); // Reload account data after saving keys
        }}
      />
    </div>
  );
}
