import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, 
  TrendingDown, 
  Search, 
  MapPin, 
  Activity, 
  Sparkles, 
  FileText, 
  ArrowUpRight, 
  ArrowDownRight,
  ChevronRight,
  Globe,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  BrainCircuit,
  Info
} from "lucide-react";
import { MarketAsset, MacroAnalysisReport } from "../types";
import { useSettings } from "../SettingsContext";

interface MarketAnalysisProps {
  marketAssets: MarketAsset[];
  onSelectTicker: (ticker: string) => void;
  onViewAssetDetail?: (symbol: string) => void;
  onAddWatchlist: (asset: MarketAsset) => void;
  onAssetAdded?: (asset: MarketAsset) => void;
  watchlistSymbols: string[];
}

type AssetSearchResult = {
  symbol: string;
  name: string;
  category: MarketAsset["category"];
  currencySymbol?: string;
  provider?: string;
  alreadyTracked?: boolean;
  dataQuality?: MarketAsset["dataQuality"];
};

async function readApiJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const rawText = await response.text();
  const trimmed = rawText.trim();

  if (!trimmed) {
    throw new Error(fallbackMessage);
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    if (trimmed.startsWith("<")) {
      throw new Error("API route is not ready. Restart the dev server to load the latest backend routes.");
    }
    throw new Error(trimmed.slice(0, 180) || fallbackMessage);
  }
}

const DOMAIN_MAP: Record<string, string> = {
  AAPL: "apple.com",
  MSFT: "microsoft.com",
  NVDA: "nvidia.com",
  GOOGL: "abc.xyz",
  GOOG: "abc.xyz",
  AMZN: "amazon.com",
  META: "meta.com",
  TSLA: "tesla.com",
  AMD: "amd.com",
  INTC: "intel.com",
  NFLX: "netflix.com",
  DIS: "thewaltdisneycompany.com",
  JPM: "jpmorganchase.com",
  V: "visa.com",
  MA: "mastercard.com",
  PYPL: "paypal.com",
  BRK: "berkshirehathaway.com",
  JNJ: "jnj.com",
  UNH: "unitedhealthgroup.com",
  WMT: "walmart.com",
  XOM: "exxonmobil.com",
  SPY: "spdrs.com",
  QQQ: "invesco.com",
  ARKK: "ark-funds.com",
  VIX: "cboe.com"
};

