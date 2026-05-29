import React, { useState, FormEvent, Fragment } from "react";
import { Sparkles, TrendingUp, TrendingDown, RefreshCw, Star, Plus, HelpCircle, ArrowUpRight, ArrowDownRight, Newspaper, ChevronUp, ChevronDown, Filter, GripVertical, ChevronRight } from "lucide-react";
import { MarketAsset, MarketSummary, Holding } from "../types";
import { MARKET_SUMMARIES, LATEST_NEWS, TRENDING_SECTORS } from "../data";
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

// Custom Tooltip for Watchlist Trend mini-charts
const CustomTooltip = ({ active, payload, currency }: { active?: boolean; payload?: any[]; currency: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-black text-white text-[9px] font-black uppercase p-1.5 px-2 border border-[#FFD600] rounded-xs font-mono shadow-md z-55">
        <p className="leading-none text-[8px] text-white/60 mb-0.5">{payload[0].payload.name}</p>
        <p className="leading-none text-[#FFD600] font-sans font-extrabold">
          {currency}
          {payload[0].value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </p>
      </div>
    );
  }
  return null;
};

// Seed-based deterministic trend generator for the past 7 days
const generate7DayTrend = (price: number, changePercent: number) => {
  const trend = [];
  const today = new Date();
  let currentVal = price;
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    
    if (i === 0) {
      trend.push({ name: dateStr, price: Number(price.toFixed(2)) });
    } else {
      let factor = 1;
      if (i === 1) {
        // Day 6 to Day 7 represents the 24h change percent
        factor = 1 + (changePercent / 100);
        currentVal = price / factor;
      } else {
        // Deterministic wave fluctuation for older days (-1.5% to +1.5%)
        const fluctuation = (Math.sin(i * 1.5) * 1.5) / 100;
        factor = 1 + fluctuation;
        currentVal = currentVal / factor;
      }
      trend.push({ name: dateStr, price: Number(currentVal.toFixed(2)) });
    }
  }
  return trend;
};

