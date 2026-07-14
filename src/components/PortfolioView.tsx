import { useState, useEffect, useMemo, FormEvent } from "react";
import { 
  Sparkles, 
  ArrowUpRight, 
  ArrowDownRight, 
  Download, 
  Plus, 
  RefreshCw, 
  Filter, 
  Trash2, 
  CreditCard,
  TrendingUp,
  Search,
  Eye
} from "lucide-react";
import { Holding, MarketAsset } from "../types";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useSettings } from "../SettingsContext";
import { convertCurrencyValue } from "../currency";

type CsvCell = string | number | boolean | null | undefined;

function csvRow(cells: CsvCell[]) {
  return cells.map((cell) => {
    if (cell === null || cell === undefined) return "";
    const value = typeof cell === "number"
      ? (Number.isFinite(cell) ? String(cell) : "")
      : String(cell);

    return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }).join(",");
}

function roundExportNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function buildExportFilename(prefix: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${prefix}_${stamp}.csv`;
}

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
  onRemoveHolding,
  onViewAssetDetail
}: PortfolioViewProps) {
  const { language, displayCurrency, fxRates, formatMoney } = useSettings();
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Add Transaction Form States
  const [assetSymbol, setAssetSymbol] = useState("");
  const [qty, setQty] = useState(1);
  const [customPrice, setCustomPrice] = useState(0);
  const [historicalPnL, setHistoricalPnL] = useState<{date: string, value: number}[]>([]);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [holdingSearch, setHoldingSearch] = useState("");
  const [holdingCategory, setHoldingCategory] = useState<"All" | Holding["category"]>("All");
  const [holdingSort, setHoldingSort] = useState<"value" | "pnl" | "symbol">("value");



  const marketBySymbol = useMemo(
    () => new Map(marketAssets.map(asset => [asset.symbol, asset])),
    [marketAssets]
  );

  const holdingCategories = useMemo(
    () => Array.from(new Set(holdings.map(holding => holding.category))).sort(),
    [holdings]
  );

  const displayedHoldings = useMemo(() => {
    const query = holdingSearch.trim().toLowerCase();

    return holdings
      .map((holding) => {
        const asset = marketBySymbol.get(holding.asset);
        const sourceCurrency = asset?.currencySymbol || "$";
        const currentPrice = asset?.price ?? holding.currentPrice ?? holding.avgCost;
        const currentValue = currentPrice * holding.qty;
        const costBasis = holding.avgCost * holding.qty;
        const unrealizedPnL = currentValue - costBasis;
        const unrealizedPnLPercent = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;

        return {
          holding,
          asset,
          sourceCurrency,
          currentPrice,
          currentValue,
          unrealizedPnL,
          unrealizedPnLPercent
        };
      })
      .filter(row => {
        if (holdingCategory !== "All" && row.holding.category !== holdingCategory) return false;
        if (!query) return true;
        return [
          row.holding.asset,
          row.holding.name,
          row.holding.category,
          row.asset?.category || ""
        ].some(value => value.toLowerCase().includes(query));
      })
      .sort((a, b) => {
        if (holdingSort === "symbol") {
          return a.holding.asset.localeCompare(b.holding.asset);
        }
        if (holdingSort === "pnl") {
          return b.unrealizedPnL - a.unrealizedPnL;
        }
        return b.currentValue - a.currentValue;
      });
  }, [holdingCategory, holdingSearch, holdingSort, holdings, marketBySymbol]);

  const allocationData = useMemo(() => {
    return holdings.map(h => {
      const asset = marketBySymbol.get(h.asset);
      const currentPrice = asset ? asset.price : h.avgCost;
      const value = currentPrice * h.qty;
      return {
        name: h.asset,
        value,
        category: asset?.category || "Unknown"
      };
    }).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [holdings, marketBySymbol]);

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
            const price = typeof day.price === 'number' ? day.price : (Number(day.price) || 0);
            const val = (dailyValueMap.get(day.date) || 0) + (price * (h.qty || 0));
            dailyValueMap.set(day.date, val);
          });
        });
        
        const result = Array.from(dailyValueMap.entries())
          .map(([date, value]) => ({ date, value: Number.isFinite(value) ? value : 0 }))
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



  // Math Calculations
  const calculatePortfolioStats = () => {
    let totalValue = 0;
    let totalCost = 0;
    let daysGain = 0;
    
    holdings.forEach((h) => {
      const asset = marketBySymbol.get(h.asset);
      const sourceCurrency = asset?.currencySymbol || "$";
      const currentPrice = asset?.price ?? (h as any).currentPrice ?? h.avgCost;
      const currentValue = h.qty * currentPrice;
      const costBasis = h.qty * h.avgCost;
      const changePercent = asset?.changePercent || 0;
      const previousValue = changePercent === -100 ? currentValue : currentValue / (1 + changePercent / 100);

      totalValue += convertCurrencyValue(currentValue, sourceCurrency, displayCurrency, fxRates);
      totalCost += convertCurrencyValue(costBasis, sourceCurrency, displayCurrency, fxRates);
      daysGain += convertCurrencyValue(currentValue - previousValue, sourceCurrency, displayCurrency, fxRates);
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
      const currentPrice = marketBySymbol.get(h.asset)?.price ?? (h as any).currentPrice ?? h.avgCost;
      const val = h.qty * currentPrice;
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

  // Professional CSV exporter with summary, holdings, allocation, and Excel-safe UTF-8 output.
  const handleExportCSV = () => {
    const exportedAt = new Date();
    const marketBySymbol = new Map(marketAssets.map(asset => [asset.symbol, asset]));
    const totalDisplayValue = holdings.reduce((sum, holding) => {
      const asset = marketBySymbol.get(holding.asset);
      const sourceCurrency = asset?.currencySymbol || "$";
      const currentPrice = asset?.price ?? holding.currentPrice;
      return sum + convertCurrencyValue(currentPrice * holding.qty, sourceCurrency, displayCurrency, fxRates);
    }, 0);

    const holdingRows = holdings.map((holding) => {
      const asset = marketBySymbol.get(holding.asset);
      const sourceCurrency = asset?.currencySymbol || "$";
      const currentPrice = asset?.price ?? holding.currentPrice;
      const costBasisSource = holding.avgCost * holding.qty;
      const currentValueSource = currentPrice * holding.qty;
      const unrealizedPnLSource = currentValueSource - costBasisSource;
      const unrealizedPnLPercent = costBasisSource > 0 ? (unrealizedPnLSource / costBasisSource) * 100 : 0;
      const dayChangePercent = asset?.changePercent || 0;
      const previousValueSource = dayChangePercent === -100
        ? currentValueSource
        : currentValueSource / (1 + dayChangePercent / 100);
      const dayPnLSource = currentValueSource - previousValueSource;
      const currentValueDisplay = convertCurrencyValue(currentValueSource, sourceCurrency, displayCurrency, fxRates);
      const weightPercent = totalDisplayValue > 0 ? (currentValueDisplay / totalDisplayValue) * 100 : 0;

      return {
        asset,
        holding,
        sourceCurrency,
        currentPrice,
        currentValueSource,
        costBasisSource,
        unrealizedPnLSource,
        unrealizedPnLPercent,
        dayChangePercent,
        dayPnLSource,
        currentValueDisplay,
        weightPercent
      };
    }).sort((a, b) => b.currentValueDisplay - a.currentValueDisplay);
    const allocationRows = holdingRows.map((row) => ({
      name: row.holding.asset,
      valueDisplay: row.currentValueDisplay,
      weightPercent: row.weightPercent,
      category: row.asset?.category || row.holding.category
    }));

    const csvLines = [
      csvRow(["STUDIO.FP Portfolio Export"]),
      csvRow(["Exported At", exportedAt.toISOString()]),
      csvRow(["Display Currency", displayCurrency]),
      csvRow(["Holdings Count", holdings.length]),
      csvRow([""]),
      csvRow(["Portfolio Summary"]),
      csvRow(["Metric", "Value"]),
      csvRow(["Total Value", roundExportNumber(totalDisplayValue, 2)]),
      csvRow(["Day P/L", roundExportNumber(holdingRows.reduce((sum, row) => (
        sum + convertCurrencyValue(row.dayPnLSource, row.sourceCurrency, displayCurrency, fxRates)
      ), 0), 2)]),
      csvRow(["Total Cost Basis", roundExportNumber(holdingRows.reduce((sum, row) => (
        sum + convertCurrencyValue(row.costBasisSource, row.sourceCurrency, displayCurrency, fxRates)
      ), 0), 2)]),
      csvRow(["Unrealized P/L", roundExportNumber(holdingRows.reduce((sum, row) => (
        sum + convertCurrencyValue(row.unrealizedPnLSource, row.sourceCurrency, displayCurrency, fxRates)
      ), 0), 2)]),
      csvRow(["Portfolio ROI %", roundExportNumber(stats.roi, 4)]),
      csvRow([""]),
      csvRow(["Holdings Detail"]),
      csvRow([
        "Rank",
        "Symbol",
        "Name",
        "Category",
        "Quantity",
        "Avg Cost",
        "Current Price",
        "Source Currency",
        `Cost Basis (${displayCurrency})`,
        `Current Value (${displayCurrency})`,
        `Unrealized P/L (${displayCurrency})`,
        "Unrealized P/L %",
        "Day Change %",
        `Day P/L (${displayCurrency})`,
        "Portfolio Weight %",
        "Provider",
        "Data Quality",
        "Updated At"
      ]),
      ...holdingRows.map((row, index) => csvRow([
        index + 1,
        row.holding.asset,
        row.holding.name,
        row.asset?.category || row.holding.category,
        roundExportNumber(row.holding.qty, 8),
        roundExportNumber(row.holding.avgCost, 8),
        roundExportNumber(row.currentPrice, 8),
        row.sourceCurrency,
        roundExportNumber(convertCurrencyValue(row.costBasisSource, row.sourceCurrency, displayCurrency, fxRates), 2),
        roundExportNumber(row.currentValueDisplay, 2),
        roundExportNumber(convertCurrencyValue(row.unrealizedPnLSource, row.sourceCurrency, displayCurrency, fxRates), 2),
        roundExportNumber(row.unrealizedPnLPercent, 4),
        roundExportNumber(row.dayChangePercent, 4),
        roundExportNumber(convertCurrencyValue(row.dayPnLSource, row.sourceCurrency, displayCurrency, fxRates), 2),
        roundExportNumber(row.weightPercent, 4),
        row.asset?.provider || "local",
        row.asset?.dataQuality || "unfetched",
        row.asset?.updatedAt || ""
      ])),
      csvRow([""]),
      csvRow(["Allocation Breakdown"]),
      csvRow(["Asset", `Value (${displayCurrency})`, "Weight %", "Category"]),
      ...allocationRows.map((asset) => csvRow([
        asset.name,
        roundExportNumber(asset.valueDisplay, 2),
        roundExportNumber(asset.weightPercent, 4),
        asset.category
      ])),
      csvRow([""]),

      csvRow([""]),
      csvRow(["Disclaimer", "This export is informational only and is not financial advice. Verify market data before making investment decisions."])
    ];

    const csvContent = `\uFEFF${csvLines.join("\n")}`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = buildExportFilename("STUDIO_FP_Portfolio_Export");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
            className="inline-flex items-center gap-2 bg-card/90 backdrop-blur-md border border-border px-4.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-foreground hover:bg-accent hover:shadow-lg shadow-black/5 dark:shadow-black/20 active:translate-y-0.5 transition-all shadow-lg shadow-black/5 dark:shadow-black/20 cursor-pointer"
            id="btn-export-csv"
          >
            <Download className="w-4 h-4 text-foreground animate-bounce" />
            <span>Export CSV</span>
          </button>
          <button 
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-2 bg-primary hover:bg-card/90 backdrop-blur-md border border-border hover:text-primary-fg border border-border px-4.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-primary-fg hover:shadow-lg shadow-black/5 dark:shadow-black/20 active:translate-y-0.5 transition-all shadow-lg shadow-black/5 dark:shadow-black/20 cursor-pointer"
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
        <div className="bg-card/90 backdrop-blur-md border border-border p-6 rounded-xl relative shadow-lg shadow-black/5 dark:shadow-black/20" id="card-total-value">
          <span className="text-[10px] font-black text-muted-fg tracking-wider uppercase block">Total capital Value</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="font-sans font-black text-foregroundxl text-foreground italic leading-none" id="portfolio-total-val-display">
              {formatMoney(stats.totalValue, displayCurrency)}
            </span>
            <span className="text-[10px] font-black text-foreground bg-muted border border-border px-2 py-0.5 rounded-xl">{displayCurrency}</span>
          </div>
          <span className="text-[9px] text-muted-fg mt-3 block font-bold uppercase tracking-wider">Synced with active exchange indices</span>
        </div>

        {/* Day's Gain/Loss */}
        <div className="bg-card/90 backdrop-blur-md border border-border p-6 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20" id="card-days-gain">
          <span className="text-[10px] font-black text-muted-fg tracking-wider uppercase block">Day's surveillance return</span>
          <div className="flex items-baseline gap-2 mt-2 font-mono">
            <span className={`font-sans font-black text-2xl block italic leading-none ${isDayGainPositive ? "text-success" : "text-danger"}`}>
              {isDayGainPositive ? "+" : "-"}{formatMoney(Math.abs(stats.daysGain), displayCurrency)}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-black border border-border px-2 py-0.5 rounded-xl ${
              isDayGainPositive ? "text-foreground bg-accent" : "text-primary-fg dark:text-white bg-card/90 backdrop-blur-md border border-border"
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
        <div className="bg-card/90 backdrop-blur-md border border-border p-6 rounded-xl flex flex-col justify-between shadow-lg shadow-black/5 dark:shadow-black/20" id="card-portfolio-roi">
          <div>
            <span className="text-[10px] font-black text-muted-fg tracking-wider uppercase block">Accumulated Total ROI</span>
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
      <div className="bg-card/90 backdrop-blur-md border border-border rounded-xl p-6 mb-6 shadow-lg shadow-black/5 dark:shadow-black/20 relative" id="portfolio-pnl-chart">
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
                  formatter={(value: any) => [formatMoney(Number(value), "$"), 'Value']}
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
        <div className="lg:col-span-2 bg-card/90 backdrop-blur-md border border-border rounded-xl overflow-hidden flex flex-col justify-between shadow-lg shadow-black/5 dark:shadow-black/20" id="large-holdings-panel flex flex-col h-full justify-between">
          <div>
            <div className="p-6 border-b border-border bg-background flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div>
                <h3 className="font-sans font-black text-xs uppercase tracking-wider text-foreground">Registered Holdings database</h3>
                <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-muted-fg">
                  {displayedHoldings.length} visible / {holdings.length} total records
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(180px,1fr)_140px_150px] gap-2 w-full xl:w-auto">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-muted-fg absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={holdingSearch}
                    onChange={(event) => setHoldingSearch(event.target.value)}
                    placeholder="Search holdings..."
                    className="h-9 w-full rounded-xl border border-border bg-card/90 backdrop-blur-md pl-9 pr-3 text-[11px] font-bold text-foreground outline-none placeholder:text-muted-fg"
                  />
                </div>
                <div className="relative">
                  <Filter className="w-3.5 h-3.5 text-muted-fg absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={holdingCategory}
                    onChange={(event) => setHoldingCategory(event.target.value as "All" | Holding["category"])}
                    className="h-9 w-full rounded-xl border border-border bg-card/90 backdrop-blur-md pl-9 pr-3 text-[10px] font-black uppercase tracking-wider text-foreground outline-none"
                  >
                    <option value="All">All groups</option>
                    {holdingCategories.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <select
                  value={holdingSort}
                  onChange={(event) => setHoldingSort(event.target.value as "value" | "pnl" | "symbol")}
                  className="h-9 rounded-xl border border-border bg-card/90 backdrop-blur-md px-3 text-[10px] font-black uppercase tracking-wider text-foreground outline-none"
                >
                  <option value="value">Sort by value</option>
                  <option value="pnl">Sort by P/L</option>
                  <option value="symbol">Sort by symbol</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse" id="holdings-table">
                <thead>
                  <tr className="bg-card/90 backdrop-blur-md border border-border text-[#FFD600] font-black uppercase text-[10px] tracking-widest border-b border-border">
                    <th className="px-6 py-4">Asset / Category</th>
                    <th className="px-6 py-4 text-right">Qty</th>
                    <th className="px-6 py-4 text-right">Avg Cost</th>
                    <th className="px-6 py-4 text-right">Current Price</th>
                    <th className="px-6 py-4 text-right">Current Value</th>
                    <th className="px-6 py-4 text-right">Unrealized P/L</th>
                    <th className="px-6 py-4 text-right">Telemetry Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {displayedHoldings.map(({ holding: h, sourceCurrency, currentPrice, currentValue, unrealizedPnL, unrealizedPnLPercent }) => {
                    const charCode = h.asset.charAt(0);
                    const isPnLPositive = unrealizedPnL >= 0;
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
                          {formatMoney(h.avgCost, sourceCurrency)}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-xs text-foreground/85 font-semibold">
                          {formatMoney(currentPrice, sourceCurrency)}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-xs text-foreground font-black">
                          {formatMoney(currentValue, sourceCurrency)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className={`font-mono text-xs font-black ${isPnLPositive ? "text-success" : "text-danger"}`}>
                              {isPnLPositive ? "+" : "-"}{formatMoney(Math.abs(unrealizedPnL), sourceCurrency)}
                            </span>
                            <span className={`text-[9px] font-black border border-border px-1.5 py-0.5 rounded-lg ${
                              isPnLPositive ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                            }`}>
                              {isPnLPositive ? "+" : ""}{unrealizedPnLPercent.toFixed(2)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => onViewAssetDetail?.(h.asset)}
                              disabled={!onViewAssetDetail}
                              className="p-1 px-2 text-foreground hover:text-primary border border-border hover:bg-card/90 backdrop-blur-md bg-card/90 backdrop-blur-md rounded-xl transition-all cursor-pointer shadow-lg shadow-black/5 dark:shadow-black/20 disabled:opacity-40 disabled:cursor-not-allowed"
                              title="View asset detail"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onRemoveHolding(h.id)}
                              className="p-1 px-2 text-foreground hover:text-danger border border-border hover:bg-card/90 backdrop-blur-md bg-card/90 backdrop-blur-md rounded-xl transition-all cursor-pointer shadow-lg shadow-black/5 dark:shadow-black/20"
                              title="Remove transaction"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {displayedHoldings.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-foreground/40 text-xs font-black uppercase">
                        {holdings.length === 0
                          ? "No transactions registered in this portfolio. Click \"Add Transaction\" to insert targets."
                          : "No holdings match the active filters."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 border-t border-border text-foregroundenter bg-background">
            <span className="text-xs font-black uppercase tracking-wider text-foreground hover:underline cursor-pointer">
              Showing {displayedHoldings.length} of {holdings.length} holdings
            </span>
          </div>
        </div>

        {/* Right Widgets Column (1 width) */}
        <div className="space-y-6" id="portfolio-right-column">
          <div className="bg-card/90 backdrop-blur-md border border-border p-6 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20" id="asset-allocation-card">
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
                          formatter={(value: any) => [formatMoney(Number(value), "$"), 'Value']}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-card/90 backdrop-blur-md border border-border/60 backdrop-blur-xs p-4" onClick={() => setIsAddOpen(false)}>
          <div 
            className="bg-card/90 backdrop-blur-md rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 w-full max-w-md overflow-hidden border border-border animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-border flex items-center justify-between bg-accent">
              <div className="flex items-center gap-2 text-foreground">
                <div className="p-1 px-1.5 bg-card/90 backdrop-blur-md border border-border text-[#FFD600] rounded-xl border border-border">
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
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card/90 backdrop-blur-md text-foreground font-semibold focus:outline-none"
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
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card/90 backdrop-blur-md text-foreground font-semibold focus:outline-none"
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
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card/90 backdrop-blur-md text-foreground font-semibold focus:outline-none"
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
