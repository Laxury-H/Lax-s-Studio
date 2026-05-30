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
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useSettings } from "../SettingsContext";

interface PortfolioViewProps {
  holdings: Holding[];
  marketAssets: MarketAsset[];
  onAddTransaction: (holding: Omit<Holding, "id">) => void;
  onRemoveHolding: (id: string) => void;
  onViewAssetDetail?: (symbol: string) => void;
}

export default function PortfolioView({
  holdings,
  marketAssets,
  onAddTransaction,
  onRemoveHolding
}: PortfolioViewProps) {
  const { language, displayCurrency, formatMoney } = useSettings();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [aiReview, setAiReview] = useState<{ concentrationText: string; optimizationIdea: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Add Transaction Form States
  const [assetSymbol, setAssetSymbol] = useState("");
  const [qty, setQty] = useState(1);
  const [customPrice, setCustomPrice] = useState(0);
  const [historicalPnL, setHistoricalPnL] = useState<{date: string, value: number}[]>([]);
  const [isChartLoading, setIsChartLoading] = useState(false);

  const reviewFingerprint = useMemo(
    () => holdings.map(h => `${h.asset}:${h.qty}:${h.avgCost}`).join("|"),
    [holdings]
  );

  const allocationData = useMemo(() => {
    return holdings.map(h => {
      const asset = marketAssets.find(a => a.symbol === h.asset);
      const currentPrice = asset ? asset.price : h.avgCost;
      const value = currentPrice * h.qty;
      return {
        name: h.asset,
        value,
        category: asset?.category || "Unknown"
      };
    }).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [holdings, marketAssets]);

  const PIE_COLORS = ['#fcd535', '#0ecb81', '#f6465d', '#3b82f6', '#A020F0', '#FF8C00'];

  useEffect(() => {
    async function fetchPnL() {
      if (holdings.length === 0) return setHistoricalPnL([]);
      setIsChartLoading(true);
      try {
        const allHistories = await Promise.all(
          holdings.map(h => fetch(`/api/historical-data/${h.asset}`).then(res => res.json()))
        );
        
        const dailyValueMap = new Map<string, number>();
        holdings.forEach((h, idx) => {
          const hData = allHistories[idx]?.data;
          if (!hData || !Array.isArray(hData)) return;
          
          hData.forEach((day: any) => {
            const val = (dailyValueMap.get(day.date) || 0) + (day.price * h.qty);
            dailyValueMap.set(day.date, val);
          });
        });
        
        const result = Array.from(dailyValueMap.entries())
          .map(([date, value]) => ({ date, value }))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          
        setHistoricalPnL(result);
      } catch (error) {
        console.error("Failed to calculate historical PnL", error);
      } finally {
        setIsChartLoading(false);
      }
    }
    
    fetchPnL();
  }, [holdings]);

  // Keep the transaction form aligned with live provider prices.
  useEffect(() => {
    if (!assetSymbol && marketAssets.length > 0) {
      setAssetSymbol(marketAssets[0].symbol);
      return;
    }

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
        body: JSON.stringify({ holdings, language })
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
    if (holdings.length === 0) {
      setAiReview(null);
      return;
    }
    fetchPortfolioReview();
  }, [language, reviewFingerprint]);

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
    if (!assetObj) return;
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
      { name: "Technology", percent: 64, color: "#fcd535" },       // Radiant Yellow
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
      let color = "#fcd535";
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5" id="portfolio-header">
        <div>
          <h2 className="font-sans font-black text-4xl text-foreground uppercase tracking-tighter italic">Portfolio Overview</h2>
          <p className="text-foreground/60 text-xs font-black uppercase tracking-wider mt-1">Real-time analysis of your digital and equity holdings.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 bg-card border border-border px-4.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-foreground hover:bg-accent hover:shadow-lg shadow-black/5 dark:shadow-black/20 active:translate-y-0.5 transition-all shadow-lg shadow-black/5 dark:shadow-black/20 cursor-pointer"
            id="btn-export-csv"
          >
            <Download className="w-4 h-4 text-foreground animate-bounce" />
            <span>Export CSV</span>
          </button>
          <button 
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-2 bg-primary hover:bg-card border border-border hover:text-primary-fg border border-border px-4.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-primary-fg hover:shadow-lg shadow-black/5 dark:shadow-black/20 active:translate-y-0.5 transition-all shadow-lg shadow-black/5 dark:shadow-black/20 cursor-pointer"
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
        <div className="bg-card border border-border p-6 rounded-xl relative shadow-lg shadow-black/5 dark:shadow-black/20" id="card-total-value">
          <span className="text-[10px] font-black text-foreground/50 tracking-wider uppercase block">Total capital Value</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="font-sans font-black text-foregroundxl text-foreground italic leading-none" id="portfolio-total-val-display">
              {formatMoney(stats.totalValue, "$")}
            </span>
            <span className="text-[10px] font-black text-primary-fg bg-card border border-border px-2 py-0.5 rounded-xl">{displayCurrency}</span>
          </div>
          <span className="text-[9px] text-foreground/50 mt-3 block font-bold uppercase tracking-wider">Synced with active exchange indices</span>
        </div>

        {/* Day's Gain/Loss */}
        <div className="bg-card border border-border p-6 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20" id="card-days-gain">
          <span className="text-[10px] font-black text-foreground/50 tracking-wider uppercase block">Day's surveillance return</span>
          <div className="flex items-baseline gap-2 mt-2 font-mono">
            <span className={`font-sans font-black text-2xl block italic leading-none ${isDayGainPositive ? "text-success" : "text-danger"}`}>
              {isDayGainPositive ? "+" : "-"}{formatMoney(Math.abs(stats.daysGain), "$")}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-black border border-border px-2 py-0.5 rounded-xl ${
              isDayGainPositive ? "text-foreground bg-accent" : "text-primary-fg bg-card border border-border"
            }`}>
              {isDayGainPositive ? <ArrowUpRight className="w-3" /> : <ArrowDownRight className="w-3" />}
              {isDayGainPositive ? "+" : ""}{stats.gainPercent.toFixed(2)}%
            </span>
          </div>
          <span className="text-[9px] text-primary mt-3 block font-bold uppercase tracking-wider">
            {isDayGainPositive ? "Upwards momentum detected" : "Drawdown pressure detected"}
          </span>
        </div>

        {/* Total ROI with progress bar */}
        <div className="bg-card border border-border p-6 rounded-xl flex flex-col justify-between shadow-lg shadow-black/5 dark:shadow-black/20" id="card-portfolio-roi">
          <div>
            <span className="text-[10px] font-black text-foreground/50 tracking-wider uppercase block">Accumulated Total ROI</span>
            <span className="font-sans font-black text-2xl text-foreground mt-2 block italic leading-none">
              {isRoiPositive ? "+" : ""}{stats.roi.toFixed(1)}%
            </span>
          </div>
          <div className="mt-3.5" id="roi-progress-container">
            <div className="w-full h-3 bg-background border border-border rounded-xl overflow-hidden">
              <div 
                className="bg-primary h-full rounded-xl transition-all duration-1000" 
                style={{ width: `${Math.min(100, Math.max(0, stats.roi))}%` }} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* Historical PnL Chart */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6 shadow-lg shadow-black/5 dark:shadow-black/20 relative" id="portfolio-pnl-chart">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="font-sans font-black text-xs uppercase tracking-wider text-foreground">30-Day Portfolio Performance</h3>
          </div>
        </div>
        
        <div className="h-64 w-full">
          {isChartLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-xs font-black uppercase tracking-wider animate-pulse text-primary">Generating Historical Analytics...</span>
            </div>
          ) : historicalPnL.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-xs font-black uppercase tracking-wider text-muted-fg">Not enough data. Add a holding to see performance.</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={historicalPnL} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FFD600" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#FFD600" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  hide 
                />
                <YAxis 
                  domain={['dataMin - 100', 'dataMax + 100']} 
                  hide 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                  labelStyle={{ color: 'hsl(var(--muted-foreground))', fontSize: '10px' }}
                  formatter={(value: number) => [formatMoney(Number(value), "$"), 'Value']}
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#FFD600" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#pnlGradient)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Main content grid: Table column & Right widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="portfolio-body-grid">
        
        {/* Large Holdings Table (2 widths) */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden flex flex-col justify-between shadow-lg shadow-black/5 dark:shadow-black/20" id="large-holdings-panel flex flex-col h-full justify-between">
          <div>
            <div className="p-6 border-b border-border bg-background flex items-center justify-between">
              <h3 className="font-sans font-black text-xs uppercase tracking-wider text-foreground">Registered Holdings database</h3>
              <div className="flex items-center gap-2">
                <button className="text-foreground hover:text-primary p-1 border border-border bg-card rounded-xl cursor-pointer" title="Filter list">
                  <Filter className="w-3.5 h-3.5" />
                </button>
                <button className="text-foreground hover:text-primary p-1 border border-border bg-card rounded-xl cursor-pointer" title="More options">
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse" id="holdings-table">
                <thead>
                  <tr className="bg-card border border-border text-[#FFD600] font-black uppercase text-[10px] tracking-widest border-b border-border">
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
                    let avatarBg = "bg-primary text-primary-fg";
                    if (charCode === "B") avatarBg = "bg-muted text-foreground";
                    else if (charCode === "N") avatarBg = "bg-primary text-primary-fg";
                    else if (charCode === "T") avatarBg = "bg-[#8A8A8A] text-primary-fg";

                    return (
                      <tr key={h.id} className="hover:bg-accent/10 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 border border-border rounded-xl ${avatarBg} font-black text-sm flex items-center justify-center shrink-0 shadow-lg shadow-black/5 dark:shadow-black/20`}>
                              {charCode}
                            </div>
                            <div>
                              <span className="font-sans font-black text-foreground text-xs uppercase tracking-wide block leading-tight">{h.name}</span>
                              <span className="font-mono text-[10px] text-foreground/50 font-bold uppercase mt-0.5 block">{h.asset} • {h.category}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-xs text-foreground font-semibold">
                          {h.qty.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-xs text-foreground/85 font-semibold">
                          {formatMoney(h.avgCost, "$")}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-xs text-foreground/85 font-semibold">
                          {formatMoney(h.currentPrice, "$")}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-xs text-foreground font-black">
                          {formatMoney(currentVal, "$")}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => onRemoveHolding(h.id)}
                            className="p-1 px-2 text-foreground hover:text-primary-fg border border-border hover:bg-card border border-border bg-card rounded-xl transition-all cursor-pointer shadow-lg shadow-black/5 dark:shadow-black/20"
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
                      <td colSpan={6} className="px-6 py-12 text-foregroundenter text-foreground/40 text-xs font-black uppercase">
                        No transactions registered in this portfolio. Click "Add Transaction" to insert targets.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 border-t border-border text-foregroundenter bg-background">
            <span className="text-xs font-black uppercase tracking-wider text-foreground hover:underline cursor-pointer">
              View All {holdings.length} holdings listed above
            </span>
          </div>
        </div>

        {/* Right Widgets Column (1 width) */}
        <div className="space-y-6" id="portfolio-right-column">
          
          {/* AI Portfolio Review widget */}
          <div className="bg-card border-y-2 border-r-2 border-l-8 border-primary border-border p-6 relative rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20" id="ai-portfolio-review-widget">
            <div className="flex items-center gap-2 mb-4 justify-between border-b border-border/10 pb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 fill-current text-primary" />
                <span className="font-black text-[10px] text-foreground uppercase tracking-wider">AI Portfolio Review</span>
              </div>
              {aiLoading && <RefreshCw className="w-3 w-3 text-foreground animate-spin" />}
            </div>

            {aiLoading ? (
              <div className="space-y-3 py-2 animate-pulse">
                <div className="h-3 bg-card border border-border/10 rounded w-full" />
                <div className="h-3 bg-card border border-border/10 rounded w-11/12" />
                <div className="h-3 bg-card border border-border/10 rounded w-10/12" />
                <div className="h-10 bg-card border border-border/5 rounded w-full mt-4" />
              </div>
            ) : (
              <div className="space-y-4" id="ai-review-content">
                <p className="text-foreground text-xs font-sans leading-relaxed font-semibold">
                  {aiReview?.concentrationText || "Add live-priced holdings to generate a portfolio review."}
                </p>
                
                <div className="bg-background border border-border p-4 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20" id="oi-idea-box">
                  <span className="text-foreground font-black text-[10px] uppercase tracking-wider block">Optimization Proposal:</span>
                  <p className="text-foreground/80 text-[11px] mt-1.5 leading-relaxed font-semibold">
                    {aiReview?.optimizationIdea || "No optimization proposal is available until the portfolio contains at least one holding."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Asset Allocation card with Recharts PieChart */}
          <div className="bg-card border border-border p-6 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20" id="asset-allocation-card">
            <h3 className="font-sans font-black text-xs uppercase tracking-wider text-foreground mb-4 pb-2 border-b border-border/10">Asset Allocation</h3>
            
            <div className="flex flex-col items-center justify-center py-4 relative" id="pie-chart-container">
              {allocationData.length > 0 ? (
                <>
                  <div className="w-full h-48 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                          itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                          formatter={(value: number) => [formatMoney(Number(value), "$"), 'Value']}
                        />
                        <Pie
                          data={allocationData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                          stroke="none"
                        >
                          {allocationData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[9px] text-foreground/50 font-black tracking-wider uppercase">LARGEST</span>
                      <span className="text-lg font-black text-foreground italic leading-none mt-0.5 max-w-[80px] truncate text-center">
                        {allocationData[0]?.name}
                      </span>
                    </div>
                  </div>

                  {/* Chart Legend */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-6 w-full text-left" id="allocation-legend">
                    {allocationData.map((asset, idx) => {
                      const totalValue = allocationData.reduce((acc, curr) => acc + curr.value, 0);
                      const percent = ((asset.value / totalValue) * 100).toFixed(1);
                      return (
                        <div key={idx} className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 text-[10px] text-foreground uppercase font-black">
                            <span 
                              className="w-2.5 h-2.5 border border-border rounded-full inline-block" 
                              style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                            />
                            <span className="truncate max-w-[85px]">{asset.name}</span>
                            <span className="text-foreground/50 font-mono text-[9px]">({percent}%)</span>
                          </div>
                          <span className="font-mono text-[10px] font-semibold text-foreground/70 ml-4">
                            {formatMoney(asset.value, "$", { compact: true })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="h-48 w-full flex items-center justify-center text-foreground/40 text-[10px] font-black uppercase">
                  No allocation data
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Add Transaction Dialog Modal Overlay */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-card border border-border/60 backdrop-blur-xs p-4" onClick={() => setIsAddOpen(false)}>
          <div 
            className="bg-card rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 w-full max-w-md overflow-hidden border border-border animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-border flex items-center justify-between bg-accent">
              <div className="flex items-center gap-2 text-foreground">
                <div className="p-1 px-1.5 bg-card border border-border text-[#FFD600] rounded-xl border border-border">
                  <CreditCard className="w-4 h-4" />
                </div>
                <h3 className="font-sans font-black text-xs uppercase tracking-wider">ADD TRANSACTION RECORD</h3>
              </div>
              <button 
                onClick={() => setIsAddOpen(false)}
                className="text-foreground hover:text-danger transition-colors p-1 rounded-xl font-black cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-foreground/60 uppercase tracking-wider mb-1.5 text-left">Asset Symbol / Name</label>
                <select
                  value={assetSymbol}
                  onChange={(e) => setAssetSymbol(e.target.value)}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card text-foreground font-semibold focus:outline-none"
                  required
                >
                  {marketAssets.map(asset => (
                    <option key={asset.symbol} value={asset.symbol}>{asset.symbol} - {asset.name} ({asset.currencySymbol || "$"})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4 text-left">
                <div>
                  <label className="block text-[10px] font-black text-foreground/60 uppercase tracking-wider mb-1.5">Asset Quantity</label>
                  <input
                    type="number"
                    step="any"
                    value={qty}
                    onChange={(e) => setQty(Math.max(0.01, Number(e.target.value)))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card text-foreground font-semibold focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-foreground/60 uppercase tracking-wider mb-1.5">Aquisition Average Cost</label>
                  <input
                    type="number"
                    step="any"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(Math.max(0.01, Number(e.target.value)))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card text-foreground font-semibold focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-border text-right">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 text-[10px] font-black uppercase text-foreground/60 hover:text-foreground border border-transparent transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary hover:bg-muted text-foreground hover:text-accent-fg border border-border rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg shadow-black/5 dark:shadow-black/20 transition-all cursor-pointer"
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