const AssetLogo = ({ symbol, category }: { symbol: string; category: string }) => {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  let url = "";
  if (category === "Crypto") {
    url = `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`;
  } else if (DOMAIN_MAP[symbol]) {
    url = `https://www.google.com/s2/favicons?sz=64&domain=${DOMAIN_MAP[symbol]}`;
  }

  if (imgError || !url) {
    return (
      <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs shrink-0 border border-primary/10 shadow-sm">
        {symbol.charAt(0)}
      </div>
    );
  }

  return (
    <div className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center shrink-0 overflow-hidden shadow-sm relative">
      {!imgLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
          <span className="text-[10px] font-bold text-muted-fg animate-pulse">{symbol.charAt(0)}</span>
        </div>
      )}
      <img 
        src={url} 
        alt={symbol} 
        className={`w-5 h-5 object-contain transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setImgLoaded(true)}
        onError={() => setImgError(true)}
      />
    </div>
  );
};

export default function MarketAnalysisView({
  marketAssets,
  onSelectTicker,
  onViewAssetDetail,
  onAddWatchlist,
  onAssetAdded,
  watchlistSymbols
}: MarketAnalysisProps) {
  const { language, formatMoney } = useSettings();
  const [selectedCategory, setSelectedCategory] = useState<"All" | "Vietnam" | "US" | "Crypto" | "ETFs">("All");
  const [activeSubFilter, setActiveSubFilter] = useState<"All" | "Gainers" | "Losers" | "Volume">("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAnalystTake, setShowAnalystTake] = useState(false);
  const [fullReportLoading, setFullReportLoading] = useState(false);
  const [macroReport, setMacroReport] = useState<MacroAnalysisReport | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);
  const [isAdding, setIsAdding] = useState(false);
  const [assetSearchResults, setAssetSearchResults] = useState<AssetSearchResult[]>([]);
  const [isSearchingAssets, setIsSearchingAssets] = useState(false);
  const [assetSearchError, setAssetSearchError] = useState<string | null>(null);

  const [sparklineData, setSparklineData] = useState<Record<string, number[]>>({});

  useEffect(() => {
    const symbolsToFetch = marketAssets.map(a => a.symbol).filter(sym => !sparklineData[sym]);
    if (symbolsToFetch.length === 0) return;

    const fetchSparklines = async () => {
      const results = await Promise.all(
        symbolsToFetch.map(async (symbol) => {
          try {
            const res = await fetch(`/api/historical-data/${symbol}?range=1M`);
            if (res.ok) {
              const json = await res.json();
              const prices = json.data?.map((d: any) => d.price) || [];
              return { symbol, prices };
            }
          } catch (e) {}
          return { symbol, prices: [] };
        })
      );
      setSparklineData(prev => {
        const next = { ...prev };
        results.forEach(r => {
          if (r.prices.length > 0) next[r.symbol] = r.prices;
        });
        return next;
      });
    };
    fetchSparklines();
  }, [marketAssets]);

  const topGainer = useMemo(() => [...marketAssets].sort((a, b) => b.changePercent - a.changePercent)[0], [marketAssets]);
  const topLoser = useMemo(() => [...marketAssets].sort((a, b) => a.changePercent - b.changePercent)[0], [marketAssets]);
  const mostActive = useMemo(() => {
    const parseVol = (volStr: string) => {
      let num = parseFloat(volStr.replace(/[^0-9.]/g, ''));
      if (volStr.includes('M')) num *= 1000000;
      if (volStr.includes('B')) num *= 1000000000;
      if (volStr.includes('K')) num *= 1000;
      return num;
    };
    return [...marketAssets].sort((a, b) => parseVol(b.volume) - parseVol(a.volume))[0];
  }, [marketAssets]);

  const renderSparkline = (isPositive: boolean, symbol: string) => {
    const realData = sparklineData[symbol];
    let points = [];
    
    if (realData && realData.length > 1) {
      const minPrice = Math.min(...realData);
      const maxPrice = Math.max(...realData);
      const range = maxPrice - minPrice || 1;
      
      points = realData.map((price, idx) => {
        const x = (idx / (realData.length - 1)) * 100;
        const normalizedY = 28 - ((price - minPrice) / range) * 26;
        return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${normalizedY.toFixed(1)}`;
      });
    } else {
      let hash = 0;
      for (let i = 0; i < symbol.length; i++) hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
      
      let currentY = isPositive ? 25 : 5;
      points.push(`M0,${currentY}`);
      
      for (let i = 1; i <= 10; i++) {
        const x = i * 10;
        const jump = (((Math.abs(hash) * i) % 15) - 7);
        currentY = Math.max(2, Math.min(28, currentY + jump));
        
        if (i > 7) {
          if (isPositive) currentY = Math.max(2, currentY - 4);
          else currentY = Math.min(28, currentY + 4);
        }
        points.push(`L${x},${currentY}`);
      }
    }

    return (
      <svg viewBox="0 0 100 30" className="w-16 h-6 overflow-visible opacity-80" preserveAspectRatio="none">
        <path
          d={points.join(" ")}
          fill="none"
          stroke={isPositive ? "#10b981" : "#f43f5e"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="drop-shadow-sm"
        />
      </svg>
    );
  };

  const handleAddTicker = async (result?: AssetSearchResult) => {
    const symbolToAdd = result?.symbol || searchQuery.toUpperCase().trim();
    if (!symbolToAdd) return;
    setIsAdding(true);
    try {
      const res = await fetch("/api/assets/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbolToAdd,
          name: result?.name,
          category: result?.category
        })
      });
      const data = await readApiJson<{ asset: MarketAsset; error?: string }>(res, "Failed to add ticker");
      if (res.ok) {
        onAssetAdded?.(data.asset);
        setSelectedCategory("All");
        setActiveSubFilter("All");
        setVisibleCount(10);
        setAssetSearchError(null);
        setSearchQuery("");
        setAssetSearchResults([]);
      } else {
        alert(data.error || "Failed to add ticker");
      }
    } catch (e: any) {
      alert("Error adding ticker: " + e.message);
    } finally {
      setIsAdding(false);
    }
  };

  // Reset pagination when category or search changes
  useEffect(() => {
    setVisibleCount(10);
  }, [selectedCategory, searchQuery, activeSubFilter]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setAssetSearchResults([]);
      setAssetSearchError(null);
      setIsSearchingAssets(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSearchingAssets(true);
      setAssetSearchError(null);

      try {
        const response = await fetch(`/api/assets/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal
        });
        const data = await readApiJson<{ results?: AssetSearchResult[]; error?: string }>(
          response,
          "Asset search failed"
        );
        if (!response.ok) {
          throw new Error(data.error || "Asset search failed");
        }
        setAssetSearchResults(Array.isArray(data.results) ? data.results : []);
      } catch (error: any) {
        if (error.name !== "AbortError") {
          setAssetSearchError(error.message || "Asset search failed");
          setAssetSearchResults([]);
        }
      } finally {
        setIsSearchingAssets(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [searchQuery]);

  // Filter list
  const filteredAssets = useMemo(() => {
    let list = [...marketAssets];

    // Category filter
    if (selectedCategory !== "All") {
      list = list.filter(item => item.category === selectedCategory);
    }

    // Search filter
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      list = list.filter(item => 
        item.symbol.toLowerCase().includes(q) || 
        item.name.toLowerCase().includes(q)
      );
    }

    // Sub filters (Gainers, Losers, Volume)
    if (activeSubFilter === "Gainers") {
      list = list.filter(item => item.changePercent > 0).sort((a, b) => b.changePercent - a.changePercent);
    } else if (activeSubFilter === "Losers") {
      list = list.filter(item => item.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent);
    } else if (activeSubFilter === "Volume") {
      // sort by volume suffix or standard sorted values (simulated)
      list = list.sort((a, b) => b.price - a.price);
    }

    return list;
  }, [activeSubFilter, marketAssets, searchQuery, selectedCategory]);

  const tickerBarAssets = marketAssets.slice(0, 6);
  const categorySummaries = useMemo(() => (["US", "Crypto", "ETFs"] as const)
    .map((category) => {
      const assets = marketAssets.filter(asset => asset.category === category);
      const averageChange = assets.length > 0
        ? assets.reduce((sum, asset) => sum + asset.changePercent, 0) / assets.length
        : 0;

      return { category, count: assets.length, averageChange };
    })
    .filter(summary => summary.count > 0), [marketAssets]);

  // Highlight tickers from search
  const handleGenerateReport = async () => {
    setFullReportLoading(true);
    try {
      const statsPayload = {
        totalAssets: marketAssets.length,
        positiveAssets: marketAssets.filter(asset => asset.changePercent >= 0).length,
        groups: categorySummaries.map(s => ({ category: s.category, count: s.count, avgChange: s.averageChange }))
      };
      const response = await fetch("/api/macro-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stats: statsPayload, language })
      });
      const data = await response.json();
      setMacroReport(data);
    } catch (e) {
      setMacroReport({
        macroTrend: "Mixed",
        keyObservations: ["Unable to connect to the macro inference engine."],
        actionableStrategy: "Retry the connection or rely on raw surveillance data."
      });
    } finally {
      setFullReportLoading(false);
    }
  };

  return (
    <div className="space-y-6 lg:space-y-8" id="market-analysis-root">
      
      {/* Main Title Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5" id="market-title-header">
        <div className="min-w-0">
          <h2 className="font-sans font-black text-3xl sm:text-4xl text-foreground uppercase tracking-tighter italic">Market Analysis</h2>
          <p className="text-foreground/60 text-xs font-black uppercase tracking-wider mt-1">Real-time surveillance of global equities and digital assets.</p>
        </div>
        
        {/* Search Input element */}
        <div className="relative max-w-md w-full" id="search-input-wrapper">
          <Search className="w-4 h-4 text-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search markets or symbols..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-card border border-border pl-10 pr-4 py-2.5 rounded-xl text-xs font-semibold text-foreground placeholder:text-muted-fg dark:placeholder:text-foreground/55 focus:outline-none shadow-lg shadow-black/5 dark:shadow-black/20 focus:shadow-lg shadow-black/5 dark:shadow-black/20 transition-all"
          />
          {searchQuery.trim() && (
            <div className="absolute top-full right-0 mt-2 w-full bg-card border border-border rounded-xl shadow-2xl shadow-black/20 overflow-hidden z-50">
              <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
                <span className="text-[9px] font-black uppercase tracking-wider text-muted-fg">
                  {isSearchingAssets ? "Searching provider..." : "Search directory"}
                </span>
                {assetSearchError && (
                  <span className="text-[9px] font-bold text-danger truncate">{assetSearchError}</span>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {assetSearchResults.length > 0 ? assetSearchResults.map((result) => {
                  const isLoaded = marketAssets.some(asset => asset.symbol === result.symbol);
                  const actionLabel = isLoaded ? "Open" : result.alreadyTracked ? "Sync" : "Add";
                  return (
                    <button
                      key={`${result.provider}-${result.symbol}`}
                      onClick={() => isLoaded ? onSelectTicker(result.symbol) : handleAddTicker(result)}
                      disabled={isAdding}
                      className="w-full px-3 py-3 flex items-center justify-between gap-3 text-left hover:bg-muted border-b border-border last:border-b-0 disabled:opacity-60 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-black text-foreground">{result.symbol}</span>
                          <span className="text-[8px] font-black uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                            {result.category}
                          </span>
                        </div>
                        <span className="block text-[10px] font-semibold text-muted-fg truncate mt-0.5">
                          {result.name}
                        </span>
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-muted-fg shrink-0">
                        {actionLabel}
                      </span>
                    </button>
                  );
                }) : (
                  <div className="px-3 py-4 text-center">
                    <p className="text-[10px] text-muted-fg font-bold uppercase tracking-wider">
                      No directory hit. Add exact symbol manually.
                    </p>
                    <button
                      onClick={() => handleAddTicker()}
                      disabled={isAdding}
                      className="mt-3 px-4 py-2 rounded-xl bg-primary text-primary-fg border border-border text-[10px] font-black uppercase disabled:opacity-60 cursor-pointer"
                    >
                      {isAdding ? "Adding..." : `Add ${searchQuery.toUpperCase().trim()}`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Highlight Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {topGainer && (
          <div className="bg-card border border-border p-5 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black text-muted-fg uppercase tracking-widest block mb-2">Top Gainer</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xl font-black text-foreground">{topGainer.symbol}</span>
                <span className="text-xs font-black text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-500/20">+{topGainer.changePercent.toFixed(2)}%</span>
              </div>
              <span className="text-[11px] text-muted-fg font-mono font-bold mt-1 block">{formatMoney(topGainer.price, topGainer.currencySymbol || "$")}</span>
            </div>
            {renderSparkline(true, topGainer.symbol)}
          </div>
        )}
        {topLoser && (
          <div className="bg-card border border-border p-5 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black text-muted-fg uppercase tracking-widest block mb-2">Top Loser</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xl font-black text-foreground">{topLoser.symbol}</span>
                <span className="text-xs font-black text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded-md border border-rose-500/20">{topLoser.changePercent.toFixed(2)}%</span>
              </div>
              <span className="text-[11px] text-muted-fg font-mono font-bold mt-1 block">{formatMoney(topLoser.price, topLoser.currencySymbol || "$")}</span>
            </div>
            {renderSparkline(false, topLoser.symbol)}
          </div>
        )}
        {mostActive && (
          <div className="bg-card border border-border p-5 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black text-muted-fg uppercase tracking-widest block mb-2">Volume Leader</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xl font-black text-foreground">{mostActive.symbol}</span>
                <span className="text-xs font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded-md border border-primary/20">{mostActive.volume}</span>
              </div>
              <span className="text-[11px] text-muted-fg font-mono font-bold mt-1 block">{formatMoney(mostActive.price, mostActive.currencySymbol || "$")}</span>
            </div>
            <div className="flex items-center justify-end w-16 opacity-80">
              {renderSparkline(mostActive.changePercent >= 0, mostActive.symbol)}
            </div>
          </div>
        )}
      </div>

      {/* Body: Two-column grid layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="market-body-grid">
        
        {/* Main assets table column (2 spans) */}
        <div className="lg:col-span-2 space-y-6" id="assets-table-section">
          
          {/* Category Chips and Sub-filters card */}
          <div className="bg-card border border-border p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg shadow-black/5 dark:shadow-black/20" id="filters-container-card">
            
            {/* Left category tags */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5" id="category-chips">
              {(["All", "US", "Crypto", "ETFs"] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-2 border rounded-xl text-[10px] tracking-wider font-black uppercase transition-all shrink-0 cursor-pointer ${
                    selectedCategory === cat
                      ? "bg-primary text-primary-fg border-border shadow-lg shadow-black/5 dark:shadow-black/20"
                      : "bg-card text-foreground border-border/10 hover:border-border hover:bg-accent"
                  }`}
                >
                  {cat === "All" ? "All Targets" : cat}
                </button>
              ))}
            </div>

            {/* Right sub-filter selection chips */}
            <div className="flex items-center gap-1 border-l-2 border-border/10 pl-3 h-full" id="sub-filter-chips">
              <button 
                onClick={() => setActiveSubFilter("All")}
                className={`px-3 py-1.5 rounded-xl text-[10px] uppercase font-black ${
                  activeSubFilter === "All" ? "bg-card border border-border text-[#FFD600]" : "text-foreground/50 hover:text-foreground"
                }`}
              >
                All
              </button>
              <button 
                onClick={() => setActiveSubFilter("Gainers")}
                className={`px-3 py-1.5 border rounded-xl text-[10px] uppercase font-black inline-flex items-center gap-0.5 ${
                  activeSubFilter === "Gainers" ? "bg-success/20 border-border text-foreground" : "border-transparent text-foreground/50 hover:text-foreground"
                }`}
              >
                <TrendingUp className="w-3" />
                <span>Gainers</span>
              </button>
              <button 
                onClick={() => setActiveSubFilter("Losers")}
                className={`px-3 py-1.5 border rounded-xl text-[10px] uppercase font-black inline-flex items-center gap-0.5 ${
                  activeSubFilter === "Losers" ? "bg-card border border-border border-border text-primary-fg" : "border-transparent text-foreground/50 hover:text-foreground"
                }`}
              >
                <TrendingDown className="w-3" />
                <span>Losers</span>
              </button>
            </div>
          </div>

          {/* Table representing Screen 3 */}
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-lg shadow-black/5 dark:shadow-black/20" id="market-assets-grid">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[750px] text-left border-collapse" id="market-analysis-table">
                <thead>
                  <tr className="bg-card text-foreground/60 font-black uppercase text-[10px] tracking-widest border-b border-border">
                    <th className="px-4 py-3">Symbol</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-right">Change %</th>
                    <th className="px-4 py-3 text-center">Trend</th>
                    <th className="px-4 py-3 text-right">Volume</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {filteredAssets.slice(0, visibleCount).map((asset, idx) => {
                    const isPositive = asset.changePercent >= 0;
                    
                    // Zebra stripe calculation
                    const bgClass = idx % 2 === 0 ? "bg-card" : "bg-muted/50";
                    const isInWatchlist = watchlistSymbols.includes(asset.symbol);

                    return (
                      <tr key={asset.symbol} className={`${bgClass} hover:bg-accent/10 transition-colors group`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <AssetLogo symbol={asset.symbol} category={asset.category} />
                            <div>
                              <div className="font-bold text-foreground font-mono text-sm flex items-center gap-2">
                                {asset.symbol}
                                {asset.category === "Crypto" && <span className="px-1.5 py-0.5 rounded text-[8px] bg-accent/20 text-accent uppercase font-sans">CRYPTO</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-black uppercase text-foreground/80">{asset.name}</td>
                        
                        {/* Cost styled with JetBrains Mono */}
                        <td className="px-4 py-3 text-right font-mono text-sm text-foreground font-bold">
                          {formatMoney(asset.price, asset.currencySymbol || "$")}
                        </td>

                        {/* PRICE INDICATORS: soft-tinted backgrounds for better legibility */}
                        <td className="px-4 py-3 text-right">
                          <span className={`inline-flex items-center gap-0.5 font-black text-xs px-2.5 py-1 border rounded-xl ${
                            isPositive 
                              ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" 
                              : "text-rose-400 bg-rose-400/10 border-rose-400/20"
                          }`}>
                            {isPositive ? "+" : ""}{asset.changePercent}%
                          </span>
                        </td>
                        
                        <td className="px-4 py-3 text-center">
                          {renderSparkline(isPositive, asset.symbol)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-foreground/60 font-bold">{asset.volume}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => onSelectTicker(asset.symbol)}
                              className="p-2 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent transition-colors"
                              title="AI Predict"
                            >
                              <BrainCircuit className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => onViewAssetDetail && onViewAssetDetail(asset.symbol)}
                              className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                              title="Details"
                            >
                              <Info className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => onAddWatchlist(asset)}
                              className={`p-2 rounded-lg transition-all ${
                                isInWatchlist ? "bg-[#FFD600]/20 text-[#FFD600] hover:bg-[#FFD600]/30" : "bg-card border border-border text-foreground hover:border-primary"
                              }`}
                              title={isInWatchlist ? "Tracked" : "Track"}
                            >
                              ★
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredAssets.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-foreground/40 text-xs font-black uppercase">
                        <div className="mb-4">No targets match current filters or search query.</div>
                        {searchQuery && (
                          <button
                            onClick={() => handleAddTicker()}
                            disabled={isAdding}
                            className="bg-primary text-primary-fg px-4 py-2 rounded font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                          >
                            {isAdding ? "Adding..." : `Add '${searchQuery.toUpperCase()}' to Tracker`}
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {filteredAssets.length > visibleCount && (
              <div 
                onClick={() => setVisibleCount(v => v + 10)}
                className="p-4 border-t border-border text-center bg-background text-xs font-black uppercase tracking-wider text-foreground hover:bg-card hover:text-primary transition-colors cursor-pointer"
              >
                Load More (+10)
              </div>
            )}
          </div>
        </div>

        {/* Right Widgets Column (1 span) */}
        <div className="space-y-6" id="analysis-right-sidebar">
          
          {/* AI Sector Insight */}
          <div className="bg-card border border-border p-6 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 relative" id="ai-sector-insight-card">
            <div className="flex items-center justify-between mb-4 border-b border-border/10 pb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 fill-current text-primary" />
                <h3 className="font-black text-xs text-foreground uppercase tracking-wider">AI Sector Insights</h3>
              </div>
            </div>

            {/* AI Macro Strategy Content */}
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black text-muted-fg uppercase tracking-widest">Market Sentiment</span>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${
                    macroReport?.macroTrend === 'Bullish' ? 'text-emerald-500' :
                    macroReport?.macroTrend === 'Bearish' ? 'text-rose-500' :
                    macroReport?.macroTrend === 'Mixed' ? 'text-[#FFD600]' : 'text-muted-fg'
                  }`}>
                    {macroReport ? macroReport.macroTrend : "Awaiting Data"}
                  </span>
                </div>
                
                {/* Sentiment Bar */}
                <div className="h-1.5 w-full bg-border rounded-full overflow-hidden flex">
                  <div className="h-full bg-rose-500 transition-all duration-1000" style={{ width: macroReport?.macroTrend === 'Bearish' ? '70%' : macroReport?.macroTrend === 'Mixed' ? '30%' : macroReport?.macroTrend === 'Bullish' ? '10%' : '0%' }} />
                  <div className="h-full bg-[#FFD600] transition-all duration-1000" style={{ width: macroReport?.macroTrend === 'Bearish' ? '20%' : macroReport?.macroTrend === 'Mixed' ? '40%' : macroReport?.macroTrend === 'Bullish' ? '20%' : '0%' }} />
                  <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: macroReport?.macroTrend === 'Bearish' ? '10%' : macroReport?.macroTrend === 'Mixed' ? '30%' : macroReport?.macroTrend === 'Bullish' ? '70%' : '0%' }} />
                </div>
              </div>

              {macroReport ? (
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] font-black text-muted-fg block tracking-wider uppercase mb-3">Key Observations</span>
                    <ul className="space-y-3">
                      {macroReport.keyObservations?.map((obs, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-[11px] text-foreground font-semibold leading-relaxed font-sans bg-muted/50 p-3 rounded-lg border border-border">
                          <Activity className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                          <span>{obs}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <BrainCircuit className="w-4 h-4 text-primary" />
                      <span className="text-[10px] font-black text-primary uppercase tracking-wider">Actionable Strategy</span>
                    </div>
                    <p className="text-[11px] text-foreground font-bold leading-relaxed font-sans">
                      {macroReport.actionableStrategy}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center border border-dashed border-border rounded-xl">
                  <Activity className="w-8 h-8 text-muted-fg opacity-20 mx-auto mb-3" />
                  <p className="text-[10px] text-muted-fg font-black uppercase tracking-wider">Run crawler to generate<br/>macro strategy report</p>
                </div>
              )}

              <button 
                onClick={handleGenerateReport}
                disabled={fullReportLoading}
                className="w-full py-3 bg-primary hover:bg-card border border-border text-primary-fg hover:text-primary text-xs font-black uppercase tracking-wider shadow-lg shadow-black/5 dark:shadow-black/20 hover:shadow-none transition-all cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl"
              >
                {fullReportLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Globe className="w-4 h-4" />
                )}
                <span>{macroReport ? "Update Strategy Report" : "Run Macro AI Crawler"}</span>
              </button>
            </div>
          </div>

          {/* Analyst Take card */}
          <div className="bg-card border border-border p-6 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20" id="analyst-take-card">
            <h3 className="font-sans font-black text-xs uppercase tracking-wider text-foreground mb-2.5">EQUITY ANALYST BRIEF</h3>
            <p className="text-foreground/80 text-xs leading-relaxed font-sans font-semibold">
              Generate a fresh brief from your configured AI provider and live market data.
            </p>
            <button 
              onClick={() => setShowAnalystTake(true)}
              className="mt-3.5 inline-flex items-center gap-1 text-xs text-primary hover:text-foreground font-black uppercase tracking-wider cursor-pointer"
            >
              <span>Read analysis</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Provider coverage panel */}
          <div className="bg-card border border-border p-6 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 relative overflow-hidden" id="geographic-trends-card">
            <div className="flex items-center justify-between mb-3 border-b border-border/10 pb-2">
              <h3 className="font-sans font-black text-xs uppercase tracking-wider text-foreground">Provider Coverage</h3>
              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-foreground bg-accent border border-border px-1.5 py-0.5 rounded-xl animate-pulse">
                LIVE ONLY
              </span>
            </div>

            <div className="w-full bg-background rounded-xl border border-border/10 p-4" id="provider-coverage-panel">
              <div className="space-y-2">
                {Array.from(new Set(marketAssets.map(asset => asset.provider || "provider"))).map(provider => (
                  <div key={provider} className="flex items-center justify-between text-xs font-black uppercase">
                    <span>{provider}</span>
                    <span className="font-mono">{marketAssets.filter(asset => (asset.provider || "provider") === provider).length}</span>
                  </div>
                ))}
                {marketAssets.length === 0 && (
                  <span className="text-xs font-semibold text-foreground/50">No live provider data loaded.</span>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Analyst take detailed dialog */}
      {showAnalystTake && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-card border border-border/60 backdrop-blur-xs p-4" onClick={() => setShowAnalystTake(false)}>
          <div 
            className="bg-card rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 w-full max-w-lg overflow-hidden border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-border bg-accent flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-foreground">
                <Globe className="w-4 h-4 text-foreground" />
                <h3 className="font-sans font-black text-xs uppercase tracking-wider">TECH SECTOR & REGIONAL MACRO REPORT</h3>
              </div>
              <button onClick={() => setShowAnalystTake(false)} className="text-foreground hover:text-danger text-sm font-black">✕</button>
            </div>
            <div className="p-6 space-y-4 text-xs text-foreground font-semibold leading-relaxed font-sans">
              <p>
                This briefing panel no longer ships with prefilled analysis. Run a fresh report from the market screen to generate content from the configured AI provider.
              </p>
              <button 
                onClick={() => setShowAnalystTake(false)}
                className="w-full bg-primary text-primary-fg hover:bg-card border border-border py-2.5 rounded-xl border border-border text-xs font-black uppercase tracking-wider transition-colors shadow-lg shadow-black/5 dark:shadow-black/20"
              >
                Close Institutional Briefing
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
