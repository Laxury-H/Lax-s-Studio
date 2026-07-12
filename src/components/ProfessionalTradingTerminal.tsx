import React, { useState, useEffect, useRef } from "react";
import { Search, Info, TrendingUp, TrendingDown, Play, ChevronDown, X } from "lucide-react";
import TradingViewChart from "./TradingViewChart";

interface OpenPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  qty: number;
  leverage: number;
  margin: number;
  addedAt: string;
  marginMode?: "CROSS" | "ISOLATED";
  stopLoss?: number | null;
  takeProfit?: number | null;
}

interface ScannerItem {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
}

interface ProfessionalTradingTerminalProps {
  balance: number;
  totalMargin: number;
  totalUnrealizedPnl: number;
  accountEquity: number;
  
  selectedSymbol: string;
  setSelectedSymbol: (sym: string) => void;
  
  marketPrices: Record<string, number>;
  scannerData: ScannerItem[];
  
  fundingRate: number;
  fundingTimeLeft: number;
  
  marginMode: "CROSS" | "ISOLATED";
  setMarginMode: (mode: "CROSS" | "ISOLATED") => void;
  
  leverage: number;
  setLeverage: (lev: number) => void;
  
  orderType: "USDT" | "COIN";
  setOrderType: (type: "USDT" | "COIN") => void;
  
  orderSize: string;
  setOrderSize: (size: string) => void;
  
  stopLoss: string;
  setStopLoss: (sl: string) => void;
  
  takeProfit: string;
  setTakeProfit: (tp: string) => void;
  
  handlePlaceOrder: (side: "LONG" | "SHORT") => Promise<void>;
  actionLoading: boolean;
  formError: string | null;
  formSuccess: string | null;
  
  estimatedLiqPrice: { longLiq: number; shortLiq: number } | null;
  rrRatio: string | null;
  
  positions: OpenPosition[];
  handleClosePosition: (sym: string) => void;
  handleUpdateSlTp: (sym: string, sl: number | null, tp: number | null) => void;
  
  onExit: () => void;
  onOpenSettings?: () => void;
  isRealAccount?: boolean;
}