const Sparkline = ({ data, isPositive }: { data: { price: number }[]; isPositive: boolean }) => {
  const width = 60;
  const height = 20;
  const strokeColor = isPositive ? "#10b981" : "#ef4444";
  
  if (!data || data.length === 0) return null;
  
  const prices = data.map(d => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const minWithBuffer = min - range * 0.1;
  const maxWithBuffer = max + range * 0.1;
  const displayRange = maxWithBuffer - minWithBuffer || 1;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((d.price - minWithBuffer) / displayRange) * height;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} className="overflow-visible inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

interface DashboardViewProps {
  watchlist: MarketAsset[];
  marketAssets: MarketAsset[];
  onAddSymbol: (symbol: string) => void;
  onSelectTicker: (ticker: string) => void;
  onRemoveWatchlist: (symbol: string) => void;
  onReorderWatchlist?: (draggedSymbol: string, targetSymbol: string) => void;
}

export default function DashboardView({
  watchlist,
  marketAssets,
  onAddSymbol,
  onSelectTicker,
  onRemoveWatchlist,
  onReorderWatchlist
}: DashboardViewProps) {
  const [selectedNews, setSelectedNews] = useState<{ title: string; summary: string } | null>(null);
  const [summariesLoading, setSummariesLoading] = useState<Record<string, boolean>>({});
  const [activeSummarizedSymbol, setActiveSummarizedSymbol] = useState<string | null>(null);
  const [summarizedText, setSummarizedText] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addSymbolInput, setAddSymbolInput] = useState("");
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);
  const [filterPositiveOnly, setFilterPositiveOnly] = useState(false);
  const [draggedSymbol, setDraggedSymbol] = useState<string | null>(null);
  const [dragOverSymbol, setDragOverSymbol] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRowExpansion = (symbol: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  const displayedWatchlist = filterPositiveOnly
    ? watchlist.filter(item => item.changePercent >= 0)
    : watchlist;

  // Handler to call backend and summarize the ticker news
  const handleSummarizeTicker = async (asset: MarketAsset) => {
    setSummariesLoading(prev => ({ ...prev, [asset.symbol]: true }));
    setActiveSummarizedSymbol(asset.symbol);
    setSummarizedText(null);

    try {
      const response = await fetch("/api/summarize-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Analyze recent performance of ${asset.name} trading at ${asset.currencySymbol || "$"}${asset.price}`,
          source: "FinPilot AI Real-time Engine",
          symbol: asset.symbol
        })
      });
      const data = await response.json();
      setSummarizedText(data.summary || `Analysis completed for ${asset.symbol}. Strong trends detected.`);
    } catch (e) {
      console.error(e);
      setSummarizedText(`Unable to complete review for ${asset.symbol}. Please verify your API key.`);
    } finally {
      setSummariesLoading(prev => ({ ...prev, [asset.symbol]: false }));
    }
  };

  // Helper news summary
  const handleSummarizeNews = async (newsItem: any) => {
    setSelectedNews({ title: newsItem.title, summary: "Generating AI newsletter summary..." });
    try {
      const response = await fetch("/api/summarize-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newsItem.title,
          source: newsItem.source,
          symbol: newsItem.symbol
        })
      });
      const data = await response.json();
      setSelectedNews({ title: newsItem.title, summary: data.summary });
    } catch (e) {
      setSelectedNews({
        title: newsItem.title,
        summary: "Fail to connect to AI server. Please verify your connection or API key."
      });
    }
  };

  // Custom vector sparklines to perfectly match the design feel
  const renderSparkline = (trend: "up" | "down") => {
    const color = trend === "up" ? "#10b981" : "#ef4444";
    const points = trend === "up" 
      ? "0,25 15,10 30,22 45,8 60,18 75,5 90,12 105,2 120,6" 
      : "0,5 15,18 30,12 45,22 60,8 75,25 90,18 105,28 120,24";
    return (
      <svg className="w-24 h-8 opacity-90 overflow-visible" viewBox="0 0 120 30">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    );
  };

  const handleAddNewWatchlist = (e: FormEvent) => {
    e.preventDefault();
    const symbolClean = addSymbolInput.trim().toUpperCase();
    if (symbolClean) {
      onAddSymbol(symbolClean);
      setAddSymbolInput("");
      setIsAdding(false);
    }
  };

  const topMovers = [...marketAssets]
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 3);

  return (
    <div className="space-y-8" id="dashboard-view-root">
      {/* Search and Page Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-black pb-5" id="dashboard-header">
        <div>
          <h2 className="font-sans font-black text-4xl text-black tracking-tighter uppercase italic">Good morning, Huy</h2>
          <p className="text-black/60 text-xs font-black uppercase tracking-wider mt-1">Surveillance Core Container // Active Telemetry</p>
        </div>
      </div>

      {/* Mini Indices Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="indices-ribbon">
        {MARKET_SUMMARIES.map((summary, idx) => {
          const isUp = summary.trend === "up";
          return (
            <div 
              key={idx} 
              id={`index-card-${summary.name}`}
              className="bg-white border-2 border-black p-5 rounded-xs shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between"
            >
              <div>
                <span className="text-[10px] font-black text-black/40 tracking-wider uppercase block">{summary.name}</span>
                <span className="font-mono font-black text-2xl text-black mt-1 block">{summary.value}</span>
                <span className={`inline-flex items-center gap-1 text-[10px] font-black mt-1 px-2.5 py-0.5 border border-black rounded-xs ${
                  isUp ? "text-black bg-[#FFD600]" : "text-white bg-black"
                }`}>
                  {isUp ? <ArrowUpRight className="w-3" /> : <ArrowDownRight className="w-3" />}
                  {isUp ? "+" : ""}{summary.changePercent}%
                </span>
              </div>
              <div className="flex flex-col items-end gap-1">
                {renderSparkline(summary.trend)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid of Main AI Market Insight & Watchlist | Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="dashboard-body">
        
        {/* Left Column (2 spans): Market Insight & Watchlist */}
        <div className="lg:col-span-2 space-y-6" id="dashboard-primary-column">
          
          {/* AI Market Insight Card */}
          <div className="bg-white border-2 border-black border-l-8 border-l-[#0047FF] p-6 rounded-xs shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" id="ai-market-insight-card">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1 px-1.5 bg-[#0047FF] border border-black text-white">
                <Sparkles className="w-4 h-4 fill-current" />
              </div>
              <h3 className="font-black text-black text-xs uppercase tracking-wider">AI Core Market Insight</h3>
            </div>
            
            <p className="text-black/80 text-sm leading-relaxed font-semibold" id="dashboard-ai-summary-text">
              Tech indices are showing strong bullish momentum after yesterday's semi-conductor breakthroughs. Sentiment analysis suggests a rotation into energy stocks as oil prices stabilize. Expect moderate volatility in the S&P 500 ahead of upcoming inflation data.
            </p>

            <div className="flex items-center gap-3 mt-4">
              <button 
                onClick={() => onSelectTicker("TECH_ALERT")} 
                className="bg-[#0047FF] text-white text-xs font-black uppercase tracking-wider px-4 py-2.5 border border-black hover:bg-[#FFD600] hover:text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition-all cursor-pointer"
              >
                Deep Dive Analysis
              </button>
              <button 
                onClick={() => onSelectTicker("SENTIMENT_DATA")}
                className="bg-[#F3F3F3] text-black text-xs font-black uppercase tracking-wider px-4 py-2.5 border border-black hover:bg-black hover:text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition-all cursor-pointer"
              >
                Track Sentiment
              </button>
            </div>
          </div>

          {/* Your Watchlist Card */}
          <div className="bg-white border-2 border-black rounded-xs shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-visible relative" id="dashboard-watchlist-card">
            <div className="p-6 border-b-2 border-black bg-[#F3F3F3] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="font-sans font-black text-sm uppercase tracking-wide">SURVEILLANCE LIST</h3>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Positive Gains Toggle Button */}
                <button
                  onClick={() => setFilterPositiveOnly(!filterPositiveOnly)}
                  className={`flex items-center gap-1.5 text-xs font-black uppercase border border-black px-3 py-1.5 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[0.5px] active:translate-y-[1px] transition-all cursor-pointer ${
                    filterPositiveOnly ? "bg-black text-[#FFD600]" : "bg-white text-black"
                  }`}
                  id="btn-toggle-watchlist-filter"
                  title="Toggle positive gains filter"
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>{filterPositiveOnly ? "Gains Only" : "All Assets"}</span>
                </button>

                {isAdding ? (
                  <form onSubmit={handleAddNewWatchlist} className="flex items-center gap-2">
                    <select
                      id="watchlist-select-dropdown"
                      value={addSymbolInput}
                      onChange={(e) => setAddSymbolInput(e.target.value)}
                      className="border-2 border-black px-2 py-1 text-xs rounded-xs bg-white text-black font-semibold"
                      required
                    >
                      <option value="">Select Asset...</option>
                      {marketAssets.map(asset => (
                        <option key={asset.symbol} value={asset.symbol}>{asset.symbol} - {asset.name}</option>
                      ))}
                    </select>
                    <button type="submit" className="bg-[#0047FF] text-white border border-black p-1 text-xs px-2.5 font-bold uppercase shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:bg-[#0037c6] transition-all cursor-pointer">Add</button>
                    <button onClick={() => setIsAdding(false)} className="text-black/60 hover:text-black font-black text-xs uppercase px-1 cursor-pointer">Cancel</button>
                  </form>
                ) : (
                  <button 
                    onClick={() => setIsAdding(true)} 
                    className="flex items-center gap-1.5 text-xs font-black uppercase border border-black bg-[#FFD600] text-black px-3 py-1.5 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:bg-neutral-900 hover:text-white transition-all cursor-pointer"
                    id="btn-add-symbol"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Symbol</span>
                  </button>
                )}
              </div>
            </div>

            {/* Watchlist Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse" id="watchlist-table">
                <thead>
                  <tr className="bg-black text-[#FFD600] font-black uppercase text-[10px] tracking-widest border-b border-black">
                    <th className="px-6 py-3.5">Symbol</th>
                    <th className="px-6 py-3.5">Name</th>
                    <th className="px-6 py-3.5">Price</th>
                    <th className="px-6 py-3.5">24h Change</th>
                    <th className="px-6 py-3.5 text-right">AI Tool</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {displayedWatchlist.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-xs font-black uppercase text-black/50 tracking-wider">
                        {filterPositiveOnly ? "No assets with positive gains tracked" : "No tracked assets in watchlist"}
                      </td>
                    </tr>
                  ) : (
                    displayedWatchlist.map((item) => {
                      const isPositive = item.changePercent >= 0;
                      const isDragging = draggedSymbol === item.symbol;
                      const isDragOver = dragOverSymbol === item.symbol && draggedSymbol !== item.symbol;
                      const isExpanded = expandedRows.has(item.symbol);
                      
                      return (
                      <Fragment key={item.symbol}>
                      <tr 
                        draggable={!filterPositiveOnly}
                        onDragStart={(e) => {
                          setDraggedSymbol(item.symbol);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (!filterPositiveOnly) {
                            setDragOverSymbol(item.symbol);
                            e.dataTransfer.dropEffect = "move";
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverSymbol === item.symbol) {
                            setDragOverSymbol(null);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (!filterPositiveOnly && draggedSymbol && draggedSymbol !== item.symbol) {
                            onReorderWatchlist?.(draggedSymbol, item.symbol);
                          }
                          setDraggedSymbol(null);
                          setDragOverSymbol(null);
                        }}
                        onDragEnd={() => {
                          setDraggedSymbol(null);
                          setDragOverSymbol(null);
                        }}
                        className={`hover:bg-neutral-50 transition-colors ${isDragging ? "opacity-50 bg-neutral-100" : ""} ${isDragOver ? "border-t-2 border-[#0047FF]" : ""}`}
                      >
                        <td className="px-6 py-4 relative">
                          <div className="flex items-center gap-2">
                            {!filterPositiveOnly && (
                              <div className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-black mt-0.5">
                                <GripVertical className="w-3.5 h-3.5" />
                              </div>
                            )}
                            <button
                              onClick={() => toggleRowExpansion(item.symbol)}
                              className="text-neutral-400 hover:text-black transition-transform cursor-pointer"
                              style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                            <div 
                              className="relative inline-block"
                              onMouseEnter={() => setHoveredSymbol(item.symbol)}
                              onMouseLeave={() => setHoveredSymbol(null)}
                            >
                            <button 
                              onClick={() => {
                                onSelectTicker(item.symbol);
                                setHoveredSymbol(null);
                              }}
                              className="font-mono font-black text-sm text-[#0047FF] hover:underline uppercase block text-left cursor-pointer"
                            >
                              {item.symbol}
                            </button>

                            {hoveredSymbol === item.symbol && (
                              <div 
                                className="absolute left-[105%] top-1/2 -translate-y-1/2 ml-3 z-50 bg-white border-2 border-black p-2.5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-xs w-60 pointer-events-none flex flex-col animate-fade-in"
                                style={{ animationDuration: '150ms' }}
                                id={`mini-chart-popover-${item.symbol}`}
                              >
                                <div className="flex items-center justify-between border-b border-black/15 pb-1 mb-1.5 bg-white select-none">
                                  <span className="font-sans font-black text-[10px] uppercase text-black tracking-wider">
                                    {item.symbol} // 7D Trend
                                  </span>
                                  <span className={`font-mono text-[9px] font-black px-1.5 py-0.5 border border-black rounded-xs ${
                                    isPositive ? "bg-emerald-100 text-[#0f5132]" : "bg-black text-white"
                                  }`}>
                                    {isPositive ? "+" : ""}{item.changePercent}%
                                  </span>
                                </div>
                                
                                <div className="h-[75px] w-full pt-1" id={`recharts-container-${item.symbol}`}>
                                  <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart 
                                      data={generate7DayTrend(item.price, item.changePercent)} 
                                      margin={{ top: 2, right: 2, left: -25, bottom: 2 }}
                                    >
                                      <defs>
                                        <linearGradient id={`gradient-${item.symbol}`} x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="5%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0.35}/>
                                          <stop offset="95%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0.0}/>
                                        </linearGradient>
                                      </defs>
                                      <CartesianGrid strokeDasharray="1 1" vertical={false} stroke="rgba(0,0,0,0.08)" />
                                      <XAxis 
                                        dataKey="name" 
                                        tickLine={false} 
                                        axisLine={false} 
                                        tick={{ fontSize: 7, fill: "rgba(0,0,0,0.6)", fontWeight: "bold" }} 
                                      />
                                      <YAxis 
                                        domain={['auto', 'auto']} 
                                        tickLine={false} 
                                        axisLine={false} 
                                        tick={{ fontSize: 7, fill: "rgba(0,0,0,0.6)", fontWeight: "bold" }}
                                        tickFormatter={(val) => `${item.currencySymbol || "$"}${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val.toFixed(0)}`}
                                      />
                                      <Tooltip content={<CustomTooltip currency={item.currencySymbol || "$"} />} />
                                      <Area
                                        type="monotone"
                                        dataKey="price"
                                        stroke={isPositive ? "#10b981" : "#ef4444"}
                                        fill={`url(#gradient-${item.symbol})`}
                                        strokeWidth={1.5}
                                      />
                                    </AreaChart>
                                  </ResponsiveContainer>
                                </div>
                                <div className="flex justify-between items-center text-[8px] border-t border-black/10 pt-2 mt-2 select-none">
                                  <div className="text-left w-[33%]">
                                    <span className="text-[7px] text-neutral-500 uppercase font-black tracking-wider leading-none block">Mkt Cap</span>
                                    <span className="font-mono font-black text-black leading-tight mt-0.5 block">{item.marketCap}</span>
                                  </div>
                                  <div className="text-center w-[33%] border-x border-black/10">
                                    <span className="text-[7px] text-neutral-500 uppercase font-black tracking-wider leading-none block">P/E Ratio</span>
                                    <span className="font-mono font-black text-black leading-tight mt-0.5 block">{item.peRatio}</span>
                                  </div>
                                  <div className="text-right w-[33%]">
                                    <span className="text-[7px] text-neutral-500 uppercase font-black tracking-wider leading-none block">Vol 24h</span>
                                    <span className="font-mono font-black text-black leading-tight mt-0.5 block">{item.volume}</span>
                                  </div>
                                </div>

                                <div className="text-[7.5px] font-black text-black/45 mt-1.5 pt-1.5 border-t border-dashed border-black/10 uppercase text-center leading-none">
                                  Current: {item.currencySymbol || "$"}{item.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                </div>
                                {/* Left-pointing caret */}
                                <div className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-y-4 border-y-transparent border-r-4 border-r-black"></div>
                                <div className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-y-[3px] border-y-transparent border-r-[3px] border-r-white translate-x-[1px]"></div>
                              </div>
                            )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-black font-black uppercase">{item.name}</td>
                        <td className="px-6 py-4 font-mono text-sm font-bold text-black">
                          <span className="inline-flex items-center gap-1">
                            {isPositive ? (
                              <ChevronUp className="w-3.5 h-3.5 text-emerald-600 stroke-[3px]" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-red-600 stroke-[3px]" />
                            )}
                            <span>
                              {item.currencySymbol || "$"}{item.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </span>
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-0.5 text-xs font-black px-2 py-0.5 border border-black rounded-xs ${
                            isPositive ? "text-black bg-emerald-100" : "text-white bg-black"
                          }`}>
                            {isPositive ? "+" : ""}{item.changePercent}%
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => handleSummarizeTicker(item)}
                            className="inline-flex items-center gap-1 bg-[#0047FF] hover:bg-black hover:text-white text-white border border-black text-xs font-black uppercase tracking-wider px-3.5 py-2.5 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer"
                          >
                            <Sparkles className="w-3 h-3 fill-current" />
                            <span>Summarize</span>
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-neutral-50/50 border-b border-black">
                          <td colSpan={5} className="px-6 py-4">
                            <div className="flex items-center justify-between text-xs text-black ml-9">
                              <div className="flex gap-8">
                                <div>
                                  <span className="font-bold uppercase text-neutral-500 tracking-wider block mb-1">Mkt Cap</span>
                                  <span className="font-mono font-bold text-sm tracking-tight">{item.marketCap}</span>
                                </div>
                                <div>
                                  <span className="font-bold uppercase text-neutral-500 tracking-wider block mb-1">P/E Ratio</span>
                                  <span className="font-mono font-bold text-sm tracking-tight">{item.peRatio}</span>
                                </div>
                                <div>
                                  <span className="font-bold uppercase text-neutral-500 tracking-wider block mb-1">Vol 24h</span>
                                  <span className="font-mono font-bold text-sm tracking-tight">{item.volume}</span>
                                </div>
                                <div>
                                  <span className="font-bold uppercase text-neutral-500 tracking-wider block mb-1">Category</span>
                                  <span className="font-mono font-bold text-sm tracking-tight">{item.category.toUpperCase()}</span>
                                </div>
                                <div>
                                  <span className="font-bold uppercase text-neutral-500 tracking-wider block mb-1">Volatility Index</span>
                                  <div className="mt-1">
                                    <Sparkline data={generate7DayTrend(item.price, item.changePercent)} isPositive={isPositive} />
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => onRemoveWatchlist(item.symbol)}
                                  className="inline-flex items-center gap-1.5 text-xs font-black uppercase text-red-600 bg-white border border-red-600 hover:bg-red-50 px-3 py-1.5 transition-all shadow-[1.5px_1.5px_0px_0px_rgba(220,38,38,1)] active:translate-y-[1px] active:shadow-[0px_0px_0px_0px_rgba(220,38,38,1)] cursor-pointer"
                                >
                                  Remove
                                </button>
                                <button
                                  onClick={() => onSelectTicker(item.symbol)}
                                  className="inline-flex items-center gap-1.5 text-xs font-black uppercase text-black bg-[#FFD600] border border-black hover:bg-black hover:text-[#FFD600] px-3 py-1.5 transition-all shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] active:translate-y-[1px] active:shadow-[0px_0px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
                                >
                                  Analyze
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
              </table>
            </div>

            {/* Watchlist Inline Real-time Summarizer block */}
            {activeSummarizedSymbol && (
              <div className="bg-[#FFD600]/10 border-t-2 border-black p-5" id="watchlist-summarizer-container">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 fill-current text-[#0047FF]" />
                    <span className="font-black uppercase tracking-wider text-xs text-black">FinPilot AI Research Report: {activeSummarizedSymbol}</span>
                  </div>
                  <button 
                    onClick={() => setActiveSummarizedSymbol(null)} 
                    className="text-black font-black uppercase text-[10px] tracking-wider border border-black bg-white px-2 py-1 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                  >
                    Clear Analysis
                  </button>
                </div>
                {summariesLoading[activeSummarizedSymbol] ? (
                  <div className="flex items-center gap-2 text-xs text-black font-semibold">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#0047FF]" />
                    <span className="uppercase tracking-wider">DEPLOYING NEURAL MODEL STREAM...</span>
                  </div>
                ) : (
                  <p className="text-black text-xs font-semibold leading-relaxed font-sans bg-white p-4 rounded-xs border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                    {summarizedText}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1 span): Top Movers & Latest News */}
        <div className="space-y-6" id="dashboard-secondary-column">
          
          {/* Top Movers widget */}
          <div className="bg-white border-2 border-black p-6 rounded-xs shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" id="top-movers-panel">
            <h3 className="font-sans font-black text-sm uppercase tracking-wider text-black mb-4 flex items-center justify-between">
              <span>Top Movers</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </h3>

            <div className="space-y-3.5">
              {topMovers.map((mover) => {
                const isPositive = mover.changePercent >= 0;

                return (
                  <div key={mover.symbol} className="flex items-center justify-between flex-row border-b border-black/5 pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 border border-black bg-[#FFD600] text-black flex items-center justify-center font-black text-xs shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                        {mover.symbol.charAt(0)}
                      </div>
                      <div>
                        <span className="font-mono font-black text-xs text-black block leading-none">{mover.symbol}</span>
                        <span className="text-black/60 text-[9px] block font-bold uppercase mt-1 tracking-wider">{mover.name}</span>
                      </div>
                    </div>
                    <span className={`font-mono font-black text-xs tracking-wider border border-black px-1.5 py-0.5 ${
                      isPositive ? "bg-emerald-100 text-black" : "bg-black text-white"
                    }`}>
                      {isPositive ? "+" : ""}{mover.changePercent.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Latest News widget */}
          <div className="bg-white border-2 border-black p-6 rounded-xs shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between" id="latest-news-panel">
            <div>
              <h3 className="font-sans font-black text-sm uppercase tracking-wider text-black mb-4 flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-[#0047FF]" />
                <span>Latest News</span>
              </h3>

              <div className="space-y-4">
                {LATEST_NEWS.map((news, idx) => (
                  <div 
                    key={idx} 
                    className="group cursor-pointer border-b border-black/10 last:border-0 pb-3 h-full last:pb-0"
                    onClick={() => handleSummarizeNews(news)}
                  >
                    <span className="text-[9px] font-black text-[#0047FF] tracking-widest uppercase">{news.category}</span>
                    <h4 className="font-semibold text-xs text-black group-hover:text-[#0047FF] transition-colors leading-snug mt-1">
                      {news.title}
                    </h4>
                    <div className="flex items-center justify-between mt-1.5 text-[10px] text-black/50 font-bold uppercase">
                      <span>{news.time} • {news.source}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button 
              onClick={() => onSelectTicker("ALL_NEWS")}
              className="mt-5 w-full border border-black text-center py-2.5 text-xs font-black uppercase text-black bg-[#F3F3F3] hover:bg-black hover:text-white transition-all cursor-pointer block shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
            >
              View All News
            </button>
          </div>

          {/* Interactive News Summary Modal overlay */}
          {selectedNews && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => setSelectedNews(null)}>
              <div 
                className="bg-white rounded-xs shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] w-full max-w-md overflow-hidden border-2 border-black" 
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6 border-b-2 border-black bg-[#0047FF] text-white">
                  <div className="flex items-center gap-1.5 text-white mb-1.5">
                    <Sparkles className="w-4 h-4 fill-current" />
                    <span className="text-[10px] font-black uppercase tracking-wider">AI Executive Brief</span>
                  </div>
                  <h3 className="font-sans font-black text-sm uppercase tracking-wide leading-snug">{selectedNews.title}</h3>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-xs text-black/80 font-semibold leading-relaxed font-sans">
                    {selectedNews.summary}
                  </p>
                  <button 
                    onClick={() => setSelectedNews(null)}
                    className="w-full bg-[#FFD600] hover:bg-black hover:text-[#FFD600] text-black py-2.5 rounded-xs border border-black text-xs font-black uppercase tracking-wider transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                  >
                    Got it, Thanks
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
