import { useState, useEffect, useMemo, FormEvent } from "react";
import { 
  Sparkles, 
  ArrowUpRight, 
  ArrowDownRight, 
  Download, 
  Plus, 
  RefreshCw, 
  Filter, 
  MoreHorizontal, 
  Trash2, 
  X,
  CreditCard,
  TrendingUp
} from "lucide-react";
import { Holding, MarketAsset } from "../types";

interface PortfolioViewProps {
  holdings: Holding[];
  marketAssets: MarketAsset[];
  onAddTransaction: (holding: Omit<Holding, "id">) => void;
  onRemoveHolding: (id: string) => void;
}

export default function PortfolioView({
  holdings,
  marketAssets,
  onAddTransaction,
  onRemoveHolding
}: PortfolioViewProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [aiReview, setAiReview] = useState<{ concentrationText: string; optimizationIdea: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Add Transaction Form States
  const [assetSymbol, setAssetSymbol] = useState("AAPL");
  const [qty, setQty] = useState(10);
  const [customPrice, setCustomPrice] = useState(189.43);
  const reviewFingerprint = useMemo(
    () => holdings.map(h => `${h.asset}:${h.qty}:${h.avgCost}`).join("|"),
    [holdings]
  );

  // Triggered when current asset selected changes to fetch the mock current price
  useEffect(() => {
    const asset = marketAssets.find(a => a.symbol === assetSymbol);
    if (asset) {
      setCustomPrice(asset.price);
    }
  }, [assetSymbol, marketAssets]);

  // Request portfolio review from AI on initial load and whenever holdings list changes
  const fetchPortfolioReview = async () => {
    setAiLoading(true);
    try {
      const response = await fetch("/api/portfolio-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings })
      });
      const data = await response.json();
      setAiReview(data);
    } catch (e) {
      console.error(e);
      setAiReview({
        concentrationText: "Your portfolio is currently concentrated under Technology. Suggest rebalancing into Consumer Staples or defensive positions to guard against local microeconomic trends.",
        optimizationIdea: "Consider transitioning minor non-core assets into wider market index funds (e.g. S&P 500) to optimize risks."
      });
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolioReview();
  }, [reviewFingerprint]);

  // Math Calculations
  const calculatePortfolioStats = () => {
    const marketBySymbol = new Map(marketAssets.map(asset => [asset.symbol, asset]));
    let totalValue = 0;
    let totalCost = 0;
    let daysGain = 0;
    
    holdings.forEach((h) => {
      const currentValue = h.qty * h.currentPrice;
      const changePercent = marketBySymbol.get(h.asset)?.changePercent || 0;
      const previousValue = changePercent === -100 ? currentValue : currentValue / (1 + changePercent / 100);

      totalValue += currentValue;
      totalCost += h.qty * h.avgCost;
      daysGain += currentValue - previousValue;
    });

    const gainValue = totalValue - totalCost;
    const roiPercent = totalCost > 0 ? (gainValue / totalCost) * 100 : 0;
    const previousTotalValue = totalValue - daysGain;
    const displayDaysGainPercent = previousTotalValue > 0 ? (daysGain / previousTotalValue) * 100 : 0;

    return {
      totalValue,
      daysGain,
      gainPercent: displayDaysGainPercent,
      roi: roiPercent,
      cost: totalCost
    };
  };

  const stats = calculatePortfolioStats();
  const isDayGainPositive = stats.daysGain >= 0;
  const isRoiPositive = stats.roi >= 0;

  // Handle Form Submission
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const assetObj = marketAssets.find(a => a.symbol === assetSymbol);
    const category: Holding["category"] = !assetObj
      ? "Others"
      : assetObj.category === "Crypto"
        ? "Crypto"
        : assetObj.symbol === "TSLA"
          ? "Automotive"
          : "Technology";

    onAddTransaction({
      asset: assetSymbol,
      name: assetObj ? assetObj.name : assetSymbol,
      qty: Number(qty),
      avgCost: Number(customPrice), // current market average cost
      currentPrice: assetObj ? assetObj.price : customPrice,
      category
    });

    setIsAddOpen(false);
  };

  // Sector calculations for Doughnut diagram
  const getSectorAllocation = () => {
    const sectors: Record<string, number> = {};
    let total = 0;
    
    holdings.forEach((h) => {
      const val = h.qty * h.currentPrice;
      sectors[h.category] = (sectors[h.category] || 0) + val;
      total += val;
    });

    // Fallbacks matching Screen 1's legend precisely with high-contrast themes
    const defaultSectorData = [
      { name: "Technology", percent: 64, color: "#0047FF" },       // Royal Blue
      { name: "Crypto", percent: 18, color: "#FFD600" },           // Pure Yellow
      { name: "Financials", percent: 12, color: "#000000" },         // Black
      { name: "Energy", percent: 6, color: "#8A8A8A" }             // Mined Gray
    ];

    if (holdings.length === 0) {
      return defaultSectorData;
    }

    // Dynamic calculations from actual contents with brutalist accents
    const computed = Object.keys(sectors).map((key) => {
      const percent = total > 0 ? Math.round((sectors[key] / total) * 100) : 0;
      let color = "#0047FF";
      if (key === "Crypto") color = "#FFD600";
      else if (key === "Financials") color = "#000000";
      else if (key === "Automotive") color = "#8A8A8A";
      else if (key === "Energy") color = "#C4C4C4";
      else color = "#E5E5E5";
      
      return {
        name: key,
        percent,
        color
      };
    }).sort((a, b) => b.percent - a.percent);

    return computed.length > 0 ? computed : defaultSectorData;
  };

  const sectorAllocations = getSectorAllocation();

  // Simple CSV Exporter
  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Asset,Name,Quantity,Avg Cost,Current Price,Current Value,Gain/Loss\n";
    holdings.forEach((h) => {
      const row = `${h.asset},${h.name},${h.qty},${h.avgCost},${h.currentPrice},${(h.qty * h.currentPrice).toFixed(2)},${((h.currentPrice - h.avgCost) * h.qty).toFixed(2)}`;
      csvContent += row + "\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `FinPilot_Portfolio_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8" id="portfolio-view-root">
      {/* Title Header with action buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-black pb-5" id="portfolio-header">
        <div>
          <h2 className="font-sans font-black text-4xl text-black uppercase tracking-tighter italic">Portfolio Overview</h2>
          <p className="text-black/60 text-xs font-black uppercase tracking-wider mt-1">Real-time analysis of your digital and equity holdings.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 bg-white border-2 border-black px-4.5 py-2.5 rounded-xs text-[10px] font-black uppercase tracking-wider text-black hover:bg-[#FFD600] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
            id="btn-export-csv"
          >
            <Download className="w-4 h-4 text-black animate-bounce" />
            <span>Export CSV</span>
          </button>
          <button 
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-2 bg-[#0047FF] hover:bg-black hover:text-white border-2 border-black px-4.5 py-2.5 rounded-xs text-[10px] font-black uppercase tracking-wider text-white hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
            id="btn-add-transaction"
          >
            <Plus className="w-4 h-4" />
            <span>Add Transaction</span>
          </button>
        </div>
      </div>

      {/* Analytics Summary Cards (3 items) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="portfolio-stats-grid">
        {/* Total Value */}
        <div className="bg-white border-2 border-black p-6 rounded-xs relative shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" id="card-total-value">
          <span className="text-[10px] font-black text-black/50 tracking-wider uppercase block">Total capital Value</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="font-sans font-black text-3xl text-black italic leading-none" id="portfolio-total-val-display">
              ${stats.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] font-black text-white bg-black px-2 py-0.5 rounded-xs">USD</span>
          </div>
          <span className="text-[9px] text-black/50 mt-3 block font-bold uppercase tracking-wider">Synced with active exchange indices</span>
        </div>

        {/* Day's Gain/Loss */}
        <div className="bg-white border-2 border-black p-6 rounded-xs shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" id="card-days-gain">
          <span className="text-[10px] font-black text-black/50 tracking-wider uppercase block">Day's surveillance return</span>
          <div className="flex items-baseline gap-2 mt-2 font-mono">
            <span className={`font-sans font-black text-2xl block italic leading-none ${isDayGainPositive ? "text-emerald-700" : "text-red-700"}`}>
              {isDayGainPositive ? "+" : "-"}${Math.abs(stats.daysGain).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-black border border-black px-2 py-0.5 rounded-xs ${
              isDayGainPositive ? "text-black bg-[#FFD600]" : "text-white bg-black"
            }`}>
              {isDayGainPositive ? <ArrowUpRight className="w-3" /> : <ArrowDownRight className="w-3" />}
              {isDayGainPositive ? "+" : ""}{stats.gainPercent.toFixed(2)}%
            </span>
          </div>
          <span className="text-[9px] text-[#0047FF] mt-3 block font-bold uppercase tracking-wider">
            {isDayGainPositive ? "Upwards momentum detected" : "Drawdown pressure detected"}
          </span>
        </div>

        {/* Total ROI with progress bar */}
        <div className="bg-white border-2 border-black p-6 rounded-xs flex flex-col justify-between shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" id="card-portfolio-roi">
          <div>
            <span className="text-[10px] font-black text-black/50 tracking-wider uppercase block">Accumulated Total ROI</span>
            <span className="font-sans font-black text-2xl text-black mt-2 block italic leading-none">
              {isRoiPositive ? "+" : ""}{stats.roi.toFixed(1)}%
            </span>
          </div>
          <div className="mt-3.5" id="roi-progress-container">
            <div className="w-full h-3 bg-[#F3F3F3] border border-black rounded-xs overflow-hidden">
              <div 
                className="bg-[#0047FF] h-full rounded-xs transition-all duration-1000" 
                style={{ width: `${Math.min(100, Math.max(0, stats.roi))}%` }} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main content grid: Table column & Right widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="portfolio-body-grid">
        
        {/* Large Holdings Table (2 widths) */}
        <div className="lg:col-span-2 bg-white border-2 border-black rounded-xs overflow-hidden flex flex-col justify-between shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" id="large-holdings-panel flex flex-col h-full justify-between">
          <div>
            <div className="p-6 border-b-2 border-black bg-[#F3F3F3] flex items-center justify-between">
              <h3 className="font-sans font-black text-xs uppercase tracking-wider text-black">Registered Holdings database</h3>
              <div className="flex items-center gap-2">
                <button className="text-black hover:text-[#0047FF] p-1 border border-black bg-white rounded-xs cursor-pointer" title="Filter list">
                  <Filter className="w-3.5 h-3.5" />
                </button>
                <button className="text-black hover:text-[#0047FF] p-1 border border-black bg-white rounded-xs cursor-pointer" title="More options">
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse" id="holdings-table">
                <thead>
                  <tr className="bg-black text-[#FFD600] font-black uppercase text-[10px] tracking-widest border-b border-black">
                    <th className="px-6 py-4">Asset / Category</th>
                    <th className="px-6 py-4 text-right">Qty</th>
                    <th className="px-6 py-4 text-right">Avg Cost</th>
                    <th className="px-6 py-4 text-right">Current Price</th>
                    <th className="px-6 py-4 text-right">Current Value</th>
                    <th className="px-6 py-4 text-right">Telemetry Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {holdings.map((h) => {
                    const currentVal = h.qty * h.currentPrice;
                    const charCode = h.asset.charAt(0);
                    let avatarBg = "bg-[#FFD600] text-black";
                    if (charCode === "B") avatarBg = "bg-black text-white";
                    else if (charCode === "N") avatarBg = "bg-[#0047FF] text-white";
                    else if (charCode === "T") avatarBg = "bg-[#8A8A8A] text-white";

                    return (
                      <tr key={h.id} className="hover:bg-[#FFD600]/10 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 border-2 border-black rounded-xs ${avatarBg} font-black text-sm flex items-center justify-center shrink-0 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]`}>
                              {charCode}
                            </div>
                            <div>
                              <span className="font-sans font-black text-black text-xs uppercase tracking-wide block leading-tight">{h.name}</span>
                              <span className="font-mono text-[10px] text-black/50 font-bold uppercase mt-0.5 block">{h.asset} • {h.category}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-xs text-black font-semibold">
                          {h.qty.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-xs text-black/85 font-semibold">
                          ${h.avgCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-xs text-black/85 font-semibold">
                          ${h.currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-xs text-black font-black">
                          ${currentVal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => onRemoveHolding(h.id)}
                            className="p-1 px-2 text-black hover:text-white border border-black hover:bg-black bg-white rounded-xs transition-all cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                            title="Remove transaction"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {holdings.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-black/40 text-xs font-black uppercase">
                        No transactions registered in this portfolio. Click "Add Transaction" to insert targets.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 border-t-2 border-black text-center bg-[#F3F3F3]">
            <span className="text-xs font-black uppercase tracking-wider text-black hover:underline cursor-pointer">
              View All {holdings.length} holdings listed above
            </span>
          </div>
        </div>

        {/* Right Widgets Column (1 width) */}
        <div className="space-y-6" id="portfolio-right-column">
          
          {/* AI Portfolio Review widget */}
          <div className="bg-white border-y-2 border-r-2 border-l-8 border-[#0047FF] border-black p-6 relative rounded-xs shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" id="ai-portfolio-review-widget">
            <div className="flex items-center gap-2 mb-4 justify-between border-b border-black/10 pb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 fill-current text-[#0047FF]" />
                <span className="font-black text-[10px] text-black uppercase tracking-wider">AI Portfolio Review</span>
              </div>
              {aiLoading && <RefreshCw className="w-3 w-3 text-black animate-spin" />}
            </div>

            {aiLoading ? (
              <div className="space-y-3 py-2 animate-pulse">
                <div className="h-3 bg-black/10 rounded w-full" />
                <div className="h-3 bg-black/10 rounded w-11/12" />
                <div className="h-3 bg-black/10 rounded w-10/12" />
                <div className="h-10 bg-black/5 rounded w-full mt-4" />
              </div>
            ) : (
              <div className="space-y-4" id="ai-review-content">
                <p className="text-black text-xs font-sans leading-relaxed font-semibold">
                  {aiReview?.concentrationText || "Analyzing cumulative category and core sector ratios. FinPilot recommends deploying structural reallocations using quantitative overlays."}
                </p>
                
                <div className="bg-[#F3F3F3] border-2 border-black p-4 rounded-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" id="oi-idea-box">
                  <span className="text-black font-black text-[10px] uppercase tracking-wider block">Optimization Proposal:</span>
                  <p className="text-black/80 text-[11px] mt-1.5 leading-relaxed font-semibold">
                    {aiReview?.optimizationIdea || "Consider transitioning non-performing assets into wider indexed digital reserves to buffer risk indexes."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Sector Allocation card with custom SVG annular ring chart */}
          <div className="bg-white border-2 border-black p-6 rounded-xs shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" id="sector-allocation-card">
            <h3 className="font-sans font-black text-xs uppercase tracking-wider text-black mb-4 pb-2 border-b border-black/10">Sector Allocation</h3>
            
            {/* Pie details */}
            <div className="flex flex-col items-center justify-center py-4" id="svg-chart-container">
              <div className="relative w-40 h-40 flex items-center justify-center">
                
                {/* Custom Donut chart rendering via SVG */}
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="35"
                    fill="transparent"
                    stroke="#F3F3F3"
                    strokeWidth="10"
                  />
                  {/* segment layers */}
                  {(() => {
                    let cumulativePercentage = 0;
                    return sectorAllocations.map((sect, idx) => {
                      const radius = 35;
                      const circumference = 2 * Math.PI * radius;
                      const strokeDasharray = `${(sect.percent / 100) * circumference} ${circumference}`;
                      const strokeDashoffset = -((cumulativePercentage / 100) * circumference);
                      cumulativePercentage += sect.percent;

                      return (
                        <circle
                          key={idx}
                          cx="50"
                          cy="50"
                          r={radius}
                          fill="transparent"
                          stroke={sect.color}
                          strokeWidth="10"
                          strokeDasharray={strokeDasharray}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="square"
                          className="transition-all duration-1000 ease-out"
                        />
                      );
                    });
                  })()}
                </svg>

                {/* Donut label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[9px] text-black/50 font-black tracking-wider uppercase">CORE SEG</span>
                  <span className="text-xl font-black text-black italic leading-none mt-0.5">
                    {sectorAllocations[0]?.percent || 64}%
                  </span>
                </div>
              </div>

              {/* Chart Legend */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-6 w-full text-left" id="allocation-legend">
                {sectorAllocations.map((sect, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-[10px] text-black uppercase font-black">
                    <span 
                      className="w-2.5 h-2.5 border border-black rounded-xs inline-block" 
                      style={{ backgroundColor: sect.color }}
                    />
                    <span className="truncate max-w-[85px]">{sect.name}</span>
                    <span className="text-black/50 font-mono text-[9px]">({sect.percent}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Add Transaction Dialog Modal Overlay */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => setIsAddOpen(false)}>
          <div 
            className="bg-white rounded-xs shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-md overflow-hidden border-2 border-black animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b-2 border-black flex items-center justify-between bg-[#FFD600]">
              <div className="flex items-center gap-2 text-black">
                <div className="p-1 px-1.5 bg-black text-[#FFD600] rounded-xs border border-black">
                  <CreditCard className="w-4 h-4" />
                </div>
                <h3 className="font-sans font-black text-xs uppercase tracking-wider">ADD TRANSACTION RECORD</h3>
              </div>
              <button 
                onClick={() => setIsAddOpen(false)}
                className="text-black hover:text-red-700 transition-colors p-1 rounded-xs font-black cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-black/60 uppercase tracking-wider mb-1.5 text-left">Asset Symbol / Name</label>
                <select
                  value={assetSymbol}
                  onChange={(e) => setAssetSymbol(e.target.value)}
                  className="w-full border-2 border-black rounded-xs px-3 py-2 text-sm bg-white text-black font-semibold focus:outline-none"
                  required
                >
                  {marketAssets.map(asset => (
                    <option key={asset.symbol} value={asset.symbol}>{asset.symbol} - {asset.name} ({asset.currencySymbol || "$"})</option>
                  ))}
                  <option value="MSFT">MSFT - Microsoft Corp.</option>
                  <option value="FPT">FPT - FPT Corp</option>
                  <option value="VIC">VIC - Vingroup JSC</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4 text-left">
                <div>
                  <label className="block text-[10px] font-black text-black/60 uppercase tracking-wider mb-1.5">Asset Quantity</label>
                  <input
                    type="number"
                    step="any"
                    value={qty}
                    onChange={(e) => setQty(Math.max(0.01, Number(e.target.value)))}
                    className="w-full border-2 border-black rounded-xs px-3 py-2 text-sm bg-white text-black font-semibold focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-black/60 uppercase tracking-wider mb-1.5">Aquisition Average Cost</label>
                  <input
                    type="number"
                    step="any"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(Math.max(0.01, Number(e.target.value)))}
                    className="w-full border-2 border-black rounded-xs px-3 py-2 text-sm bg-white text-black font-semibold focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t-2 border-black text-right">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 text-[10px] font-black uppercase text-black/60 hover:text-black border border-transparent transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#0047FF] hover:bg-black text-white hover:text-[#FFD600] border-2 border-black rounded-xs text-[10px] font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer"
                >
                  Post Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