export default function ProfessionalTradingTerminal({
  balance, totalMargin, totalUnrealizedPnl, accountEquity,
  selectedSymbol, setSelectedSymbol, marketPrices, scannerData,
  fundingRate, fundingTimeLeft,
  marginMode, setMarginMode, leverage, setLeverage,
  orderType, setOrderType, orderSize, setOrderSize,
  stopLoss, setStopLoss, takeProfit, setTakeProfit,
  handlePlaceOrder, actionLoading, formError, formSuccess,
  estimatedLiqPrice, rrRatio,
  positions, handleClosePosition, handleUpdateSlTp,
  onExit, onOpenSettings, isRealAccount
}: ProfessionalTradingTerminalProps) {

  const currentPrice = marketPrices[selectedSymbol] || 0;
  const currentCoinInfo = scannerData.find(c => c.symbol === selectedSymbol) || { change24h: 0, volume24h: 0 };
  const isPosChange = currentCoinInfo.change24h >= 0;

  // Tabs states
  const [leftChartTab, setLeftChartTab] = useState<"Chart" | "Info">("Chart");
  const [leftBottomTab, setLeftBottomTab] = useState<"Positions" | "Open Orders" | "Order History">("Positions");
  const [orderMode, setOrderMode] = useState<"Limit" | "Market" | "Stop Limit">("Market");
  const [useTpSl, setUseTpSl] = useState(false);

  // Dropdown Search State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);

  // Real-time Data generation for Order Book and Market Trades
  const [orderBook, setOrderBook] = useState<{asks: any[], bids: any[]}>({asks: [], bids: []});
  const [marketTrades, setMarketTrades] = useState<any[]>([]);

  // Handle click outside for dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Clear TP/SL when unchecked
  useEffect(() => {
    if (!useTpSl) {
      setStopLoss("");
      setTakeProfit("");
    }
  }, [useTpSl, setStopLoss, setTakeProfit]);

  // WebSocket Connection for Order Book and Market Trades
  useEffect(() => {
    if (!selectedSymbol) return;

    setOrderBook({asks: [], bids: []});
    setMarketTrades([]);

    const symbolWs = selectedSymbol.toLowerCase();
    const wsUrl = `wss://fstream.binance.com/stream?streams=${symbolWs}@depth20@100ms/${symbolWs}@trade`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (!data.stream) return;

      if (data.stream.endsWith("@depth20@100ms")) {
        const payload = data.data;
        
        let askTotal = 0;
        const newAsks = payload.a.map((item: string[]) => {
          const size = parseFloat(item[1]);
          askTotal += size;
          return { price: parseFloat(item[0]), size, total: askTotal };
        });
        newAsks.reverse();

        let bidTotal = 0;
        const newBids = payload.b.map((item: string[]) => {
          const size = parseFloat(item[1]);
          bidTotal += size;
          return { price: parseFloat(item[0]), size, total: bidTotal };
        });

        setOrderBook({ asks: newAsks, bids: newBids });
      } else if (data.stream.endsWith("@trade")) {
        const payload = data.data;
        const newTrade = {
          price: parseFloat(payload.p),
          amount: parseFloat(payload.q),
          time: new Date(payload.T).toLocaleTimeString([], { hour12: false }),
          isBuy: !payload.m // Maker is buyer means sell order, so if m is false, it's a buy order
        };
        
        setMarketTrades(prev => [newTrade, ...prev].slice(0, 30));
      }
    };

    return () => {
      ws.close();
    };
  }, [selectedSymbol]);

  const filteredCoins = scannerData.filter(coin => 
    coin.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] bg-background text-foreground text-xs font-sans overflow-hidden -mx-4 -my-4 sm:-mx-8 sm:-my-8" style={{fontFamily: "'Inter', sans-serif"}}>
      
      {/* 1. Ticker Top Bar */}
      <div className="flex items-center justify-between px-4 h-14 bg-card border-b border-border shrink-0 z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 relative" ref={searchRef}>
            <button onClick={onExit} className="text-muted-fg hover:text-foreground mr-2 text-base font-black">
              ←
            </button>
            
            <div 
              className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 py-1 px-2 rounded-lg transition-colors -ml-2"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
            >
              <div>
                <h1 className="text-foreground text-lg font-bold flex items-center gap-2">
                  {selectedSymbol}
                  <ChevronDown className="w-4 h-4 text-muted-fg" />
                </h1>
              </div>
            </div>

            {/* Dropdown Menu */}
            {isSearchOpen && (
              <div className="absolute top-[110%] left-6 w-80 bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-3 border-b border-border flex items-center gap-2 bg-background/50">
                  <Search className="w-4 h-4 text-muted-fg" />
                  <input 
                    type="text" 
                    placeholder="Search coin..." 
                    autoFocus
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="bg-transparent outline-none text-foreground w-full text-sm font-medium"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="text-muted-fg hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-card/95 backdrop-blur z-10 text-[10px] text-muted-fg uppercase">
                      <tr>
                        <th className="py-2 pl-4 font-semibold">Symbol</th>
                        <th className="py-2 font-semibold">Price</th>
                        <th className="py-2 pr-4 text-right font-semibold">24h Chg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCoins.map(coin => (
                        <tr 
                          key={coin.symbol} 
                          className={`cursor-pointer hover:bg-muted/50 transition-colors ${coin.symbol === selectedSymbol ? 'bg-muted' : ''}`}
                          onClick={() => {
                            setSelectedSymbol(coin.symbol);
                            setIsSearchOpen(false);
                            setSearchQuery("");
                          }}
                        >
                          <td className="py-3 pl-4 font-bold text-foreground">{coin.symbol}</td>
                          <td className="py-3 text-foreground font-medium">{coin.price.toFixed(4)}</td>
                          <td className={`py-3 pr-4 text-right font-semibold ${coin.change24h >= 0 ? "text-success" : "text-danger"}`}>
                            {coin.change24h > 0 ? "+" : ""}{coin.change24h.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                      {filteredCoins.length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-muted-fg">No coins found</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <span className={`text-base font-bold ${isPosChange ? 'text-success' : 'text-danger'}`}>
                {currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-foreground">${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-muted-fg text-[10px]">24h Change</span>
              <span className={`text-[11px] font-semibold ${isPosChange ? 'text-success' : 'text-danger'}`}>
                {isPosChange ? '+' : ''}{currentCoinInfo.change24h.toFixed(2)}%
              </span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-muted-fg text-[10px]">24h Volume(USDT)</span>
              <span className="text-foreground text-[11px] font-semibold">
                {(currentCoinInfo.volume24h / 1000000).toFixed(2)}M
              </span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-muted-fg text-[10px]">Funding / Countdown</span>
              <span className="text-yellow-600 dark:text-[#fcd535] text-[11px] font-semibold">
                {(fundingRate * 100).toFixed(4)}% / {Math.floor(fundingTimeLeft / 3600).toString().padStart(2, '0')}:{Math.floor((fundingTimeLeft % 3600) / 60).toString().padStart(2, '0')}:{(fundingTimeLeft % 60).toString().padStart(2, '0')}
              </span>
            </div>

            {onOpenSettings && (
              <div className="flex flex-col ml-4 border-l border-border pl-4">
                <button 
                  onClick={onOpenSettings}
                  className="text-[10px] flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-muted-fg hover:text-foreground font-semibold"
                >
                  API Settings
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Main 3-Column Grid */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* LEFT COLUMN: Chart + Positions */}
        <div className="flex flex-col flex-1 min-w-[50%] border-r border-border">
          {/* Chart Header */}
          <div className="h-10 border-b border-border flex items-center px-4 gap-4 bg-card shrink-0">
            <button 
              onClick={() => setLeftChartTab("Chart")}
              className={`${leftChartTab === "Chart" ? "text-foreground font-semibold border-b-2 border-yellow-600 dark:border-[#fcd535]" : "text-muted-fg hover:text-foreground"} h-full`}
            >
              Chart
            </button>
            <button 
              onClick={() => setLeftChartTab("Info")}
              className={`${leftChartTab === "Info" ? "text-foreground font-semibold border-b-2 border-yellow-600 dark:border-[#fcd535]" : "text-muted-fg hover:text-foreground"} h-full`}
            >
              Info
            </button>
          </div>
          
          {/* Chart Area */}
          <div className="flex-1 bg-background relative min-h-[300px]">
            {leftChartTab === "Chart" ? (
              <>
                <TradingViewChart
                  symbol={selectedSymbol.includes(":") ? selectedSymbol : `BINANCE:${selectedSymbol}.P`}
                  interval="15"
                  containerId="tv_pro_terminal"
                />
                
                {/* Floating Real-time Chart Overlay */}
                {positions.filter(p => p.symbol === selectedSymbol).map((pos, idx) => {
                  const posPrice = marketPrices[pos.symbol] || pos.entryPrice;
                  const isLong = pos.side === "LONG";
                  const pnl = isLong ? pos.qty * (posPrice - pos.entryPrice) : pos.qty * (pos.entryPrice - posPrice);
                  const roe = (pnl / pos.margin) * 100;
                  const isProfitable = pnl >= 0;
                  
                  // Calculate Liquidation (Rough Estimate for Isolated)
                  const liqPrice = isLong 
                    ? pos.entryPrice * (1 - 1/pos.leverage)
                    : pos.entryPrice * (1 + 1/pos.leverage);
                  
                  return (
                    <div key={idx} className="absolute top-4 left-4 z-10 glass-panel bg-card/80 backdrop-blur-md border border-border p-3 rounded-xl shadow-2xl min-w-[200px] animate-in fade-in slide-in-from-top-4">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isLong ? 'bg-success' : 'bg-danger'} animate-pulse`}></span>
                          <span className={`font-bold text-[11px] ${isLong ? 'text-success' : 'text-danger'}`}>{pos.side} {pos.leverage}x</span>
                        </div>
                        <span className="text-muted-fg text-[10px]">Open Position</span>
                      </div>
                      
                      <div className="space-y-1 mt-2">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-fg">Entry Price</span>
                          <span className="text-foreground font-mono">{pos.entryPrice.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-fg">Mark Price</span>
                          <span className="text-foreground font-mono">{posPrice.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-fg">Liq. Price</span>
                          <span className="text-warning font-mono">{liqPrice.toFixed(4)}</span>
                        </div>
                        
                        <div className="pt-2 mt-2 border-t border-border/50 flex justify-between items-end">
                          <span className="text-muted-fg text-[11px]">Unrealized PnL</span>
                          <div className="text-right">
                            <div className={`font-mono font-bold text-[13px] ${isProfitable ? 'text-success' : 'text-danger'}`}>
                              {isProfitable ? '+' : ''}{pnl.toFixed(2)} USDT
                            </div>
                            <div className={`font-mono text-[10px] ${isProfitable ? 'text-success' : 'text-danger'}`}>
                              {isProfitable ? '+' : ''}{roe.toFixed(2)}%
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-fg p-8">
                <div className="text-center space-y-4">
                  <Info className="w-12 h-12 mx-auto text-muted-fg/50" />
                  <h3 className="text-lg text-foreground font-semibold">Coin Information</h3>
                  <p>Detailed information about {selectedSymbol} would be displayed here.</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Positions Area */}
          <div className="h-[30%] min-h-[200px] border-t border-border bg-card flex flex-col">
            <div className="flex items-center h-10 border-b border-border px-4 gap-6 shrink-0">
              <button 
                onClick={() => setLeftBottomTab("Positions")}
                className={`${leftBottomTab === "Positions" ? "text-foreground font-semibold border-b-2 border-yellow-600 dark:border-[#fcd535]" : "text-muted-fg hover:text-foreground"} h-full`}
              >
                Positions ({positions.length})
              </button>
              <button 
                onClick={() => setLeftBottomTab("Open Orders")}
                className={`${leftBottomTab === "Open Orders" ? "text-foreground font-semibold border-b-2 border-yellow-600 dark:border-[#fcd535]" : "text-muted-fg hover:text-foreground"} h-full`}
              >
                Open Orders (0)
              </button>
              <button 
                onClick={() => setLeftBottomTab("Order History")}
                className={`${leftBottomTab === "Order History" ? "text-foreground font-semibold border-b-2 border-yellow-600 dark:border-[#fcd535]" : "text-muted-fg hover:text-foreground"} h-full`}
              >
                Order History
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
              {leftBottomTab === "Positions" && (
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-muted-fg">
                      <th className="font-normal pb-2 pl-2">Symbol</th>
                      <th className="font-normal pb-2">Size</th>
                      <th className="font-normal pb-2">Entry Price</th>
                      <th className="font-normal pb-2">Mark Price</th>
                      <th className="font-normal pb-2">Margin</th>
                      <th className="font-normal pb-2 text-right">PNL (ROE%)</th>
                      <th className="font-normal pb-2 text-right pr-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map(pos => {
                      const price = marketPrices[pos.symbol] || pos.entryPrice;
                      const pnl = pos.side === "LONG" ? pos.qty * (price - pos.entryPrice) : pos.qty * (pos.entryPrice - price);
                      const roe = (pnl / pos.margin) * 100;
                      return (
                        <tr key={pos.symbol} className="hover:bg-muted transition-colors group border-b border-border/50 last:border-0">
                          <td className="py-2 pl-2">
                            <span className="text-foreground font-semibold">{pos.symbol}</span>
                            <span className={`ml-2 text-[10px] px-1 rounded ${pos.side === "LONG" ? "bg-success/20 text-success" : "bg-danger/20 text-danger"}`}>
                              {pos.leverage}x {pos.side}
                            </span>
                          </td>
                          <td className="py-2 text-foreground">{pos.qty.toFixed(4)}</td>
                          <td className="py-2 text-foreground">{pos.entryPrice.toFixed(4)}</td>
                          <td className="py-2 text-foreground">{price.toFixed(4)}</td>
                          <td className="py-2 text-foreground">{pos.margin.toFixed(2)}</td>
                          <td className={`py-2 text-right ${pnl >= 0 ? "text-success" : "text-danger"}`}>
                            {pnl > 0 ? "+" : ""}{pnl.toFixed(2)} ({roe.toFixed(2)}%)
                          </td>
                          <td className="py-2 text-right pr-2">
                            <button onClick={() => handleClosePosition(pos.symbol)} className="text-muted-fg hover:text-foreground underline">Close</button>
                          </td>
                        </tr>
                      );
                    })}
                    {positions.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-8 text-muted-fg">No open positions</td></tr>
                    )}
                  </tbody>
                </table>
              )}
              {leftBottomTab === "Open Orders" && (
                <div className="flex items-center justify-center h-full text-muted-fg p-8">
                  No open orders
                </div>
              )}
              {leftBottomTab === "Order History" && (
                <div className="flex items-center justify-center h-full text-muted-fg p-8">
                  No order history
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* MIDDLE COLUMN: Order Book + Trades */}
        <div className="w-[280px] flex flex-col border-r border-border bg-card shrink-0">
          {/* Order Book Header */}
          <div className="h-10 border-b border-border flex items-center px-4 gap-4 shrink-0">
            <span className="text-foreground font-semibold">Order Book</span>
          </div>
          <div className="flex justify-between px-4 py-1 text-[10px] text-muted-fg">
            <span>Price(USDT)</span>
            <span>Size(Coin)</span>
          </div>
          
          {/* Asks (Red) */}
          <div className="flex-1 flex flex-col justify-end overflow-hidden pb-1 px-1 min-h-[150px]">
            {orderBook.asks.map((ask, i) => (
              <div key={i} className="flex justify-between text-[11px] relative h-[18px] items-center cursor-pointer hover:bg-muted">
                <div className="absolute right-0 top-0 bottom-0 bg-danger/10" style={{width: `${Math.min(100, (ask.total / Math.max(...orderBook.asks.map(a => a.total), 1)) * 100)}%`}}></div>
                <span className="text-danger pl-3 z-10">{ask.price.toFixed(4)}</span>
                <span className="text-foreground pr-3 z-10">{ask.size.toFixed(3)}</span>
              </div>
            ))}
          </div>
          
          {/* Middle Price Display */}
          <div className="flex items-center justify-center py-2 border-y border-border">
            <span className={`text-lg font-bold ${isPosChange ? 'text-success' : 'text-danger'}`}>
              {currentPrice.toFixed(4)}
            </span>
          </div>
          
          {/* Bids (Green) */}
          <div className="flex-1 flex flex-col overflow-hidden pt-1 px-1 min-h-[150px]">
            {orderBook.bids.map((bid, i) => (
              <div key={i} className="flex justify-between text-[11px] relative h-[18px] items-center cursor-pointer hover:bg-muted">
                <div className="absolute right-0 top-0 bottom-0 bg-success/10" style={{width: `${Math.min(100, (bid.total / Math.max(...orderBook.bids.map(b => b.total), 1)) * 100)}%`}}></div>
                <span className="text-success pl-3 z-10">{bid.price.toFixed(4)}</span>
                <span className="text-foreground pr-3 z-10">{bid.size.toFixed(3)}</span>
              </div>
            ))}
          </div>
          
          {/* Market Trades */}
          <div className="h-[35%] border-t border-border flex flex-col shrink-0 min-h-[150px]">
            <div className="h-8 border-b border-border flex items-center px-4 shrink-0">
              <span className="text-foreground font-semibold text-[11px]">Market Trades</span>
            </div>
            <div className="flex-1 overflow-y-hidden px-1 pt-1">
              {marketTrades.map((trade, i) => (
                <div key={i} className="flex justify-between text-[11px] h-[18px] items-center px-3 hover:bg-muted cursor-pointer transition-colors">
                  <span className={trade.isBuy ? "text-success" : "text-danger"}>{trade.price.toFixed(4)}</span>
                  <span className="text-foreground">{trade.amount.toFixed(3)}</span>
                  <span className="text-muted-fg text-[10px]">{trade.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* RIGHT COLUMN: Order Entry */}
        <div className="w-[300px] bg-card flex flex-col shrink-0 overflow-y-auto custom-scrollbar relative">
          <div className="p-4 space-y-4">
            
            {/* Margin Mode & Leverage */}
            <div className="flex justify-between items-center bg-muted rounded px-1 py-1">
              <div className="flex gap-1 w-[60%]">
                <button onClick={() => setMarginMode("CROSS")} className={`flex-1 py-1 text-center rounded ${marginMode === "CROSS" ? "bg-background text-foreground shadow-sm" : "text-muted-fg hover:text-foreground"}`}>Cross</button>
                <button onClick={() => setMarginMode("ISOLATED")} className={`flex-1 py-1 text-center rounded ${marginMode === "ISOLATED" ? "bg-background text-foreground shadow-sm" : "text-muted-fg hover:text-foreground"}`}>Isolated</button>
              </div>
              <button className="flex items-center gap-1 bg-background px-3 py-1 rounded text-foreground shadow-sm">
                {leverage}x <TrendingUp className="w-3 h-3 text-yellow-600 dark:text-[#fcd535]"/>
              </button>
            </div>
            
            <input type="range" min="1" max="100" value={leverage} onChange={e => setLeverage(Number(e.target.value))} className="w-full accent-yellow-600 dark:accent-[#fcd535]" />
            
            {/* Order Type Tabs */}
            <div className="flex gap-4 text-muted-fg text-[13px] font-semibold border-b border-border pb-2">
              <button 
                disabled
                title="Not Supported Yet"
                className="opacity-50 cursor-not-allowed"
              >
                Limit
              </button>
              <button 
                onClick={() => setOrderMode("Market")} 
                className={orderMode === "Market" ? "text-yellow-600 dark:text-[#fcd535]" : "hover:text-foreground"}
              >
                Market
              </button>
              <button 
                disabled
                title="Not Supported Yet"
                className="opacity-50 cursor-not-allowed"
              >
                Stop Limit
              </button>
            </div>
            
            <div className="bg-muted/50 rounded-md p-3 space-y-3">
              {/* Avail Balance */}
              <div className="flex justify-between text-muted-fg">
                <span>{isRealAccount ? "Binance Avail" : "Demo Avail"}</span>
                <span className="text-foreground">{balance.toFixed(2)} USDT</span>
              </div>
              
              {/* Inputs */}
              <div className="space-y-3">
                <div className={`flex items-center bg-background rounded px-3 py-2 border ${orderMode !== "Market" ? "border-transparent focus-within:border-yellow-600 dark:focus-within:border-[#fcd535]" : "border-transparent opacity-50"}`}>
                  <span className="text-muted-fg w-12">Price</span>
                  <input type="text" value={orderMode === "Market" ? "Market Price" : currentPrice.toFixed(2)} readOnly className="bg-transparent text-right w-full outline-none text-foreground" />
                  <span className="text-foreground ml-2">USDT</span>
                </div>
                
                <div className="flex items-center bg-background rounded px-3 py-2 border border-transparent focus-within:border-yellow-600 dark:focus-within:border-[#fcd535]">
                  <span className="text-muted-fg w-12">Size</span>
                  <input type="number" value={orderSize} onChange={e => setOrderSize(e.target.value)} className="bg-transparent text-right w-full outline-none text-foreground" />
                  <span className="text-foreground ml-2">{orderType}</span>
                </div>
              </div>
              
              <div className="flex justify-between items-center pt-2">
                <div className="flex gap-2">
                  <button onClick={() => setOrderType("USDT")} className={`text-[10px] px-2 py-0.5 rounded ${orderType === "USDT" ? "bg-yellow-600 text-white dark:bg-[#fcd535] dark:text-black" : "bg-background text-foreground"}`}>USDT</button>
                  <button onClick={() => setOrderType("COIN")} className={`text-[10px] px-2 py-0.5 rounded ${orderType === "COIN" ? "bg-yellow-600 text-white dark:bg-[#fcd535] dark:text-black" : "bg-background text-foreground"}`}>COIN</button>
                </div>
              </div>
              
              {/* SL / TP */}
              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="tpSl" checked={useTpSl} onChange={(e) => setUseTpSl(e.target.checked)} className="accent-yellow-600 dark:accent-[#fcd535]"/>
                <label htmlFor="tpSl" className="text-muted-fg cursor-pointer select-none">TP/SL</label>
              </div>
              
              {useTpSl && (
                <div className="grid grid-cols-2 gap-2 animate-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center bg-background rounded px-2 py-1.5 focus-within:border-yellow-600 dark:focus-within:border-[#fcd535] border border-transparent">
                    <input type="number" placeholder="Take Profit" value={takeProfit} onChange={e => setTakeProfit(e.target.value)} className="bg-transparent w-full outline-none text-foreground text-[11px]" />
                  </div>
                  <div className="flex items-center bg-background rounded px-2 py-1.5 focus-within:border-yellow-600 dark:focus-within:border-[#fcd535] border border-transparent">
                    <input type="number" placeholder="Stop Loss" value={stopLoss} onChange={e => setStopLoss(e.target.value)} className="bg-transparent w-full outline-none text-foreground text-[11px]" />
                  </div>
                </div>
              )}
              
              {/* Real-Time Dynamic Calculations Panel */}
              <div className="pt-4 pb-2 space-y-2 text-[11px]">
                <div className="p-3 bg-muted/50 rounded-lg border border-border space-y-2 relative overflow-hidden glass-panel transition-all duration-300">
                  <div className="absolute inset-0 bg-primary/5 animate-pulse rounded-lg pointer-events-none"></div>
                  
                  <div className="flex justify-between items-center relative z-10">
                    <span className="text-muted-fg font-medium">Req. Margin</span>
                    <span className="text-foreground font-mono">
                      {orderType === "USDT" ? (parseFloat(orderSize || "0") / leverage).toFixed(2) : ((parseFloat(orderSize || "0") * currentPrice) / leverage).toFixed(2)} USDT
                    </span>
                  </div>
                  <div className="flex justify-between items-center relative z-10">
                    <span className="text-muted-fg font-medium">Est. Fee (0.05%)</span>
                    <span className="text-foreground font-mono">
                      {orderType === "USDT" ? (parseFloat(orderSize || "0") * 0.0005).toFixed(4) : ((parseFloat(orderSize || "0") * currentPrice) * 0.0005).toFixed(4)} USDT
                    </span>
                  </div>
                  {estimatedLiqPrice !== null && (
                    <div className="flex justify-between items-center relative z-10">
                      <span className="text-muted-fg font-medium">Est. Liq. Price</span>
                      <span className="text-warning font-mono text-[10px]">
                        L: {estimatedLiqPrice.longLiq.toFixed(4)} / S: {estimatedLiqPrice.shortLiq.toFixed(4)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center relative z-10 border-t border-border/50 pt-2 mt-1">
                    <span className="text-muted-fg font-medium">Total Cost</span>
                    <span className="text-primary font-mono font-bold">
                      {orderType === "USDT" 
                        ? ((parseFloat(orderSize || "0") / leverage) + (parseFloat(orderSize || "0") * 0.0005)).toFixed(2) 
                        : (((parseFloat(orderSize || "0") * currentPrice) / leverage) + ((parseFloat(orderSize || "0") * currentPrice) * 0.0005)).toFixed(2)} USDT
                    </span>
                  </div>
                </div>
                <div className="flex justify-between px-1">
                  <span className="text-muted-fg">Max</span>
                  <span className="text-foreground">{(balance * leverage).toFixed(2)} USDT</span>
                </div>
              </div>
            </div>
            
            {/* Feedback Messages */}
            {formError && <div className="text-danger bg-danger/10 p-2 rounded border border-danger/20 text-[11px]">{formError}</div>}
            {formSuccess && <div className="text-success bg-success/10 p-2 rounded border border-success/20 text-[11px]">{formSuccess}</div>}
            
            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => handlePlaceOrder("LONG")} 
                disabled={actionLoading}
                className="flex-1 bg-success hover:bg-success/90 text-white font-bold py-3 rounded text-[13px] transition-colors flex items-center justify-center"
              >
                Buy / Long
              </button>
              <button 
                onClick={() => handlePlaceOrder("SHORT")} 
                disabled={actionLoading}
                className="flex-1 bg-danger hover:bg-danger/90 text-white font-bold py-3 rounded text-[13px] transition-colors flex items-center justify-center"
              >
                Sell / Short
              </button>
            </div>
            
            {/* Margin Usage Summary at Bottom */}
            <div className="pt-6 mt-6 border-t border-border space-y-2">
              <h3 className="text-foreground font-semibold pb-1">Margin Ratio</h3>
              <div className="flex justify-between">
                <span className="text-muted-fg">Margin Balance</span>
                <span className="text-foreground">{balance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-fg">Position Margin</span>
                <span className="text-foreground">{totalMargin.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-fg">Unrealized PNL</span>
                <span className={totalUnrealizedPnl >= 0 ? "text-success" : "text-danger"}>{totalUnrealizedPnl > 0 ? "+" : ""}{totalUnrealizedPnl.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-fg">Equity</span>
                <span className="text-foreground">{accountEquity.toFixed(2)}</span>
              </div>
            </div>
            
          </div>
        </div>
        
      </div>
    </div>
  );
}
