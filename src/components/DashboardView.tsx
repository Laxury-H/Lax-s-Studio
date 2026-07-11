import React, { useState, FormEvent, Fragment, useContext, useMemo } from "react";
import {
  Activity,
  BarChart3,
  Clock3,
  Database,
  Eye,
  Filter,
  Gauge,
  GripVertical,
  Newspaper,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  ChevronUp,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { MarketAsset, NewsArticle } from "../types";
import { SettingsContext } from "../SettingsContext";

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
  const [now, setNow] = useState(() => new Date());

  const [latestNews, setLatestNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [marketSentiment, setMarketSentiment] = useState<{score: number, label: string, summary: string} | null>(null);
  const [fearAndGreed, setFearAndGreed] = useState<{value: string, classification: string} | null>(null);

  const settingsCtx = useContext(SettingsContext);
  const pinnedSymbols = settingsCtx?.pinnedSymbols || [];
  const language = settingsCtx?.language || "en";
  const formatMoney = settingsCtx?.formatMoney || ((value: number, source = "$") => `${source}${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  const volatilityFilter = settingsCtx?.volatilityFilter || 0;
  const setVolatilityFilter = settingsCtx?.setVolatilityFilter || (() => {});

  const topAssets = useMemo(() => {
    const pinnedAssets = pinnedSymbols
      .map(sym => marketAssets.find(a => a.symbol === sym))
      .filter(Boolean) as MarketAsset[];
      
    if (pinnedAssets.length >= 4) return pinnedAssets.slice(0, 4);
    
    // Fill remaining slots
    const targetLength = Math.max(3, pinnedAssets.length);
    const needed = targetLength - pinnedAssets.length;
    
    const unpinnedAssets = marketAssets.filter(a => !pinnedSymbols.includes(a.symbol));
    const filled = unpinnedAssets.slice(0, needed);
    
    return [...pinnedAssets, ...filled];
  }, [marketAssets, pinnedSymbols]);

  React.useEffect(() => {
    async function fetchNewsAndSentiment() {
      try {
        setNewsLoading(true);
        const [newsRes, sentimentRes, fngRes] = await Promise.all([
          fetch("/api/news"),
          fetch("/api/market-sentiment"),
          fetch("https://api.alternative.me/fng/")
        ]);
        
        if (newsRes.ok) {
          const data = await newsRes.json();
          setLatestNews(data);
        }
        
        if (sentimentRes.ok) {
          const sentData = await sentimentRes.json();
          setMarketSentiment(sentData);
        }

        if (fngRes.ok) {
          const fngData = await fngRes.json();
          if (fngData?.data?.[0]) {
            setFearAndGreed({
              value: fngData.data[0].value,
              classification: fngData.data[0].value_classification
            });
          }
        }
      } catch (e) {
        console.error("Failed to fetch news/sentiment/fng", e);
      } finally {
        setNewsLoading(false);
      }
    }
    fetchNewsAndSentiment();
  }, []);

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
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

  const displayedWatchlist = watchlist.filter(item => {
    if (filterPositiveOnly && item.changePercent < 0) return false;
    if (Math.abs(item.changePercent) < volatilityFilter) return false;
    return true;
  });

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
          symbol: asset.symbol,
          language
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
          symbol: newsItem.symbol,
          language
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

  const marketPulse = useMemo(() => {
    const positive = marketAssets.filter(asset => asset.changePercent >= 0).length;
    const negative = Math.max(0, marketAssets.length - positive);
    const avgMove = marketAssets.length
      ? marketAssets.reduce((sum, asset) => sum + asset.changePercent, 0) / marketAssets.length
      : 0;
    const avgVolatility = marketAssets.length
      ? marketAssets.reduce((sum, asset) => sum + Math.abs(asset.changePercent), 0) / marketAssets.length
      : 0;
    const liveCount = marketAssets.filter(asset => asset.dataQuality === "live").length;
    const breadth = marketAssets.length ? Math.round((positive / marketAssets.length) * 100) : 0;
    const riskLabel = avgVolatility >= 4 ? "High Vol" : avgVolatility >= 2 ? "Active" : "Orderly";
    const tone = avgMove >= 0 ? "text-success" : "text-danger";

    return {
      positive,
      negative,
      avgMove,
      avgVolatility,
      liveCount,
      breadth,
      riskLabel,
      tone
    };
  }, [marketAssets]);

  const greeting = useMemo(() => {
    const hour = now.getHours();
    const rotation = Math.floor((hour * 60 + now.getMinutes()) / 15);
    const marketTone = marketPulse.avgMove >= 0 ? "green tape" : "red tape";
    const breadthTone = marketPulse.breadth >= 60 ? "broad bid" : marketPulse.breadth <= 40 ? "thin breadth" : "mixed desk";

    const slots = [
      {
        match: hour >= 5 && hour < 11,
        title: "Good morning",
        lines: [
          `Coffee loaded. ${breadthTone} on the radar.`,
          `Fresh session, clean checklist, ${marketTone}.`,
          "The desk is awake. Time to make the charts behave."
        ]
      },
      {
        match: hour >= 11 && hour < 14,
        title: "Midday check-in",
        lines: [
          `Half-time read: ${marketPulse.riskLabel.toLowerCase()} regime.`,
          `Lunch break for humans, surveillance stays online.`,
          `${breadthTone} so far. Keep the trigger finger patient.`
        ]
      },
      {
        match: hour >= 14 && hour < 18,
        title: "Good afternoon",
        lines: [
          `Afternoon tape is live. ${marketTone} needs confirmation.`,
          "Power hour is getting closer. No sleepy entries.",
          `${marketPulse.breadth}% breadth. The dashboard has opinions.`
        ]
      },
      {
        match: hour >= 18 && hour < 23,
        title: "Good evening",
        lines: [
          "Evening mode: review the winners, forgive the charts.",
          `Post-session radar sees ${marketPulse.riskLabel.toLowerCase()} conditions.`,
          "Markets can rest. The watchlist is still taking notes."
        ]
      },
      {
        match: true,
        title: "Night watch",
        lines: [
          "Late desk online. Quiet room, loud signals.",
          "Night shift active. Futures probably know something.",
          `Low-light mode, ${marketPulse.riskLabel.toLowerCase()} tape.`
        ]
      }
    ];

    const activeSlot = slots.find(slot => slot.match) || slots[slots.length - 1];
    const line = activeSlot.lines[rotation % activeSlot.lines.length];
    const localTime = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    return {
      title: activeSlot.title,
      line,
      localTime
    };
  }, [marketPulse.avgMove, marketPulse.breadth, marketPulse.riskLabel, now]);

  const primaryMover = topMovers[0];

  return (
    <div className="space-y-6 lg:space-y-8" id="dashboard-view-root">
      {/* Search and Page Title Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 border-b border-border pb-5" id="dashboard-header">
        <div className="min-w-0">
          <h2 className="font-sans font-black text-3xl sm:text-4xl text-foreground tracking-tighter uppercase italic">{greeting.title}</h2>
          <p className="text-foreground/60 text-xs font-black uppercase tracking-wider mt-1">{greeting.line}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-primary">
              {greeting.localTime} local desk
            </span>
            <span className="rounded-md border border-border bg-card px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-muted-fg">
              Surveillance core // Active telemetry
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 w-full xl:w-auto">
          <div className="bg-card border border-border rounded-xl px-3 py-2 min-w-0 md:min-w-[132px]">
            <span className="text-[8px] font-black uppercase tracking-wider text-muted-fg flex items-center gap-1">
              <Database className="w-3 h-3" />
              Assets
            </span>
            <span className="font-mono text-sm font-black text-foreground">{marketAssets.length}</span>
          </div>
          <div className="bg-card border border-border rounded-xl px-3 py-2 min-w-0 md:min-w-[132px]">
            <span className="text-[8px] font-black uppercase tracking-wider text-muted-fg flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              Live Feed
            </span>
            <span className="font-mono text-sm font-black text-success">{marketPulse.liveCount}</span>
          </div>
          <div className="bg-card border border-border rounded-xl px-3 py-2 min-w-0 md:min-w-[132px]">
            <span className="text-[8px] font-black uppercase tracking-wider text-muted-fg flex items-center gap-1">
              <Gauge className="w-3 h-3" />
              Breadth
            </span>
            <span className="font-mono text-sm font-black text-foreground">{marketPulse.breadth}%</span>
          </div>
          <div className="bg-card border border-border rounded-xl px-3 py-2 min-w-0 md:min-w-[132px]">
            <span className="text-[8px] font-black uppercase tracking-wider text-muted-fg flex items-center gap-1">
              <Activity className="w-3 h-3" />
              Regime
            </span>
            <span className={`font-mono text-sm font-black ${marketPulse.tone}`}>{marketPulse.riskLabel}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)] gap-6" id="dashboard-market-pulse">
        <div className="bg-card border border-border rounded-xl p-5 shadow-lg shadow-black/5 dark:shadow-black/20">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-black uppercase tracking-wider text-foreground">Market Pulse</h3>
              </div>
              <p className="text-[10px] text-muted-fg font-bold uppercase tracking-wider mt-1">
                {marketPulse.positive} advancing / {marketPulse.negative} declining | average move {marketPulse.avgMove >= 0 ? "+" : ""}{marketPulse.avgMove.toFixed(2)}%
              </p>
            </div>
            <div className="w-full md:w-72">
              <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-muted-fg mb-1.5">
                <span>Risk breadth</span>
                <span>{marketPulse.breadth}% positive</span>
              </div>
              <div className="h-2.5 rounded-full bg-muted border border-border overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${marketPulse.breadth}%` }} />
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => primaryMover && onSelectTicker(primaryMover.symbol)}
          className="bg-card border border-border rounded-xl p-5 shadow-lg shadow-black/5 dark:shadow-black/20 text-left hover:border-primary hover:bg-muted transition-all cursor-pointer"
          disabled={!primaryMover}
          id="dashboard-primary-mover-action"
        >
          <span className="text-[9px] font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" />
            Primary opportunity
          </span>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="font-mono text-xl font-black text-foreground block">{primaryMover?.symbol || "N/A"}</span>
              <span className="text-[10px] font-bold text-muted-fg uppercase tracking-wider truncate block">{primaryMover?.name || "Waiting for live assets"}</span>
            </div>
            {primaryMover && (
              <span className={`font-mono text-xs font-black border border-border rounded-lg px-2 py-1 ${
                primaryMover.changePercent >= 0 ? "text-success bg-success/10" : "text-danger bg-danger/10"
              }`}>
                {primaryMover.changePercent >= 0 ? "+" : ""}{primaryMover.changePercent.toFixed(2)}%
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Live asset cards */}
      <div className={`grid grid-cols-1 md:grid-cols-3 ${topAssets.length === 4 ? 'lg:grid-cols-4' : ''} gap-6`} id="indices-ribbon">
        {topAssets.map((asset) => {
          const isUp = asset.changePercent >= 0;
          return (
            <div 
              key={asset.symbol}
              id={`asset-card-${asset.symbol}`}
              onClick={() => onViewAssetDetail && onViewAssetDetail(asset.symbol)}
              className="bg-card border border-border p-5 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 flex items-center justify-between cursor-pointer hover:border-primary transition-all hover:-translate-y-0.5"
            >
              <div className="min-w-0 w-full">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[10px] font-black text-foreground/40 tracking-wider uppercase block">{asset.symbol}</span>
                    <span className="text-[9px] font-bold text-muted-fg uppercase tracking-wider truncate block mt-0.5">{asset.name}</span>
                  </div>
                  <span className="text-[8px] font-black uppercase tracking-wider text-muted-fg border border-border rounded-lg px-1.5 py-0.5 shrink-0">
                    {asset.dataQuality || "feed"}
                  </span>
                </div>
                <span className="font-mono font-black text-2xl text-foreground mt-1 block">
                  {formatMoney(asset.price, asset.currencySymbol || "$")}
                </span>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-0.5 border border-border rounded-xl ${
                    isUp ? "text-success bg-success/10" : "text-danger bg-danger/10"
                  }`}>
                    {isUp ? <ArrowUpRight className="w-3" /> : <ArrowDownRight className="w-3" />}
                    {isUp ? "+" : ""}{asset.changePercent.toFixed(2)}%
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-wider text-primary inline-flex items-center gap-1">
                    Inspect <Eye className="w-3 h-3" />
                  </span>
                </div>
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
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* AI Market Insight Card */}
            <div className="bg-card border border-border border-l-4 border-l-primary p-6 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 flex flex-col h-full" id="ai-market-insight-card">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1 px-1.5 bg-primary border border-border text-primary-fg">
                  <Sparkles className="w-4 h-4 fill-current" />
                </div>
                <h3 className="font-black text-foreground text-xs uppercase tracking-wider">AI Core Market Insight</h3>
              </div>
              
              {marketSentiment ? (
                <div className="flex flex-col gap-6 mt-4 flex-1">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-black text-3xl font-mono">{marketSentiment.score}/100</span>
                      <span className={`px-2 py-1 text-xs font-black uppercase rounded ${
                        marketSentiment.label === 'Bullish' ? 'bg-success/20 text-success' :
                        marketSentiment.label === 'Bearish' ? 'bg-danger/20 text-danger' :
                        'bg-muted text-muted-fg'
                      }`}>
                        {marketSentiment.label}
                      </span>
                    </div>
                    <p className="text-foreground/80 text-sm leading-relaxed font-semibold italic">"{marketSentiment.summary}"</p>
                  </div>
                  <div className="flex items-center gap-3 mt-auto">
                    <button 
                      onClick={() => onSelectTicker(marketAssets[0]?.symbol || "AAPL")} 
                      className="bg-primary text-primary-fg text-xs font-black uppercase tracking-wider px-4 py-2.5 border border-border hover:bg-accent hover:text-foreground shadow-lg shadow-black/5 dark:shadow-black/20 active:translate-y-0.5 transition-all cursor-pointer whitespace-nowrap"
                    >
                      Deep Dive
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-foreground/80 text-sm leading-relaxed font-semibold flex-1" id="dashboard-ai-summary-text">
                    Select a live asset from your watchlist to generate an AI analysis using the latest data currently loaded from your providers.
                  </p>

                  <div className="flex items-center gap-3 mt-4 mt-auto">
                    <button 
                      onClick={() => onSelectTicker(marketAssets[0]?.symbol || "AAPL")} 
                      className="bg-primary text-primary-fg text-xs font-black uppercase tracking-wider px-4 py-2.5 border border-border hover:bg-accent hover:text-foreground shadow-lg shadow-black/5 dark:shadow-black/20 active:translate-y-0.5 transition-all cursor-pointer"
                    >
                      Deep Dive
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Fear and Greed Index Card */}
            <div className="bg-card border border-border border-l-4 border-l-[#FFD600] p-6 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 flex flex-col h-full">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1 px-1.5 bg-[#FFD600] border border-border text-black">
                  <Activity className="w-4 h-4 fill-current" />
                </div>
                <h3 className="font-black text-foreground text-xs uppercase tracking-wider">Fear & Greed Index</h3>
              </div>
              
              <div className="flex flex-col gap-6 mt-4 flex-1 justify-center">
                {fearAndGreed ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="font-black text-5xl font-mono">{fearAndGreed.value}</span>
                      <div className="text-right">
                        <span className={`px-3 py-1.5 text-xs font-black uppercase border border-border block ${
                          Number(fearAndGreed.value) <= 25 ? "bg-danger/20 text-danger" :
                          Number(fearAndGreed.value) <= 45 ? "bg-orange-500/20 text-orange-500" :
                          Number(fearAndGreed.value) <= 55 ? "bg-muted text-muted-fg" :
                          Number(fearAndGreed.value) <= 75 ? "bg-success/20 text-success" :
                          "bg-primary/20 text-primary"
                        }`}>
                          {fearAndGreed.classification}
                        </span>
                      </div>
                    </div>
                    
                    <div className="w-full h-2 bg-border rounded-full overflow-hidden mt-4">
                      <div 
                        className="h-full transition-all duration-1000 ease-out"
                        style={{ 
                          width: `${fearAndGreed.value}%`,
                          backgroundColor: Number(fearAndGreed.value) <= 45 ? 'var(--color-danger)' : 
                                         Number(fearAndGreed.value) <= 55 ? 'var(--color-muted-fg)' : 
                                         'var(--color-success)'
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-[10px] font-black uppercase text-muted-fg">
                      <span>Extreme Fear (0)</span>
                      <span>Extreme Greed (100)</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center flex-1">
                    <Activity className="w-6 h-6 animate-pulse text-muted-fg" />
                  </div>
                )}
              </div>
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

                <div className="flex items-center gap-2 border border-border px-3 py-1.5 bg-card">
                  <Activity className="w-3.5 h-3.5 text-muted-fg" />
                  <span className="text-xs font-black uppercase text-muted-fg">Vol:</span>
                  <input 
                    type="number"
                    value={volatilityFilter}
                    onChange={e => setVolatilityFilter(Number(e.target.value))}
                    className="w-12 bg-transparent text-xs font-black text-foreground outline-none text-right"
                    min="0"
                    step="0.1"
                  />
                  <span className="text-xs font-black uppercase text-muted-fg">%</span>
                </div>

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
                        className={`hover:bg-muted transition-colors ${isDragging ? "opacity-50 bg-muted" : ""} ${isDragOver ? "border-t-2 border-primary" : ""}`}
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
                              className="font-mono font-black text-sm bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-transparent hover:opacity-80 uppercase block text-left cursor-pointer"
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
                              {formatMoney(item.price, item.currencySymbol || "$")}
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
                            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 text-xs text-foreground ml-9 min-w-[760px] xl:min-w-0">
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 xl:gap-8">
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
                    <Sparkles className="w-4 h-4 fill-current text-primary" />
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
                    <RefreshCw className="w-4 h-4 animate-spin text-primary" />
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
                  <button
                    key={mover.symbol}
                    onClick={() => onSelectTicker(mover.symbol)}
                    className="w-full flex items-center justify-between flex-row border-b border-border/5 pb-2 last:border-border last:pb-0 hover:bg-muted/50 rounded-lg px-2 py-1.5 transition-colors text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      {mover.logo ? (
                        <div className="w-8 h-8 rounded-full border border-border bg-card flex items-center justify-center overflow-hidden shadow-lg shadow-black/5 dark:shadow-black/20 shrink-0">
                          <img src={mover.logo} alt={mover.symbol} className="w-6 h-6 object-contain" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full border border-border bg-primary/10 text-primary flex items-center justify-center overflow-hidden shadow-lg shadow-black/5 dark:shadow-black/20 shrink-0 font-black text-xs">
                          {mover.symbol.charAt(0)}
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
                  </button>
                );
              })}
            </div>
          </div>

          {/* Latest News widget */}
          <div className="bg-card border border-border p-6 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 flex flex-col justify-between" id="latest-news-panel">
            <div>
              <h3 className="font-sans font-black text-sm uppercase tracking-wider text-foreground mb-4 flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-primary" />
                <span>Latest News</span>
              </h3>

              <div className="space-y-2.5">
                {newsLoading ? (
                  <div className="flex justify-center p-4">
                    <RefreshCw className="w-4 h-4 animate-spin text-foreground/50" />
                  </div>
                ) : latestNews.length > 0 ? (
                  latestNews.slice(0, 4).map((item, i) => (
                    <div
                      key={item.id || i}
                      className="block p-3 border border-border bg-background hover:bg-muted/50 hover:translate-y-[-1px] transition-all cursor-pointer group"
                    >
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[8px] font-black uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5">{item.source}</span>
                        <span className="text-[9px] font-bold text-foreground/40 uppercase tracking-widest inline-flex items-center gap-1">
                          <Clock3 className="w-3 h-3" />
                          {new Date(item.datetime * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2 block"
                      >
                        {item.headline}
                      </a>
                      <button
                        type="button"
                        onClick={() => handleSummarizeNews({
                          title: item.headline,
                          source: item.source,
                          symbol: marketAssets[0]?.symbol
                        })}
                        className="mt-2 inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-primary hover:text-foreground cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3 fill-current" />
                        AI brief
                      </button>
                    </div>
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

