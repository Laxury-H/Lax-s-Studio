import React, { useMemo, useEffect, useContext } from "react";
import { X, Sparkles, TrendingUp, TrendingDown, Activity, ChevronUp, ChevronDown, Bell, Pin } from "lucide-react";
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { motion } from "motion/react";
import { MarketAsset } from "../types";
import { SettingsContext } from "../SettingsContext";

interface AssetDetailModalProps {
  asset: MarketAsset;
  onClose: () => void;
  onAnalyze: (symbol: string) => void;
}

export default function AssetDetailModal({ asset, onClose, onAnalyze }: AssetDetailModalProps) {
  const settingsCtx = useContext(SettingsContext);
  const pinnedSymbols = settingsCtx?.pinnedSymbols || [];
  const setPinnedSymbols = settingsCtx?.setPinnedSymbols || (() => {});
  const language = settingsCtx?.language || "en";
  const formatMoney = settingsCtx?.formatMoney || ((value: number, source = "$") => `${source}${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  
  const isPinned = pinnedSymbols.includes(asset.symbol);
  const handleTogglePin = () => {
    if (isPinned) {
      setPinnedSymbols(pinnedSymbols.filter(s => s !== asset.symbol));
    } else {
      if (pinnedSymbols.length >= 4) {
        alert("You can pin a maximum of 4 assets to the dashboard.");
      } else {
        setPinnedSymbols([...pinnedSymbols, asset.symbol]);
      }
    }
  };

  const isPositive = asset.changePercent >= 0;
  
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const [chartData, setChartData] = React.useState<{date: string, price: number}[]>([]);
  const [isLoadingChart, setIsLoadingChart] = React.useState(true);
  const [isSimulated, setIsSimulated] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [isAlertOpen, setIsAlertOpen] = React.useState(false);
  const [alertTarget, setAlertTarget] = React.useState(asset.price);

  const [alertCondition, setAlertCondition] = React.useState<"ABOVE" | "BELOW">("ABOVE");

  const handleSetAlert = async () => {
    try {
      await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: asset.symbol, targetPrice: alertTarget, condition: alertCondition })
      });
      setIsAlertOpen(false);
      alert("Alert saved successfully! The system will check this in the background.");
    } catch (e) {
      console.error(e);
      alert("Failed to save alert");
    }
  };

  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [analysisResult, setAnalysisResult] = React.useState<string | null>(null);

  const handleInlineAnalyze = async () => {
    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
      const res = await fetch("/api/analyze-asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset, language })
      });
      const data = await res.json();
      if (data.analysis) {
        setAnalysisResult(data.analysis);
      } else {
        setAnalysisResult("Analysis failed. Please try again.");
      }
    } catch (e) {
      setAnalysisResult("An error occurred during analysis.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const [timeframe, setTimeframe] = React.useState<"1D" | "5D" | "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y" | "ALL">("1M");
  const [chartType, setChartType] = React.useState<"Area" | "Line" | "Bar">("Area");
  const [isAdvancedChart, setIsAdvancedChart] = React.useState(false);

  const periodStats = useMemo(() => {
    if (!chartData || chartData.length === 0) return null;
    const prices = chartData.map(d => d.price);
    return {
      open: prices[0],
      close: prices[prices.length - 1],
      high: Math.max(...prices),
      low: Math.min(...prices)
    };
  }, [chartData]);

  const smartAnalysis = useMemo(() => {
    if (!chartData || chartData.length < 2) return null;
    const prices = chartData.map(d => d.price);
    
    // RSI 14
    let rsi = 50;
    if (prices.length > 14) {
      let gains = 0, losses = 0;
      for (let i = prices.length - 14; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
      }
      const avgGain = gains / 14;
      const avgLoss = losses / 14;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
    }
    
    // SMA 20
    let sma20 = prices[prices.length - 1];
    if (prices.length >= 20) {
      const sum20 = prices.slice(-20).reduce((a, b) => a + b, 0);
      sma20 = sum20 / 20;
    }
    
    const currentPrice = prices[prices.length - 1];
    
    let rating = "HOLD";
    let color = "text-muted-fg bg-muted/20 border-border";
    
    if (rsi < 30 && currentPrice > sma20) {
      rating = "STRONG BUY";
      color = "text-[#0ecb81] bg-[#0ecb81]/10 border-[#0ecb81]/30 shadow-[0_0_15px_rgba(14,203,129,0.2)]";
    } else if (rsi < 40 || currentPrice > sma20 * 1.02) {
      rating = "BUY";
      color = "text-[#0ecb81] bg-[#0ecb81]/10 border-[#0ecb81]/30";
    } else if (rsi > 70 && currentPrice < sma20) {
      rating = "STRONG SELL";
      color = "text-[#f6465d] bg-[#f6465d]/10 border-[#f6465d]/30 shadow-[0_0_15px_rgba(246,70,93,0.2)]";
    } else if (rsi > 60 || currentPrice < sma20 * 0.98) {
      rating = "SELL";
      color = "text-[#f6465d] bg-[#f6465d]/10 border-[#f6465d]/30";
    }
    
    return { rsi: rsi.toFixed(1), sma20: sma20.toFixed(2), rating, color };
  }, [chartData]);

  useEffect(() => {
    let mounted = true;
    setIsLoadingChart(true);
    
    fetch(`/api/historical-data/${asset.symbol}?range=${timeframe}`)
      .then(res => res.json())
      .then(json => {
        if (!mounted) return;
        if (json.error) {
          setError(json.error);
        } else {
          setChartData(json.data || []);
          setIsSimulated(json.isSimulated || false);
        }
      })
      .catch(e => {
        if (mounted) setError(e.message || "Failed to fetch data");
      })
      .finally(() => {
        if (mounted) setIsLoadingChart(false);
      });
      
    return () => { mounted = false; };
  }, [asset.symbol, timeframe]);

  // Custom Tooltip for Recharts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const displayDate = payload[0].payload.fullDate || label;
      return (
        <div className="bg-card border border-border p-3 shadow-xl rounded-xl">
          <p className="text-[10px] font-black uppercase text-muted-fg tracking-wider mb-1">{displayDate}</p>
          <p className="text-sm font-mono font-black text-foreground">
            {formatMoney(payload[0].value, asset.currencySymbol || "$")}
          </p>
        </div>
      );
    }
    return null;
  };

  const gradientId = `colorPrice-${isPositive ? 'up' : 'down'}`;
  const strokeColor = isPositive ? "#0ecb81" : "#f6465d";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" id="asset-detail-modal-overlay">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-background/90 backdrop-blur-md"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative bg-card w-full max-w-4xl max-h-full overflow-y-auto border border-border rounded-2xl flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.5)] dark:shadow-[0_0_50px_rgba(255,214,0,0.03)] ring-1 ring-border/50" 
        onClick={e => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="p-6 border-b border-border flex items-start justify-between sticky top-0 bg-card/95 backdrop-blur z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 border border-border bg-primary text-primary-fg flex items-center justify-center font-black text-2xl shadow-lg shadow-black/5 dark:shadow-black/20 rounded-2xl">
              {asset.symbol.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-sans font-black text-2xl uppercase tracking-tighter text-foreground leading-none">
                  {asset.symbol}
                </h2>
                <span className="text-[10px] font-black uppercase bg-muted border border-border px-2 py-0.5 rounded-full text-foreground/60 tracking-wider">
                  {asset.category}
                </span>
              </div>
              <p className="text-foreground/60 text-sm font-bold uppercase tracking-wider mt-1">{asset.name}</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={handleTogglePin}
              className={`p-2 rounded-xl transition-colors cursor-pointer border ${isPinned ? 'bg-accent text-accent-fg border-accent' : 'bg-muted hover:bg-border text-foreground border-transparent'}`}
              title="Pin to Dashboard"
            >
              <Pin className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setIsAlertOpen(!isAlertOpen)}
              className={`p-2 rounded-xl transition-colors cursor-pointer border ${isAlertOpen ? 'bg-primary text-primary-fg border-primary' : 'bg-muted hover:bg-border text-foreground border-transparent'}`}
              title="Set Price Alert"
            >
              <Bell className="w-5 h-5" />
            </button>
            <button 
              onClick={onClose}
              className="p-2 bg-muted hover:bg-border text-foreground rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isAlertOpen && (
          <div className="p-4 bg-muted/30 border-b border-border flex items-center gap-4">
            <div className="text-sm font-black uppercase tracking-wider text-foreground">Set Price Alert</div>
            <select 
              value={alertCondition} 
              onChange={e => setAlertCondition(e.target.value as "ABOVE" | "BELOW")}
              className="bg-card border border-border text-xs font-bold uppercase rounded p-2 text-foreground"
            >
              <option value="ABOVE">Crosses Above</option>
              <option value="BELOW">Drops Below</option>
            </select>
            <div className="flex items-center gap-2 bg-card border border-border rounded p-2">
              <span className="text-muted-fg text-xs font-bold">{asset.currencySymbol || "$"}</span>
              <input 
                type="number" 
                value={alertTarget} 
                onChange={e => setAlertTarget(Number(e.target.value))}
                className="bg-transparent outline-none text-xs font-bold w-24 text-foreground font-mono"
              />
            </div>
            <button 
              onClick={handleSetAlert}
              className="bg-primary text-primary-fg text-xs font-black uppercase tracking-wider px-4 py-2 rounded hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            >
              Save Alert
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-6 space-y-8 flex-1">
          
          {/* Top Metrics Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-background border border-border p-4 rounded-xl">
              <span className="text-[10px] font-black text-muted-fg uppercase tracking-wider block mb-1">Current Price</span>
              <div className="flex items-baseline gap-2">
                <span className="font-mono font-black text-2xl text-foreground">
                  {formatMoney(asset.price, asset.currencySymbol || "$")}
                </span>
              </div>
            </div>
            
            <div className="bg-background border border-border p-4 rounded-xl">
              <span className="text-[10px] font-black text-muted-fg uppercase tracking-wider block mb-1">24h Change</span>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 font-mono font-black text-xl px-2 py-0.5 rounded-lg border ${
                  isPositive ? "text-success bg-success/10 border-success/20" : "text-danger bg-danger/10 border-danger/20"
                }`}>
                  {isPositive ? <ChevronUp className="w-5 h-5 stroke-[3px]" /> : <ChevronDown className="w-5 h-5 stroke-[3px]" />}
                  {isPositive ? "+" : ""}{asset.changePercent.toFixed(2)}%
                </span>
              </div>
            </div>

            <div className="bg-background border border-border p-4 rounded-xl">
              <span className="text-[10px] font-black text-muted-fg uppercase tracking-wider block mb-1">Market Cap</span>
              <span className="font-mono font-black text-xl text-foreground block">{asset.marketCap}</span>
            </div>

            <div className="bg-background border border-border p-4 rounded-xl">
              <span className="text-[10px] font-black text-muted-fg uppercase tracking-wider block mb-1">24h Volume</span>
              <span className="font-mono font-black text-xl text-foreground block">{asset.volume}</span>
            </div>
          </div>

          {/* Chart Section */}
          <div className="bg-background border border-border rounded-xl p-4 sm:p-6 relative flex flex-col" style={{ minHeight: "450px" }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  <h3 className="font-sans font-black text-xs uppercase tracking-wider text-foreground">
                    Price Trend {isSimulated ? "(Simulated)" : ""}
                  </h3>
                </div>
                {!isAdvancedChart && (
                  <select
                    value={chartType}
                    onChange={(e) => setChartType(e.target.value as "Area" | "Line" | "Bar")}
                    className="bg-card border border-border text-[10px] font-bold uppercase rounded p-1.5 text-foreground outline-none cursor-pointer"
                  >
                    <option value="Area">Area</option>
                    <option value="Line">Line</option>
                    <option value="Bar">Bar</option>
                  </select>
                )}
                <button
                  onClick={() => setIsAdvancedChart(!isAdvancedChart)}
                  className={`px-3 py-1.5 text-[10px] font-black uppercase rounded transition-colors cursor-pointer border ${isAdvancedChart ? 'bg-primary text-primary-fg border-primary' : 'bg-card text-foreground border-border hover:bg-muted'}`}
                >
                  Advanced Chart
                </button>
              </div>
              {!isAdvancedChart && (
                <div className="flex items-center bg-muted/30 p-1 rounded-lg border border-border overflow-x-auto scrollbar-none">
                  {(["1D", "5D", "1W", "1M", "3M", "6M", "YTD", "1Y", "5Y", "ALL"] as const).map(tf => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`px-3 py-1 text-[10px] font-black uppercase rounded transition-all cursor-pointer whitespace-nowrap ${timeframe === tf ? 'bg-card text-primary shadow-sm border border-border/50' : 'text-muted-fg hover:text-foreground'}`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex-1 w-full relative min-h-[350px]">
              {isAdvancedChart ? (
                <iframe
                  src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_123&symbol=${
                    asset.category === "Crypto"
                      ? asset.symbol.endsWith("USDT") || asset.symbol.endsWith("USD")
                        ? `BINANCE:${asset.symbol}`
                        : `BINANCE:${asset.symbol}USD`
                      : asset.symbol
                  }&interval=D&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=%5B%5D&theme=dark&style=1&timezone=Etc%2FUTC&studies_overrides=%7B%7D&overrides=%7B%7D&enabled_features=%5B%5D&disabled_features=%5B%5D&locale=en&utm_source=localhost&utm_medium=widget&utm_campaign=chart`}
                  width="100%"
                  height="100%"
                  className="absolute inset-0 border-0 rounded-xl"
                  allowTransparency={true}
                  scrolling="no"
                  allowFullScreen={true}
                ></iframe>
              ) : isLoadingChart ? (
                <div className="w-full h-full flex flex-col items-center justify-end pb-4 absolute inset-0 space-y-4 px-4 animate-pulse">
                  <div className="w-full h-3/4 bg-border/20 rounded-xl" />
                  <div className="flex gap-4 w-full px-2">
                    <div className="h-4 bg-border/30 rounded w-1/6" />
                    <div className="h-4 bg-border/30 rounded w-1/6" />
                    <div className="h-4 bg-border/30 rounded w-1/6" />
                    <div className="h-4 bg-border/30 rounded w-1/6" />
                    <div className="h-4 bg-border/30 rounded w-1/6" />
                  </div>
                </div>
              ) : error ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-danger absolute inset-0">
                  <span className="text-xs font-black uppercase tracking-wider">Error: {error}</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" className="absolute inset-0">
                  {chartType === "Area" ? (
                    <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={strokeColor} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--muted-fg)', fontWeight: 700 }} dy={10} minTickGap={30} />
                      <YAxis domain={['dataMin', 'dataMax']} hide={true} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="price" stroke={strokeColor} strokeWidth={3} fillOpacity={1} fill={`url(#${gradientId})`} />
                    </AreaChart>
                  ) : chartType === "Line" ? (
                    <LineChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--muted-fg)', fontWeight: 700 }} dy={10} minTickGap={30} />
                      <YAxis domain={['dataMin', 'dataMax']} hide={true} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="price" stroke={strokeColor} strokeWidth={3} dot={false} />
                    </LineChart>
                  ) : (
                    <BarChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--muted-fg)', fontWeight: 700 }} dy={10} minTickGap={30} />
                      <YAxis domain={['dataMin', 'dataMax']} hide={true} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="price" fill={strokeColor} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Advanced Market Metrics (OHLC) */}
          {periodStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-background border border-border p-4 rounded-xl relative overflow-hidden group hover:border-primary/50 transition-colors">
                <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-[100%] transition-transform group-hover:scale-110"></div>
                <span className="text-[10px] font-black text-muted-fg uppercase tracking-wider block mb-1">Open Price</span>
                <span className="font-mono font-black text-xl text-foreground relative z-10">
                  {formatMoney(periodStats.open, asset.currencySymbol || "$")}
                </span>
              </div>
              <div className="bg-background border border-border p-4 rounded-xl relative overflow-hidden group hover:border-primary/50 transition-colors">
                <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-[100%] transition-transform group-hover:scale-110"></div>
                <span className="text-[10px] font-black text-muted-fg uppercase tracking-wider block mb-1">Close Price</span>
                <span className="font-mono font-black text-xl text-foreground relative z-10">
                  {formatMoney(periodStats.close, asset.currencySymbol || "$")}
                </span>
              </div>
              <div className="bg-background border border-border p-4 rounded-xl relative overflow-hidden group hover:border-success/50 transition-colors">
                <div className="absolute top-0 right-0 w-16 h-16 bg-success/5 rounded-bl-[100%] transition-transform group-hover:scale-110"></div>
                <span className="text-[10px] font-black text-success/70 uppercase tracking-wider block mb-1">Period High (Trần)</span>
                <span className="font-mono font-black text-xl text-success relative z-10">
                  {formatMoney(periodStats.high, asset.currencySymbol || "$")}
                </span>
              </div>
              <div className="bg-background border border-border p-4 rounded-xl relative overflow-hidden group hover:border-danger/50 transition-colors">
                <div className="absolute top-0 right-0 w-16 h-16 bg-danger/5 rounded-bl-[100%] transition-transform group-hover:scale-110"></div>
                <span className="text-[10px] font-black text-danger/70 uppercase tracking-wider block mb-1">Period Low (Đáy)</span>
                <span className="font-mono font-black text-xl text-danger relative z-10">
                  {formatMoney(periodStats.low, asset.currencySymbol || "$")}
                </span>
              </div>
            </div>
          )}

          {/* Smart Technical Analysis */}
          {smartAnalysis && (
            <div className="bg-background border border-border p-5 rounded-xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden mt-6">
              <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="flex items-center gap-4 z-10 w-full md:w-auto">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shrink-0">
                  <Activity className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-sans font-black text-xs uppercase tracking-wider text-foreground">AI Technical Rating</h3>
                  <p className="text-[10px] font-bold text-muted-fg mt-1">Based on RSI(14) and SMA(20) crossovers</p>
                </div>
              </div>
              
              <div className="flex items-center gap-6 z-10 w-full md:w-auto justify-between md:justify-end">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-black text-muted-fg uppercase tracking-wider mb-1">RSI (14)</span>
                  <span className="font-mono font-black text-foreground">{smartAnalysis.rsi}</span>
                </div>
                <div className="w-px h-8 bg-border hidden md:block"></div>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-black text-muted-fg uppercase tracking-wider mb-1">SMA (20)</span>
                  <span className="font-mono font-black text-foreground">{smartAnalysis.sma20}</span>
                </div>
                <div className="w-px h-8 bg-border hidden md:block"></div>
                <div className={`px-4 py-2 rounded-lg border flex items-center justify-center shrink-0 ${smartAnalysis.color}`}>
                  <span className="font-sans font-black text-sm uppercase tracking-widest">{smartAnalysis.rating}</span>
                </div>
              </div>
            </div>
          )}

          {/* Additional Details & Actions */}
          <div className="flex flex-col space-y-6">
            <div className="bg-background border border-border rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <h3 className="font-sans font-black text-xs uppercase tracking-wider text-foreground shrink-0">Technical Data</h3>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm w-full md:w-auto md:justify-end">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-muted-fg uppercase tracking-wider text-[10px]">P/E Ratio</span>
                  <span className="font-mono font-black text-foreground">{asset.peRatio}</span>
                </div>
                <div className="w-px h-4 bg-border hidden md:block"></div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-muted-fg uppercase tracking-wider text-[10px]">Data Quality</span>
                  <span className="font-mono font-black text-foreground uppercase">{asset.dataQuality || "unknown"}</span>
                </div>
                <div className="w-px h-4 bg-border hidden md:block"></div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-muted-fg uppercase tracking-wider text-[10px]">Last Updated</span>
                  <span className="font-mono font-black text-foreground">
                    {asset.updatedAt ? new Date(asset.updatedAt).toLocaleTimeString() : "--:--"}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-background border border-border rounded-xl p-6 flex flex-col justify-center text-center space-y-4">
              {analysisResult ? (
                <div className="text-left w-full h-full flex flex-col relative">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/50 shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary/30 to-primary/5 flex items-center justify-center border border-primary/20 shadow-[0_0_10px_rgba(255,214,0,0.2)]">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <h3 className="font-sans font-black text-sm uppercase tracking-wider text-foreground">Company Profile</h3>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 border border-primary/20 rounded-md">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-primary">AI Generated</span>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto pr-2 max-h-[220px]">
                    <div className="relative p-5 rounded-xl bg-card border border-border/50 shadow-inner overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-primary/50 rounded-l-xl"></div>
                      <div className="absolute -top-4 -right-4 text-primary/5 font-serif text-8xl leading-none select-none pointer-events-none">"</div>
                      
                      <div 
                        className="relative text-[12.5px] text-foreground/80 leading-[1.8] font-semibold z-10" 
                        style={{ whiteSpace: "pre-wrap" }}
                      >
                        {analysisResult}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
                    <Sparkles className="w-6 h-6 fill-current" />
                  </div>
                  <div>
                    <h3 className="font-sans font-black text-sm uppercase tracking-wider text-foreground mb-2">Company Profile</h3>
                    <p className="text-xs text-foreground/60 font-semibold mb-6 max-w-xs mx-auto">
                      Generate a comprehensive overview of the company's business model and market position using AI.
                    </p>
                  </div>
                  <button
                    onClick={handleInlineAnalyze}
                    disabled={isAnalyzing}
                    className="w-full bg-primary text-primary-fg hover:bg-accent hover:text-accent-fg border border-border font-black uppercase text-xs tracking-wider py-4 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait"
                  >
                    <Sparkles className={`w-4 h-4 fill-current ${isAnalyzing ? "animate-spin" : ""}`} />
                    {isAnalyzing ? "Loading Profile..." : "View Company Profile"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
