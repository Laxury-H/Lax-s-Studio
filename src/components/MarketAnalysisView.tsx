import { useState } from "react";
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
  RefreshCw
} from "lucide-react";
import { MarketAsset } from "../types";
import { MARKET_ASSETS, TRENDING_SECTORS } from "../data";

interface MarketAnalysisProps {
  marketAssets: MarketAsset[];
  onSelectTicker: (ticker: string) => void;
  onAddWatchlist: (asset: MarketAsset) => void;
  watchlistSymbols: string[];
}

export default function MarketAnalysisView({
  marketAssets,
  onSelectTicker,
  onAddWatchlist,
  watchlistSymbols
}: MarketAnalysisProps) {
  const [selectedCategory, setSelectedCategory] = useState<"All" | "Vietnam" | "US" | "Crypto" | "ETFs">("All");
  const [activeSubFilter, setActiveSubFilter] = useState<"All" | "Gainers" | "Losers" | "Volume">("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAnalystTake, setShowAnalystTake] = useState(false);
  const [fullReportLoading, setFullReportLoading] = useState(false);
  const [reportText, setReportText] = useState<string | null>(null);

  // Filter list
  const getFilteredAssets = () => {
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
  };

  const filteredAssets = getFilteredAssets();

  // Highlight tickers from search
  const handleGenerateReport = async () => {
    setFullReportLoading(true);
    try {
      const response = await fetch("/api/summarize-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Generate global market overall analysis, sentiment indexes, and macro review.",
          source: "Institutions & WallStreet Analysts Board",
          symbol: "MARKETS"
        })
      });
      const data = await response.json();
      setReportText(data.summary || "Markets validated structural support swings. Continuous bullish momentum is expected across Large Captical Tech indices.");
    } catch (e) {
      setReportText("Sentiment indicators are optimistic. AI remains the chief accelerator driven by strong capital inflow into semi-conductors and energy reserves.");
    } finally {
      setFullReportLoading(false);
    }
  };

  return (
    <div className="space-y-8" id="market-analysis-root">
      
      {/* Top Mini Price Bar */}
      <div className="bg-black -mx-8 px-8 py-3.5 overflow-x-auto flex items-center justify-between gap-6 whitespace-nowrap scrollbar-none border-b-2 border-black select-none shrink-0" id="market-ticker-bar">
        <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-black text-[#FFD600] uppercase tracking-widest">
          <Activity className="w-3.5 h-3.5 text-[#FFD600] animate-pulse" />
          <span>Surveillance Ribbon : Live Pipeline</span>
        </div>
        <div className="flex items-center gap-8 text-[10px] text-white font-bold" id="ticker-feeds">
          <div className="flex items-center gap-2">
            <span className="text-white/50 uppercase tracking-wider">S&P 500</span>
            <span className="font-mono text-white font-black">5,204.34</span>
            <span className="font-mono text-black bg-[#FFD600] border border-black font-black px-1.5 py-0.5 rounded-xs">+1.24%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/50 uppercase tracking-wider">NASDAQ</span>
            <span className="font-mono text-white font-black">16,428.82</span>
            <span className="font-mono text-black bg-[#FFD600] border border-black font-black px-1.5 py-0.5 rounded-xs">+0.89%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/50 uppercase tracking-wider">BTC/USD</span>
            <span className="font-mono text-white font-black">$68,412.00</span>
            <span className="font-mono text-white bg-red-600 border border-black font-black px-1.5 py-0.5 rounded-xs">-0.45%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/50 uppercase tracking-wider">VN-INDEX</span>
            <span className="font-mono text-white font-black">1,254.30</span>
            <span className="font-mono text-black bg-[#FFD600] border border-black font-black px-1.5 py-0.5 rounded-xs">+1.20%</span>
          </div>
        </div>
      </div>

      {/* Main Title Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-black pb-5" id="market-title-header">
        <div>
          <h2 className="font-sans font-black text-4xl text-black uppercase tracking-tighter italic">Market Analysis</h2>
          <p className="text-black/60 text-xs font-black uppercase tracking-wider mt-1">Real-time surveillance of global equities and digital assets.</p>
        </div>
        
        {/* Search Input element */}
        <div className="relative max-w-xs w-full" id="search-input-wrapper">
          <Search className="w-4 h-4 text-black absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search markets or symbols..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border-2 border-black pl-10 pr-4 py-2.5 rounded-xs text-xs font-semibold text-black focus:outline-none placeholder-black/40 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all"
          />
        </div>
      </div>

      {/* Body: Two-column grid layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="market-body-grid">
        
        {/* Main assets table column (2 spans) */}
        <div className="lg:col-span-2 space-y-6" id="assets-table-section">
          
          {/* Category Chips and Sub-filters card */}
          <div className="bg-white border-2 border-black p-4 rounded-xs flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)]" id="filters-container-card">
            
            {/* Left category tags */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5" id="category-chips">
              {(["All", "Vietnam", "US", "Crypto", "ETFs"] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-2 border rounded-xs text-[10px] tracking-wider font-black uppercase transition-all shrink-0 cursor-pointer ${
                    selectedCategory === cat
                      ? "bg-[#0047FF] text-white border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                      : "bg-white text-black border-black/10 hover:border-black hover:bg-[#FFD600]"
                  }`}
                >
                  {cat === "All" ? "All Targets" : cat}
                </button>
              ))}
            </div>

            {/* Right sub-filter selection chips */}
            <div className="flex items-center gap-1 border-l-2 border-black/10 pl-3 h-full" id="sub-filter-chips">
              <button 
                onClick={() => setActiveSubFilter("All")}
                className={`px-3 py-1.5 rounded-xs text-[10px] uppercase font-black ${
                  activeSubFilter === "All" ? "bg-black text-[#FFD600]" : "text-black/50 hover:text-black"
                }`}
              >
                All
              </button>
              <button 
                onClick={() => setActiveSubFilter("Gainers")}
                className={`px-3 py-1.5 border rounded-xs text-[10px] uppercase font-black inline-flex items-center gap-0.5 ${
                  activeSubFilter === "Gainers" ? "bg-emerald-100 border-black text-black" : "border-transparent text-black/50 hover:text-black"
                }`}
              >
                <TrendingUp className="w-3" />
                <span>Gainers</span>
              </button>
              <button 
                onClick={() => setActiveSubFilter("Losers")}
                className={`px-3 py-1.5 border rounded-xs text-[10px] uppercase font-black inline-flex items-center gap-0.5 ${
                  activeSubFilter === "Losers" ? "bg-black border-black text-white" : "border-transparent text-black/50 hover:text-black"
                }`}
              >
                <TrendingDown className="w-3" />
                <span>Losers</span>
              </button>
            </div>
          </div>

          {/* Table representing Screen 3 */}
          <div className="bg-white border-2 border-black rounded-xs overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" id="market-assets-grid">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse" id="market-analysis-table">
                <thead>
                  <tr className="bg-black text-[#FFD600] font-black uppercase text-[10px] tracking-widest border-b border-black">
                    <th className="px-6 py-4">Symbol</th>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4 text-right">Price</th>
                    <th className="px-6 py-4 text-right">Change %</th>
                    <th className="px-6 py-4 text-right">Market Cap</th>
                    <th className="px-6 py-4 text-right">P/E Ratio</th>
                    <th className="px-6 py-4 text-right">Volume</th>
                    <th className="px-6 py-4 text-center">Watch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {filteredAssets.map((asset, idx) => {
                    const isPositive = asset.changePercent >= 0;
                    
                    // Zebra stripe calculation
                    const bgClass = idx % 2 === 0 ? "bg-white" : "bg-neutral-50/50";
                    const isInWatchlist = watchlistSymbols.includes(asset.symbol);

                    return (
                      <tr key={asset.symbol} className={`${bgClass} hover:bg-[#FFD600]/10 transition-colors`}>
                        <td className="px-6 py-4 font-mono font-black text-[#0047FF] text-sm">
                          <button 
                            onClick={() => onSelectTicker(asset.symbol)}
                            className="hover:underline text-left cursor-pointer transition-colors block"
                          >
                            {asset.symbol}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-xs font-black uppercase text-black">{asset.name}</td>
                        
                        {/* Cost styled with JetBrains Mono */}
                        <td className="px-6 py-4 text-right font-mono text-sm text-black font-bold">
                          {asset.currencySymbol || "$"}{asset.price.toLocaleString("en-US", { minimumFractionDigits: asset.price > 1000 ? 0 : 2 })}
                        </td>

                        {/* PRICE INDICATORS: soft-tinted backgrounds for better legibility */}
                        <td className="px-6 py-4 text-right">
                          <span className={`inline-flex items-center gap-0.5 font-black text-xs px-2.5 py-1 border border-black rounded-xs ${
                            isPositive 
                              ? "text-black bg-emerald-100" 
                              : "text-white bg-black"
                          }`}>
                            {isPositive ? "+" : ""}{asset.changePercent}%
                          </span>
                        </td>
                        
                        <td className="px-6 py-4 text-right font-mono text-xs text-black/60 font-bold">{asset.marketCap}</td>
                        <td className="px-6 py-4 text-right font-mono text-xs text-black/60 font-bold">{asset.peRatio}</td>
                        <td className="px-6 py-4 text-right font-mono text-xs text-black/60 font-bold">{asset.volume}</td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => onAddWatchlist(asset)}
                            className={`p-1 text-lg hover:scale-125 transition-transform ${
                              isInWatchlist ? "text-[#0047FF]" : "text-black/20"
                            }`}
                          >
                            ★
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredAssets.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-black/40 text-xs font-black uppercase">
                        No targets match current filters or search query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t-2 border-black text-center bg-[#F3F3F3] text-xs font-black uppercase tracking-wider text-black hover:bg-black hover:text-[#FFD600] cursor-pointer transition-colors">
              Request Additional Feed Telemetry
            </div>
          </div>
        </div>

        {/* Right Widgets Column (1 span) */}
        <div className="space-y-6" id="analysis-right-sidebar">
          
          {/* AI Sector Insight */}
          <div className="bg-white border-2 border-black p-6 rounded-xs shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative" id="ai-sector-insight-card">
            <div className="flex items-center justify-between mb-4 border-b border-black/10 pb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 fill-current text-[#0047FF]" />
                <h3 className="font-black text-xs text-black uppercase tracking-wider">AI Sector Insights</h3>
              </div>
            </div>

            {/* OVERALL SENTIMENT indicator slider widget */}
            <div className="mb-6" id="sentiment-indicator-block">
              <span className="text-[10px] font-black text-black/50 block tracking-wider uppercase">Surveillance Sentiment Index</span>
              <div className="flex items-center justify-between text-[10px] text-black font-black uppercase mt-1.5">
                <span>BEARISH</span>
                <span className="text-[#0047FF] bg-[#FFD600] border border-black px-1.5 py-0.5 rounded-xs text-[10px] font-black">OPTIMISTIC (72)</span>
                <span>BULLISH</span>
              </div>
              <div className="relative w-full h-3.5 bg-[#F3F3F3] border border-black rounded-xs mt-3.5" id="sentiment-rail">
                {/* Visual colored fill representing active weights */}
                <div 
                  className="absolute inset-y-0 left-0 bg-[#0047FF] border-r border-black"
                  style={{ width: "72%" }}
                />
                {/* Visual cursor element indicating exactly 72% */}
                <div 
                  className="absolute top-1/2 -translate-y-1/2 w-4.5 h-4.5 border-2 border-black bg-[#FFD600] shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] rounded-xs transform -translate-x-1/2 z-10"
                  style={{ left: "72%" }}
                />
              </div>
            </div>

            {/* Trending sectors */}
            <div className="space-y-4" id="trending-sectors-list">
              <span className="text-[10px] font-black text-black/50 block uppercase tracking-wider border-b border-black/5 pb-1">Hot Industry Matrix</span>
              
              {TRENDING_SECTORS.map((sect, idx) => {
                const isPositive = sect.isPositive;
                return (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 border border-black bg-[#FFD600]" />
                      <span className="text-xs font-black uppercase text-black">{sect.name}</span>
                    </div>
                    <div className="flex items-center gap-3.5 text-right font-mono text-[10px] font-black">
                      <span className={`px-1.5 py-0.5 border border-black rounded-xs ${
                        isPositive ? "bg-emerald-100 text-black" : "bg-black text-white"
                      }`}>
                        {isPositive ? "+" : ""}{sect.change}%
                      </span>
                      <span className="text-black/50 font-bold">INFLOW: {sect.inflow}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action generate full report */}
            <button 
              onClick={handleGenerateReport}
              disabled={fullReportLoading}
              className="mt-6 w-full text-center py-2.5 bg-[#FFD600] hover:bg-black hover:text-white text-black border-2 border-black text-xs font-black uppercase tracking-wider shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all cursor-pointer inline-flex items-center justify-center gap-1.5"
            >
              {fullReportLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-black" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              <span>Run Macro AI Crawler</span>
            </button>
            
            {/* Display compiled report text */}
            {reportText && (
              <div className="mt-4 bg-[#F3F3F3] border-2 border-black rounded-xs p-4 text-[11px] text-black font-semibold leading-relaxed font-sans shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                {reportText}
              </div>
            )}
          </div>

          {/* Analyst Take card */}
          <div className="bg-white border-2 border-black p-6 rounded-xs shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" id="analyst-take-card">
            <h3 className="font-sans font-black text-xs uppercase tracking-wider text-black mb-2.5">EQUITY ANALYST BRIEF</h3>
            <p className="text-black/80 text-xs leading-relaxed font-sans font-semibold">
              Recent macroeconomic prints suggest stabilization in tech structures, with global AI models continuing to drive active reallocation targets.
            </p>
            <button 
              onClick={() => setShowAnalystTake(true)}
              className="mt-3.5 inline-flex items-center gap-1 text-xs text-[#0047FF] hover:text-black font-black uppercase tracking-wider cursor-pointer"
            >
              <span>Read analysis</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#0047FF]" />
            </button>
          </div>

          {/* Geographic Trends heatmap map visualization */}
          <div className="bg-white border-2 border-black p-6 rounded-xs shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden" id="geographic-trends-card">
            <div className="flex items-center justify-between mb-3 border-b border-black/10 pb-2">
              <h3 className="font-sans font-black text-xs uppercase tracking-wider text-black">Geographic Trends</h3>
              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-black bg-[#FFD600] border border-black px-1.5 py-0.5 rounded-xs animate-pulse">
                HEATMAP LIVE
              </span>
            </div>

            {/* Micro Futuristic vector globe layout */}
            <div className="w-full bg-[#F3F3F3] h-28 rounded-xs flex items-center justify-center relative border border-black/10" id="vector-globe-placeholder">
              
              {/* Complex Vector SVG layout */}
              <svg className="w-full h-full opacity-40 shrink-0" viewBox="0 0 100 50">
                {/* grid lines */}
                <path d="M0,10 Q50,2 100,10 M0,20 Q50,15 100,20 M0,30 Q50,28 100,30 M0,40 Q50,42 100,40" fill="none" stroke="#000000" strokeWidth="0.5" />
                <path d="M10,0 Q15,25 10,50 M30,0 Q32,25 30,50 M50,0 Q50,25 50,50 M70,0 Q68,25 70,50 M90,0 Q85,25 90,50" fill="none" stroke="#000000" strokeWidth="0.5" />
                
                {/* Vietnam / Southeast Asia marker dots */}
                <circle cx="65" cy="28" r="4" fill="#0047FF" opacity="0.8" className="animate-ping" />
                <circle cx="65" cy="28" r="2" fill="#000000" />
                
                {/* US Marker dots */}
                <circle cx="25" cy="18" r="2" fill="#0047FF" />
                <circle cx="32" cy="20" r="1.5" fill="#000000" />
                
                <circle cx="82" cy="15" r="2" fill="#000000" />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
                <span className="font-sans font-black text-[11px] uppercase tracking-wide text-black leading-tight">Vietnamese index leads 15% regional liquidity expansion</span>
                <span className="text-[9px] text-black/50 mt-1 uppercase font-black block">Telemetry Nodes calibrated at Hanoi / HCMC centres</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Analyst take detailed dialog */}
      {showAnalystTake && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => setShowAnalystTake(false)}>
          <div 
            className="bg-white rounded-xs shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-lg overflow-hidden border-2 border-black"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b-2 border-black bg-[#FFD600] flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-black">
                <Globe className="w-4 h-4 text-black" />
                <h3 className="font-sans font-black text-xs uppercase tracking-wider">TECH SECTOR & REGIONAL MACRO REPORT</h3>
              </div>
              <button onClick={() => setShowAnalystTake(false)} className="text-black hover:text-red-600 text-sm font-black">✕</button>
            </div>
            <div className="p-6 space-y-4 text-xs text-black font-semibold leading-relaxed font-sans">
              <p>
                <strong>Macro Outlook:</strong> Recent prints indicating cooling inflation allow monetary committees larger flexibility in formulating potential tapering operations. Tech indexes (rebounding off double-bottom supports) indicate robust support and consistent capital accumulation.
              </p>
              <p>
                <strong>Southeast Asian Market Indicators:</strong> Vingroup (VIC), Vinhomes (VHM) along with standard blue-chips are logging institutional net inflows. SEA liquidity is projected to gain an additional 15% over historical averages driven by local export indices.
              </p>
              <button 
                onClick={() => setShowAnalystTake(false)}
                className="w-full bg-[#0047FF] text-white hover:bg-black py-2.5 rounded-xs border border-black text-xs font-black uppercase tracking-wider transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
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
