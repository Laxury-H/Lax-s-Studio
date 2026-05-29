import React, { useMemo, useEffect } from "react";
import { X, Sparkles, TrendingUp, TrendingDown, Activity, ChevronUp, ChevronDown } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { MarketAsset } from "../types";

interface AssetDetailModalProps {
  asset: MarketAsset;
  onClose: () => void;
  onAnalyze: (symbol: string) => void;
}

export default function AssetDetailModal({ asset, onClose, onAnalyze }: AssetDetailModalProps) {
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

  useEffect(() => {
    let mounted = true;
    setIsLoadingChart(true);
    
    fetch(`/api/historical-data/${asset.symbol}`)
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
  }, [asset.symbol]);

  // Custom Tooltip for Recharts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border p-3 shadow-xl rounded-xl">
          <p className="text-[10px] font-black uppercase text-muted-fg tracking-wider mb-1">{label}</p>
          <p className="text-sm font-mono font-black text-foreground">
            {asset.currencySymbol || "$"}{payload[0].value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative bg-card w-full max-w-4xl max-h-full overflow-y-auto border border-border rounded-2xl shadow-2xl flex flex-col shadow-black/20 animate-fade-in" onClick={e => e.stopPropagation()}>
        
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
          
          <button 
            onClick={onClose}
            className="p-2 bg-muted hover:bg-border text-foreground rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-8 flex-1">
          
          {/* Top Metrics Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-background border border-border p-4 rounded-xl">
              <span className="text-[10px] font-black text-muted-fg uppercase tracking-wider block mb-1">Current Price</span>
              <div className="flex items-baseline gap-2">
                <span className="font-mono font-black text-2xl text-foreground">
                  {asset.currencySymbol || "$"}{asset.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
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
          <div className="bg-background border border-border rounded-xl p-6 relative">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                <h3 className="font-sans font-black text-xs uppercase tracking-wider text-foreground">
                  30-Day Price Trend {isSimulated ? "(Simulated Fallback)" : "(Real Data)"}
                </h3>
              </div>
            </div>
            
            <div className="h-72 w-full">
              {isLoadingChart ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-foreground/50">
                  <Activity className="w-8 h-8 animate-pulse mb-2 text-[#0047FF]" />
                  <span className="text-xs font-black uppercase tracking-wider">Loading Historical Data...</span>
                </div>
              ) : error ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-danger">
                  <span className="text-xs font-black uppercase tracking-wider">Error: {error}</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={strokeColor} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: 'var(--muted-fg)', fontWeight: 700 }}
                      dy={10}
                      minTickGap={30}
                    />
                    <YAxis 
                      domain={['dataMin', 'dataMax']} 
                      hide={true} 
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area 
                      type="monotone" 
                      dataKey="price" 
                      stroke={strokeColor} 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill={`url(#${gradientId})`} 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Additional Details & Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-background border border-border rounded-xl p-6">
              <h3 className="font-sans font-black text-xs uppercase tracking-wider text-foreground mb-4">Technical Data</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="font-bold text-muted-fg uppercase tracking-wider text-[10px]">P/E Ratio</span>
                  <span className="font-mono font-bold text-foreground">{asset.peRatio}</span>
                </div>

                <div className="flex justify-between border-b border-border pb-2">
                  <span className="font-bold text-muted-fg uppercase tracking-wider text-[10px]">Data Quality</span>
                  <span className="font-mono font-bold text-foreground uppercase">{asset.dataQuality || "unknown"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-muted-fg uppercase tracking-wider text-[10px]">Last Updated</span>
                  <span className="font-mono font-bold text-foreground">
                    {asset.updatedAt ? new Date(asset.updatedAt).toLocaleTimeString() : "--:--"}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-background border border-border rounded-xl p-6 flex flex-col justify-center text-center space-y-4">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
                <Sparkles className="w-6 h-6 fill-current" />
              </div>
              <div>
                <h3 className="font-sans font-black text-sm uppercase tracking-wider text-foreground mb-2">Neural Analysis</h3>
                <p className="text-xs text-foreground/60 font-semibold mb-6 max-w-xs mx-auto">
                  Execute a deep dive technical and fundamental review using the FinPilot AI Engine.
                </p>
              </div>
              <button
                onClick={() => {
                  onAnalyze(asset.symbol);
                  onClose();
                }}
                className="w-full bg-primary text-primary-fg hover:bg-accent hover:text-accent-fg border border-border font-black uppercase text-xs tracking-wider py-4 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 fill-current" />
                Analyze with AI
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
