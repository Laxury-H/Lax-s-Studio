import React, { useState, useEffect } from "react";
import { Search, Info, TrendingUp, TrendingDown, Play } from "lucide-react";
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
  onExit
}: ProfessionalTradingTerminalProps) {

  const currentPrice = marketPrices[selectedSymbol] || 0;
  const currentCoinInfo = scannerData.find(c => c.symbol === selectedSymbol) || { change24h: 0, volume24h: 0 };
  const isPosChange = currentCoinInfo.change24h >= 0;

  // Mock Data generation for Order Book and Market Trades
  const [orderBook, setOrderBook] = useState<{asks: any[], bids: any[]}>({asks: [], bids: []});
  const [marketTrades, setMarketTrades] = useState<any[]>([]);

  useEffect(() => {
    if (!currentPrice) return;
    // Generate static mock order book around current price
    const asks = Array.from({length: 14}).map((_, i) => {
      const price = currentPrice * (1 + (14-i)*0.0005);
      const size = Math.random() * 5 + 0.1;
      return { price, size, total: 0 };
    });
    const bids = Array.from({length: 14}).map((_, i) => {
      const price = currentPrice * (1 - (i+1)*0.0005);
      const size = Math.random() * 5 + 0.1;
      return { price, size, total: 0 };
    });
    
    // Calculate cumulative totals
    let askTotal = 0;
    asks.forEach((a, i) => { askTotal += a.size; asks[i].total = askTotal; });
    let bidTotal = 0;
    bids.forEach((b, i) => { bidTotal += b.size; bids[i].total = bidTotal; });
    
    setOrderBook({ asks, bids });
    
    // Generate initial market trades
    const initialTrades = Array.from({length: 20}).map(() => ({
      price: currentPrice * (1 + (Math.random() - 0.5) * 0.001),
      amount: Math.random() * 2 + 0.01,
      time: new Date(Date.now() - Math.random() * 10000).toLocaleTimeString([], { hour12: false }),
      isBuy: Math.random() > 0.5
    })).sort((a, b) => a.time > b.time ? -1 : 1);
    setMarketTrades(initialTrades);
    
    // Simulate live trades
    const interval = setInterval(() => {
      setMarketTrades(prev => {
        const newTrade = {
          price: currentPrice * (1 + (Math.random() - 0.5) * 0.001),
          amount: Math.random() * 2 + 0.01,
          time: new Date().toLocaleTimeString([], { hour12: false }),
          isBuy: Math.random() > 0.5
        };
        return [newTrade, ...prev].slice(0, 30);
      });
    }, 2000);
    
    return () => clearInterval(interval);
  }, [currentPrice]);

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] bg-[#0b0e11] text-[#b7bdc6] text-xs font-sans overflow-hidden -mx-4 -my-4 sm:-mx-8 sm:-my-8" style={{fontFamily: "'Inter', sans-serif"}}>
      
      {/* 1. Ticker Top Bar */}
      <div className="flex items-center justify-between px-4 h-14 bg-[#181a20] border-b border-[#2b3139] shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <button onClick={onExit} className="text-[#848e9c] hover:text-[#EAECEF] mr-2 text-base font-black">
              ←
            </button>
            <div>
              <h1 className="text-[#EAECEF] text-lg font-bold">{selectedSymbol}</h1>
              <a href="#" className="text-[#0ecb81] text-[10px] underline">Bitcoin</a>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <span className={`text-base font-bold ${isPosChange ? 'text-[#0ecb81]' : 'text-[#f23645]'}`}>
                {currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-[#EAECEF]">${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-[#848e9c] text-[10px]">24h Change</span>
              <span className={`text-[11px] font-semibold ${isPosChange ? 'text-[#0ecb81]' : 'text-[#f23645]'}`}>
                {isPosChange ? '+' : ''}{currentCoinInfo.change24h.toFixed(2)}%
              </span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-[#848e9c] text-[10px]">24h Volume(USDT)</span>
              <span className="text-[#EAECEF] text-[11px] font-semibold">
                {(currentCoinInfo.volume24h / 1000000).toFixed(2)}M
              </span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-[#848e9c] text-[10px]">Funding / Countdown</span>
              <span className="text-[#fcd535] text-[11px] font-semibold">
                {(fundingRate * 100).toFixed(4)}% / {fundingTimeLeft}s
              </span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main 3-Column Grid */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* LEFT COLUMN: Chart + Positions */}
        <div className="flex flex-col flex-1 min-w-[50%] border-r border-[#2b3139]">
          {/* Chart Header */}
          <div className="h-10 border-b border-[#2b3139] flex items-center px-4 gap-4 bg-[#181a20]">
            <span className="text-[#EAECEF] font-semibold cursor-pointer">Chart</span>
            <span className="text-[#848e9c] hover:text-[#EAECEF] cursor-pointer">Info</span>
          </div>
          
          {/* Chart Area */}
          <div className="flex-1 bg-[#131722] relative min-h-[300px]">
            <TradingViewChart
              symbol={selectedSymbol.includes(":") ? selectedSymbol : `BINANCE:${selectedSymbol}.P`}
              interval="15"
              containerId="tv_pro_terminal"
            />
          </div>
          
          {/* Positions Area */}
          <div className="h-[30%] min-h-[200px] border-t border-[#2b3139] bg-[#181a20] flex flex-col">
            <div className="flex items-center h-10 border-b border-[#2b3139] px-4 gap-6 shrink-0">
              <button className="text-[#EAECEF] font-semibold border-b-2 border-[#fcd535] h-full">Positions ({positions.length})</button>
              <button className="text-[#848e9c] hover:text-[#EAECEF] font-semibold h-full">Open Orders (0)</button>
              <button className="text-[#848e9c] hover:text-[#EAECEF] font-semibold h-full">Order History</button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="text-[#848e9c]">
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
                      <tr key={pos.symbol} className="hover:bg-[#2b3139] transition-colors group">
                        <td className="py-2 pl-2">
                          <span className="text-[#EAECEF] font-semibold">{pos.symbol}</span>
                          <span className={`ml-2 text-[10px] px-1 rounded ${pos.side === "LONG" ? "bg-[#0ecb81]/20 text-[#0ecb81]" : "bg-[#f23645]/20 text-[#f23645]"}`}>
                            {pos.leverage}x {pos.side}
                          </span>
                        </td>
                        <td className="py-2 text-[#EAECEF]">{pos.qty.toFixed(4)}</td>
                        <td className="py-2 text-[#EAECEF]">{pos.entryPrice.toFixed(4)}</td>
                        <td className="py-2 text-[#EAECEF]">{price.toFixed(4)}</td>
                        <td className="py-2 text-[#EAECEF]">{pos.margin.toFixed(2)}</td>
                        <td className={`py-2 text-right ${pnl >= 0 ? "text-[#0ecb81]" : "text-[#f23645]"}`}>
                          {pnl > 0 ? "+" : ""}{pnl.toFixed(2)} ({roe.toFixed(2)}%)
                        </td>
                        <td className="py-2 text-right pr-2">
                          <button onClick={() => handleClosePosition(pos.symbol)} className="text-[#848e9c] hover:text-[#EAECEF] underline">Close</button>
                        </td>
                      </tr>
                    );
                  })}
                  {positions.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-[#848e9c]">No open positions</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
        {/* MIDDLE COLUMN: Order Book + Trades */}
        <div className="w-[280px] flex flex-col border-r border-[#2b3139] bg-[#181a20] shrink-0">
          {/* Order Book Header */}
          <div className="h-10 border-b border-[#2b3139] flex items-center px-4 gap-4 shrink-0">
            <span className="text-[#EAECEF] font-semibold">Order Book</span>
          </div>
          <div className="flex justify-between px-4 py-1 text-[10px] text-[#848e9c]">
            <span>Price(USDT)</span>
            <span>Size(Coin)</span>
          </div>
          
          {/* Asks (Red) */}
          <div className="flex-1 flex flex-col justify-end overflow-hidden pb-1 px-1 min-h-[150px]">
            {orderBook.asks.map((ask, i) => (
              <div key={i} className="flex justify-between text-[11px] relative h-[18px] items-center cursor-pointer hover:bg-[#2b3139]">
                <div className="absolute right-0 top-0 bottom-0 bg-[#f23645]/10" style={{width: `${Math.min(100, (ask.total / 100) * 100)}%`}}></div>
                <span className="text-[#f23645] pl-3 z-10">{ask.price.toFixed(2)}</span>
                <span className="text-[#EAECEF] pr-3 z-10">{ask.size.toFixed(3)}</span>
              </div>
            ))}
          </div>
          
          {/* Middle Price Display */}
          <div className="flex items-center justify-center py-2 border-y border-[#2b3139]">
            <span className={`text-lg font-bold ${isPosChange ? 'text-[#0ecb81]' : 'text-[#f23645]'}`}>
              {currentPrice.toFixed(2)}
            </span>
          </div>
          
          {/* Bids (Green) */}
          <div className="flex-1 flex flex-col overflow-hidden pt-1 px-1 min-h-[150px]">
            {orderBook.bids.map((bid, i) => (
              <div key={i} className="flex justify-between text-[11px] relative h-[18px] items-center cursor-pointer hover:bg-[#2b3139]">
                <div className="absolute right-0 top-0 bottom-0 bg-[#0ecb81]/10" style={{width: `${Math.min(100, (bid.total / 100) * 100)}%`}}></div>
                <span className="text-[#0ecb81] pl-3 z-10">{bid.price.toFixed(2)}</span>
                <span className="text-[#EAECEF] pr-3 z-10">{bid.size.toFixed(3)}</span>
              </div>
            ))}
          </div>
          
          {/* Market Trades */}
          <div className="h-[35%] border-t border-[#2b3139] flex flex-col shrink-0 min-h-[150px]">
            <div className="h-8 border-b border-[#2b3139] flex items-center px-4 shrink-0">
              <span className="text-[#EAECEF] font-semibold text-[11px]">Market Trades</span>
            </div>
            <div className="flex-1 overflow-y-hidden px-1 pt-1">
              {marketTrades.map((trade, i) => (
                <div key={i} className="flex justify-between text-[11px] h-[18px] items-center px-3">
                  <span className={trade.isBuy ? "text-[#0ecb81]" : "text-[#f23645]"}>{trade.price.toFixed(2)}</span>
                  <span className="text-[#EAECEF]">{trade.amount.toFixed(3)}</span>
                  <span className="text-[#848e9c] text-[10px]">{trade.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* RIGHT COLUMN: Order Entry */}
        <div className="w-[300px] bg-[#181a20] flex flex-col shrink-0 overflow-y-auto custom-scrollbar relative">
          <div className="p-4 space-y-4">
            
            {/* Margin Mode & Leverage */}
            <div className="flex justify-between items-center bg-[#2b3139] rounded px-1 py-1">
              <div className="flex gap-1 w-[60%]">
                <button onClick={() => setMarginMode("CROSS")} className={`flex-1 py-1 text-center rounded ${marginMode === "CROSS" ? "bg-[#3f4751] text-[#EAECEF]" : "text-[#848e9c] hover:text-[#EAECEF]"}`}>Cross</button>
                <button onClick={() => setMarginMode("ISOLATED")} className={`flex-1 py-1 text-center rounded ${marginMode === "ISOLATED" ? "bg-[#3f4751] text-[#EAECEF]" : "text-[#848e9c] hover:text-[#EAECEF]"}`}>Isolated</button>
              </div>
              <button className="flex items-center gap-1 bg-[#3f4751] px-3 py-1 rounded text-[#EAECEF]">
                {leverage}x <TrendingUp className="w-3 h-3 text-[#fcd535]"/>
              </button>
            </div>
            
            <input type="range" min="1" max="100" value={leverage} onChange={e => setLeverage(Number(e.target.value))} className="w-full accent-[#fcd535]" />
            
            {/* Order Type Tabs */}
            <div className="flex gap-4 text-[#848e9c] text-[13px] font-semibold border-b border-[#2b3139] pb-2">
              <button className="text-[#fcd535]">Limit</button>
              <button className="hover:text-[#EAECEF]">Market</button>
              <button className="hover:text-[#EAECEF]">Stop Limit</button>
            </div>
            
            <div className="bg-[#2b3139]/30 rounded-md p-3 space-y-3">
              {/* Avail Balance */}
              <div className="flex justify-between text-[#848e9c]">
                <span>Avail</span>
                <span className="text-[#EAECEF]">{balance.toFixed(2)} USDT</span>
              </div>
              
              {/* Inputs */}
              <div className="space-y-3">
                <div className="flex items-center bg-[#2b3139] rounded px-3 py-2 border border-transparent focus-within:border-[#fcd535]">
                  <span className="text-[#848e9c] w-12">Price</span>
                  <input type="text" value={currentPrice.toFixed(2)} readOnly className="bg-transparent text-right w-full outline-none text-[#EAECEF]" />
                  <span className="text-[#EAECEF] ml-2">USDT</span>
                </div>
                
                <div className="flex items-center bg-[#2b3139] rounded px-3 py-2 border border-transparent focus-within:border-[#fcd535]">
                  <span className="text-[#848e9c] w-12">Size</span>
                  <input type="number" value={orderSize} onChange={e => setOrderSize(e.target.value)} className="bg-transparent text-right w-full outline-none text-[#EAECEF]" />
                  <span className="text-[#EAECEF] ml-2">{orderType}</span>
                </div>
              </div>
              
              <div className="flex justify-between items-center pt-2">
                <div className="flex gap-2">
                  <button onClick={() => setOrderType("USDT")} className={`text-[10px] px-2 py-0.5 rounded ${orderType === "USDT" ? "bg-[#fcd535] text-black" : "bg-[#3f4751] text-[#EAECEF]"}`}>USDT</button>
                  <button onClick={() => setOrderType("COIN")} className={`text-[10px] px-2 py-0.5 rounded ${orderType === "COIN" ? "bg-[#fcd535] text-black" : "bg-[#3f4751] text-[#EAECEF]"}`}>COIN</button>
                </div>
              </div>
              
              {/* SL / TP */}
              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="tpSl" className="accent-[#fcd535]"/>
                <label htmlFor="tpSl" className="text-[#848e9c]">TP/SL</label>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center bg-[#2b3139] rounded px-2 py-1.5 focus-within:border-[#fcd535] border border-transparent">
                  <input type="number" placeholder="Take Profit" value={takeProfit} onChange={e => setTakeProfit(e.target.value)} className="bg-transparent w-full outline-none text-[#EAECEF] text-[11px]" />
                </div>
                <div className="flex items-center bg-[#2b3139] rounded px-2 py-1.5 focus-within:border-[#fcd535] border border-transparent">
                  <input type="number" placeholder="Stop Loss" value={stopLoss} onChange={e => setStopLoss(e.target.value)} className="bg-transparent w-full outline-none text-[#EAECEF] text-[11px]" />
                </div>
              </div>
              
              {/* Metrics */}
              <div className="pt-3 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-[#848e9c]">Cost</span>
                  <span className="text-[#EAECEF]">
                    {orderType === "USDT" ? (parseFloat(orderSize || "0") / leverage).toFixed(2) : ((parseFloat(orderSize || "0") * currentPrice) / leverage).toFixed(2)} USDT
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#848e9c]">Max</span>
                  <span className="text-[#EAECEF]">{(balance * leverage).toFixed(2)} USDT</span>
                </div>
              </div>
            </div>
            
            {/* Feedback Messages */}
            {formError && <div className="text-[#f23645] bg-[#f23645]/10 p-2 rounded border border-[#f23645]/20 text-[11px]">{formError}</div>}
            {formSuccess && <div className="text-[#0ecb81] bg-[#0ecb81]/10 p-2 rounded border border-[#0ecb81]/20 text-[11px]">{formSuccess}</div>}
            
            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => handlePlaceOrder("LONG")} 
                disabled={actionLoading}
                className="flex-1 bg-[#0ecb81] hover:bg-[#0ecb81]/90 text-white font-bold py-3 rounded text-[13px] transition-colors flex items-center justify-center"
              >
                Buy / Long
              </button>
              <button 
                onClick={() => handlePlaceOrder("SHORT")} 
                disabled={actionLoading}
                className="flex-1 bg-[#f23645] hover:bg-[#f23645]/90 text-white font-bold py-3 rounded text-[13px] transition-colors flex items-center justify-center"
              >
                Sell / Short
              </button>
            </div>
            
            {/* Margin Usage Summary at Bottom */}
            <div className="pt-6 mt-6 border-t border-[#2b3139] space-y-2">
              <h3 className="text-[#EAECEF] font-semibold pb-1">Margin Ratio</h3>
              <div className="flex justify-between">
                <span className="text-[#848e9c]">Margin Balance</span>
                <span className="text-[#EAECEF]">{balance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#848e9c]">Position Margin</span>
                <span className="text-[#EAECEF]">{totalMargin.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#848e9c]">Unrealized PNL</span>
                <span className={totalUnrealizedPnl >= 0 ? "text-[#0ecb81]" : "text-[#f23645]"}>{totalUnrealizedPnl > 0 ? "+" : ""}{totalUnrealizedPnl.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#848e9c]">Equity</span>
                <span className="text-[#EAECEF]">{accountEquity.toFixed(2)}</span>
              </div>
            </div>
            
          </div>
        </div>
        
      </div>
    </div>
  );
}
