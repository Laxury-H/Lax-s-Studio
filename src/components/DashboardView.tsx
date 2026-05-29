import React, { useState, FormEvent, Fragment } from "react";
import { Sparkles, TrendingUp, RefreshCw, Plus, ArrowUpRight, ArrowDownRight, Newspaper, ChevronUp, ChevronDown, Filter, GripVertical, ChevronRight } from "lucide-react";
import { MarketAsset, NewsArticle } from "../types";

interface DashboardViewProps {
  watchlist: MarketAsset[];
  marketAssets: MarketAsset[];
  onAddSymbol: (symbol: string) => void;
  onSelectTicker: (ticker: string) => void;
  onViewAssetDetail?: (symbol: string) => void;
  onRemoveWatchlist: (symbol: string) => void;
  onReorderWatchlist?: (draggedSymbol: string, targetSymbol: string) => void;
}

export default function DashboardView({
  watchlist,
  marketAssets,
  onAddSymbol,
  onSelectTicker,
  onViewAssetDetail,
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

  const [latestNews, setLatestNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  React.useEffect(() => {
    async function fetchNews() {
      try {
        setNewsLoading(true);
        const res = await fetch("/api/news");
        if (res.ok) {
          const data = await res.json();
          setLatestNews(data);
        }
      } catch (e) {
        console.error("Failed to fetch news", e);
      } finally {
        setNewsLoading(false);
      }
    }
    fetchNews();
  }, []);
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
      setSummarizedText(data.summary || `No AI summary returned for ${asset.symbol}.`);
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5" id="dashboard-header">
        <div>
          <h2 className="font-sans font-black text-4xl text-foreground tracking-tighter uppercase italic">Good morning</h2>
          <p className="text-foreground/60 text-xs font-black uppercase tracking-wider mt-1">Surveillance Core Container // Active Telemetry</p>
        </div>
      </div>

      {/* Live asset cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="indices-ribbon">
        {marketAssets.slice(0, 3).map((asset) => {
          const isUp = asset.changePercent >= 0;
          return (
            <div 
              key={asset.symbol}
              id={`asset-card-${asset.symbol}`}
              className="bg-card border border-border p-5 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 flex items-center justify-between"
            >
              <div>
                <span className="text-[10px] font-black text-foreground/40 tracking-wider uppercase block">{asset.symbol}</span>
                <span className="font-mono font-black text-2xl text-foreground mt-1 block">
                  {asset.currencySymbol || "$"}{asset.price.toLocaleString("en-US", { minimumFractionDigits: asset.price > 1000 ? 0 : 2, maximumFractionDigits: asset.price > 1000 ? 0 : 2 })}
                </span>
                <span className={`inline-flex items-center gap-1 text-[10px] font-black mt-1 px-2.5 py-0.5 border border-border rounded-xl ${
                  isUp ? "text-success bg-success/10" : "text-danger bg-danger/10"
                }`}>
                  {isUp ? <ArrowUpRight className="w-3" /> : <ArrowDownRight className="w-3" />}
                  {isUp ? "+" : ""}{asset.changePercent.toFixed(2)}%
                </span>
              </div>
            </div>
          );
        })}
        {marketAssets.length === 0 && (
          <div className="md:col-span-3 bg-card border border-border p-6 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20">
            <span className="text-xs font-black uppercase tracking-wider text-foreground/60">Waiting for live market data from configured APIs.</span>
          </div>
        )}
      </div>

      {/* Grid of Main AI Market Insight & Watchlist | Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="dashboard-body">
        
        {/* Left Column (2 spans): Market Insight & Watchlist */}
        <div className="lg:col-span-2 space-y-6" id="dashboard-primary-column">
          
          {/* AI Market Insight Card */}
          <div className="bg-card border border-border border-l-4 border-l-primary p-6 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20" id="ai-market-insight-card">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1 px-1.5 bg-primary border border-border text-primary-fg">
                <Sparkles className="w-4 h-4 fill-current" />
              </div>
              <h3 className="font-black text-foreground text-xs uppercase tracking-wider">AI Core Market Insight</h3>
            </div>
            
            <p className="text-foreground/80 text-sm leading-relaxed font-semibold" id="dashboard-ai-summary-text">
              Select a live asset from your watchlist to generate an AI analysis using the latest data currently loaded from your providers.
            </p>

            <div className="flex items-center gap-3 mt-4">
              <button 
                onClick={() => onSelectTicker(marketAssets[0]?.symbol || "AAPL")} 
                className="bg-primary text-primary-fg text-xs font-black uppercase tracking-wider px-4 py-2.5 border border-border hover:bg-accent hover:text-foreground shadow-lg shadow-black/5 dark:shadow-black/20 active:translate-y-0.5 transition-all cursor-pointer"
              >
                Deep Dive Analysis
              </button>
              <button 
                onClick={() => onSelectTicker(marketAssets[1]?.symbol || marketAssets[0]?.symbol || "BTC")}
                className="bg-background text-foreground text-xs font-black uppercase tracking-wider px-4 py-2.5 border border-border hover:bg-card border border-border hover:text-primary-fg shadow-lg shadow-black/5 dark:shadow-black/20 active:translate-y-0.5 transition-all cursor-pointer"
              >
                Track Sentiment
              </button>
            </div>
          </div>

          {/* Your Watchlist Card */}
          <div className="bg-card border border-border rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 overflow-visible relative" id="dashboard-watchlist-card">
            <div className="p-6 border-b border-border bg-background flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="font-sans font-black text-sm uppercase tracking-wide">SURVEILLANCE LIST</h3>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Positive Gains Toggle Button */}
                <button
                  onClick={() => setFilterPositiveOnly(!filterPositiveOnly)}
                  className={`flex items-center gap-1.5 text-xs font-black uppercase border border-border px-3 py-1.5 shadow-lg shadow-black/5 dark:shadow-black/20 hover:translate-y-[0.5px] active:translate-y-[1px] transition-all cursor-pointer ${
                    filterPositiveOnly ? "bg-card border border-border text-[#FFD600]" : "bg-card text-foreground"
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
                      className="border border-border px-2 py-1 text-xs rounded-xl bg-card text-foreground font-semibold"
                      required
                    >
                      <option value="">Select Asset...</option>
                      {marketAssets.map(asset => (
                        <option key={asset.symbol} value={asset.symbol}>{asset.symbol} - {asset.name}</option>
                      ))}
                    </select>
                    <button type="submit" className="bg-primary text-primary-fg border border-border p-1 text-xs px-2.5 font-bold uppercase shadow-lg shadow-black/5 dark:shadow-black/20 hover:bg-primary/90 transition-all cursor-pointer">Add</button>
                    <button onClick={() => setIsAdding(false)} className="text-foreground/60 hover:text-foreground font-black text-xs uppercase px-1 cursor-pointer">Cancel</button>
                  </form>
                ) : (
                  <button 
                    onClick={() => setIsAdding(true)} 
                    className="flex items-center gap-1.5 text-xs font-black uppercase border border-border bg-primary text-primary-fg px-3 py-1.5 shadow-lg shadow-black/5 dark:shadow-black/20 hover:bg-card border border-border/90 hover:text-primary-fg transition-all cursor-pointer"
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
                  <tr className="bg-card border border-border text-[#FFD600] font-black uppercase text-[10px] tracking-widest border-b border-border">
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
                      <td colSpan={5} className="px-6 py-12 text-foregroundenter text-xs font-black uppercase text-foreground/50 tracking-wider">
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
                        className={`hover:bg-muted transition-colors ${isDragging ? "opacity-50 bg-muted" : ""} ${isDragOver ? "border-t-2 border-[#0047FF]" : ""}`}
                      >
                        <td className="px-6 py-4 relative">
                          <div className="flex items-center gap-2">
                            {!filterPositiveOnly && (
                              <div className="cursor-grab active:cursor-grabbing text-muted-fg hover:text-foreground mt-0.5">
                                <GripVertical className="w-3.5 h-3.5" />
                              </div>
                            )}
                            <button
                              onClick={() => toggleRowExpansion(item.symbol)}
                              className="text-muted-fg hover:text-foreground transition-transform cursor-pointer"
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
                                if (onViewAssetDetail) onViewAssetDetail(item.symbol);
                                setHoveredSymbol(null);
                              }}
                              className="font-mono font-black text-sm text-[#0047FF] hover:underline uppercase block text-left cursor-pointer"
                            >
                              {item.symbol}
                            </button>
                            {hoveredSymbol === item.symbol && (
                              <div 
                                className="absolute left-[105%] top-1/2 -translate-y-1/2 ml-3 z-50 bg-card border border-border p-2.5 shadow-lg shadow-black/5 dark:shadow-black/20 rounded-xl w-60 pointer-events-none flex flex-col animate-fade-in"
                                style={{ animationDuration: "150ms" }}
                                id={`mini-data-popover-${item.symbol}`}
                              >
                                <div className="flex items-center justify-between border-b border-border/15 pb-1 mb-2 bg-card select-none">
                                  <span className="font-sans font-black text-[10px] uppercase text-foreground tracking-wider">
                                    {item.symbol} // Live data
                                  </span>
                                  <span className={`font-mono text-[9px] font-black px-1.5 py-0.5 border border-border rounded-xl ${
                                    isPositive ? "text-success bg-success/10" : "text-danger bg-danger/10"
                                  }`}>
                                    {isPositive ? "+" : ""}{item.changePercent.toFixed(2)}%
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[8px] select-none">
                                  <div>
                                    <span className="text-[7px] text-muted-fg uppercase font-black tracking-wider leading-none block">Mkt Cap</span>
                                    <span className="font-mono font-black text-foreground leading-tight mt-0.5 block">{item.marketCap}</span>
                                  </div>
                                  <div>
                                    <span className="text-[7px] text-muted-fg uppercase font-black tracking-wider leading-none block">P/E Ratio</span>
                                    <span className="font-mono font-black text-foreground leading-tight mt-0.5 block">{item.peRatio}</span>
                                  </div>
                                  <div>
                                    <span className="text-[7px] text-muted-fg uppercase font-black tracking-wider leading-none block">Volume</span>
                                    <span className="font-mono font-black text-foreground leading-tight mt-0.5 block">{item.volume}</span>
                                  </div>
                                  <div>
                                    <span className="text-[7px] text-muted-fg uppercase font-black tracking-wider leading-none block">Provider</span>
                                    <span className="font-mono font-black text-foreground leading-tight mt-0.5 block uppercase">{item.provider || "live"}</span>
                                  </div>
                                </div>
                                <div className="text-[7.5px] font-black text-foreground/45 mt-2 pt-2 border-t border-dashed border-border/10 uppercase text-foregroundenter leading-none">
                                  Updated: {item.updatedAt ? new Date(item.updatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "provider sync"}
                                </div>
                                <div className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-y-4 border-y-transparent border-r-4 border-r-black"></div>
                                <div className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-y-[3px] border-y-transparent border-r-[3px] border-r-white translate-x-[1px]"></div>
                              </div>
                            )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-foreground font-black uppercase">{item.name}</td>
                        <td className="px-6 py-4 font-mono text-sm font-bold text-foreground">
                          <span className="inline-flex items-center gap-1">
                            {isPositive ? (
                              <ChevronUp className="w-3.5 h-3.5 text-success stroke-[3px]" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-danger stroke-[3px]" />
                            )}
                            <span>
                              {item.currencySymbol || "$"}{item.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </span>
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-0.5 text-xs font-black px-2 py-0.5 border border-border rounded-xl ${
                            isPositive ? "text-success bg-success/10" : "text-danger bg-danger/10"
                          }`}>
                            {isPositive ? "+" : ""}{item.changePercent}%
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => handleSummarizeTicker(item)}
                            className="inline-flex items-center gap-1 bg-primary hover:bg-card border border-border hover:text-primary-fg text-primary-fg border border-border text-xs font-black uppercase tracking-wider px-3.5 py-2.5 shadow-lg shadow-black/5 dark:shadow-black/20 transition-all cursor-pointer"
                          >
                            <Sparkles className="w-3 h-3 fill-current" />
                            <span>Summarize</span>
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-muted/50 border-b border-border">
                          <td colSpan={5} className="px-6 py-4">
                            <div className="flex items-center justify-between text-xs text-foreground ml-9">
                              <div className="flex gap-8">
                                <div>
                                  <span className="font-bold uppercase text-muted-fg tracking-wider block mb-1">Mkt Cap</span>
                                  <span className="font-mono font-bold text-sm tracking-tight">{item.marketCap}</span>
                                </div>
                                <div>
                                  <span className="font-bold uppercase text-muted-fg tracking-wider block mb-1">P/E Ratio</span>
                                  <span className="font-mono font-bold text-sm tracking-tight">{item.peRatio}</span>
                                </div>
                                <div>
                                  <span className="font-bold uppercase text-muted-fg tracking-wider block mb-1">Vol 24h</span>
                                  <span className="font-mono font-bold text-sm tracking-tight">{item.volume}</span>
                                </div>
                                <div>
                                  <span className="font-bold uppercase text-muted-fg tracking-wider block mb-1">Category</span>
                                  <span className="font-mono font-bold text-sm tracking-tight">{item.category.toUpperCase()}</span>
                                </div>
                                <div>
                                  <span className="font-bold uppercase text-muted-fg tracking-wider block mb-1">Provider</span>
                                  <span className="font-mono font-bold text-sm tracking-tight uppercase">{item.provider || "live"}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => onRemoveWatchlist(item.symbol)}
                                  className="inline-flex items-center gap-1.5 text-xs font-black uppercase text-danger bg-card border border-danger hover:bg-danger/10 px-3 py-1.5 transition-all shadow-md shadow-black/5 dark:shadow-black/20 active:translate-y-[1px] active:shadow-md shadow-black/5 dark:shadow-black/20 cursor-pointer"
                                >
                                  Remove
                                </button>
                                <button
                                  onClick={() => onSelectTicker(item.symbol)}
                                  className="inline-flex items-center gap-1.5 text-xs font-black uppercase text-foreground bg-accent border border-border hover:bg-card border border-border hover:text-accent-fg px-3 py-1.5 transition-all shadow-lg shadow-black/5 dark:shadow-black/20 active:translate-y-[1px] active:shadow-lg shadow-black/5 dark:shadow-black/20 cursor-pointer"
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
              <div className="bg-accent/10 border-t border-border p-5" id="watchlist-summarizer-container">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 fill-current text-[#0047FF]" />
                    <span className="font-black uppercase tracking-wider text-xs text-foreground">FinPilot AI Research Report: {activeSummarizedSymbol}</span>
                  </div>
                  <button 
                    onClick={() => setActiveSummarizedSymbol(null)} 
                    className="text-foreground font-black uppercase text-[10px] tracking-wider border border-border bg-card px-2 py-1 shadow-lg shadow-black/5 dark:shadow-black/20"
                  >
                    Clear Analysis
                  </button>
                </div>
                {summariesLoading[activeSummarizedSymbol] ? (
                  <div className="flex items-center gap-2 text-xs text-foreground font-semibold">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#0047FF]" />
                    <span className="uppercase tracking-wider">DEPLOYING NEURAL MODEL STREAM...</span>
                  </div>
                ) : (
                  <p className="text-foreground text-xs font-semibold leading-relaxed font-sans bg-card p-4 rounded-xl border border-border shadow-lg shadow-black/5 dark:shadow-black/20">
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
          <div className="bg-card border border-border p-6 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20" id="top-movers-panel">
            <h3 className="font-sans font-black text-sm uppercase tracking-wider text-foreground mb-4 flex items-center justify-between">
              <span>Top Movers</span>
              <TrendingUp className="w-4 h-4 text-success" />
            </h3>

            <div className="space-y-3.5">
              {topMovers.map((mover) => {
                const isPositive = mover.changePercent >= 0;

                return (
                  <div key={mover.symbol} className="flex items-center justify-between flex-row border-b border-border/5 pb-2 last:border-border last:pb-0">
                    <div className="flex items-center gap-3">
                      {mover.logo && (
                        <div className="w-8 h-8 rounded-full border border-border bg-card flex items-center justify-center overflow-hidden shadow-lg shadow-black/5 dark:shadow-black/20 shrink-0">
                          <img src={mover.logo} alt={mover.symbol} className="w-6 h-6 object-contain" />
                        </div>
                      )}
                      <div>
                        <span className="font-mono font-black text-xs text-foreground block leading-none">{mover.symbol}</span>
                        <span className="text-foreground/60 text-[9px] block font-bold uppercase mt-1 tracking-wider">{mover.name}</span>
                      </div>
                    </div>
                    <span className={`font-mono font-black text-xs tracking-wider border border-border px-1.5 py-0.5 ${
                      isPositive ? "text-success bg-success/10" : "text-danger bg-danger/10"
                    }`}>
                      {isPositive ? "+" : ""}{mover.changePercent.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Latest News widget */}
          <div className="bg-card border border-border p-6 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 flex flex-col justify-between" id="latest-news-panel">
            <div>
              <h3 className="font-sans font-black text-sm uppercase tracking-wider text-foreground mb-4 flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-[#0047FF]" />
                <span>Latest News</span>
              </h3>

              <div className="space-y-2.5">
                {newsLoading ? (
                  <div className="flex justify-center p-4">
                    <RefreshCw className="w-4 h-4 animate-spin text-foreground/50" />
                  </div>
                ) : latestNews.length > 0 ? (
                  latestNews.slice(0, 4).map((item, i) => (
                    <a
                      key={item.id || i}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 border border-border bg-background hover:bg-muted/50 hover:translate-y-[-1px] transition-all cursor-pointer group"
                    >
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[8px] font-black uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5">{item.source}</span>
                        <span className="text-[9px] font-bold text-foreground/40 uppercase tracking-widest">{new Date(item.datetime * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <h4 className="text-xs font-semibold text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">
                        {item.headline}
                      </h4>
                    </a>
                  ))
                ) : (
                  <div className="border border-border/10 bg-background p-4">
                    <span className="text-[10px] font-black text-foreground/50 uppercase tracking-wider block">No news available</span>
                  </div>
                )}
              </div>
            </div>

            <button 
              onClick={() => onSelectTicker(marketAssets[0]?.symbol || "AAPL")}
              className="mt-5 w-full border border-border text-foregroundenter py-2.5 text-xs font-black uppercase text-foreground bg-background hover:bg-card border border-border hover:text-primary-fg transition-all cursor-pointer block shadow-lg shadow-black/5 dark:shadow-black/20"
            >
              Analyze Live Asset
            </button>
          </div>

          {/* Interactive News Summary Modal overlay */}
          {selectedNews && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-card border border-border/60 backdrop-blur-xs p-4" onClick={() => setSelectedNews(null)}>
              <div 
                className="bg-card rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 w-full max-w-md overflow-hidden border border-border" 
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6 border-b border-border bg-primary text-primary-fg">
                  <div className="flex items-center gap-1.5 text-primary-fg mb-1.5">
                    <Sparkles className="w-4 h-4 fill-current" />
                    <span className="text-[10px] font-black uppercase tracking-wider">AI Executive Brief</span>
                  </div>
                  <h3 className="font-sans font-black text-sm uppercase tracking-wide leading-snug">{selectedNews.title}</h3>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-xs text-foreground/80 font-semibold leading-relaxed font-sans">
                    {selectedNews.summary}
                  </p>
                  <button 
                    onClick={() => setSelectedNews(null)}
                    className="w-full bg-accent hover:bg-card border border-border hover:text-accent-fg text-foreground py-2.5 rounded-xl border border-border text-xs font-black uppercase tracking-wider transition-colors shadow-lg shadow-black/5 dark:shadow-black/20"
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

