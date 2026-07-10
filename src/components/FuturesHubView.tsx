import React, { useState, useEffect, useCallback, useRef } from "react";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  RefreshCw, 
  Copy, 
  Search, 
  Database, 
  Info,
  X,
  Play
} from "lucide-react";
import { useSettings } from "../SettingsContext";

interface OpenPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  qty: number;
  leverage: number;
  margin: number;
  addedAt: string;
}

interface TradeHistoryItem {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: string;
  qty: number;
  price: number;
  leverage: number;
  realizedPnl: number;
  fee: number;
  timestamp: string;
}

interface ScannerItem {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  priceChange1h?: number;
  priceChange15m?: number;
  volumeRatio?: number; // Volume spike ratio
  pumpScore?: number; // calculated pump probability
}

interface PumpAlert {
  symbol: string;
  change24h: number;
  pct15m: number;
  volRatio: number;
  timestamp: string;
  markPrice: number;
  suggestedShort: number;
  stopLoss: number;
}

export default function FuturesHubView() {
  const { theme, t } = useSettings();
  const [activeSubTab, setActiveSubTab] = useState<"trading" | "scanner" | "history">("trading");
  
  // Demo Account States
  const [balance, setBalance] = useState<number>(10000);
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [trades, setTrades] = useState<TradeHistoryItem[]>([]);
  const [loadingAccount, setLoadingAccount] = useState<boolean>(true);
  
  // Trading Form States
  const [selectedSymbol, setSelectedSymbol] = useState<string>("BTCUSDT");
  const [leverage, setLeverage] = useState<number>(20);
  const [orderSize, setOrderSize] = useState<string>("1000"); // in USDT value
  const [orderType, setOrderType] = useState<"USDT" | "COIN">("USDT");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  
  // Market Prices state (Mark prices of all pairs from Binance)
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});
  const [scannerData, setScannerData] = useState<ScannerItem[]>([]);
  const [scannerSearch, setScannerSearch] = useState<string>("");
  const [loadingScanner, setLoadingScanner] = useState<boolean>(true);
  
  // Pump & Dump Alerts State
  const [alerts, setAlerts] = useState<PumpAlert[]>([]);
  const [copiedAlert, setCopiedAlert] = useState<string | null>(null);

  // Fetch account status from database
  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch("/api/futures/account");
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setBalance(data.balance);
          setPositions(data.positions);
          setTrades(data.trades);
        }
      }
    } catch (e) {
      console.error("Failed to load futures account:", e);
    } finally {
      setLoadingAccount(false);
    }
  }, []);

  // Initialize account and polling
  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  // Fetch mark prices for positions and scanner
  const fetchMarkPrices = useCallback(async () => {
    try {
      const res = await fetch("https://fapi.binance.com/fapi/v1/ticker/price");
      if (res.ok) {
        const data = await res.json();
        const priceMap: Record<string, number> = {};
        data.forEach((item: any) => {
          if (item.symbol.endsWith("USDT")) {
            priceMap[item.symbol] = parseFloat(item.price);
          }
        });
        setMarketPrices(priceMap);
      }
    } catch (e) {
      console.error("Failed to fetch mark prices:", e);
    }
  }, []);

  // Poll mark prices every 4 seconds
  useEffect(() => {
    fetchMarkPrices();
    const interval = setInterval(fetchMarkPrices, 4000);
    return () => clearInterval(interval);
  }, [fetchMarkPrices]);

  // Handle Order submit
  const handlePlaceOrder = async (side: "LONG" | "SHORT") => {
    setFormError(null);
    setFormSuccess(null);
    
    const currentPrice = marketPrices[selectedSymbol];
    if (!currentPrice) {
      setFormError("Không thể lấy giá hiện tại của đồng coin này. Vui lòng thử lại.");
      return;
    }

    let qty = 0;
    let value = 0;
    if (orderType === "USDT") {
      value = parseFloat(orderSize);
      qty = value / currentPrice;
    } else {
      qty = parseFloat(orderSize);
      value = qty * currentPrice;
    }

    if (isNaN(qty) || qty <= 0) {
      setFormError("Vui lòng nhập kích thước lệnh hợp lệ.");
      return;
    }

    const margin = value / leverage;
    const fee = value * 0.0005;
    const totalCost = margin + fee;

    if (balance < totalCost) {
      setFormError(`Số dư ký quỹ không đủ. Bạn cần ít nhất ${totalCost.toFixed(2)} USDT (gồm ${(margin).toFixed(2)} USDT ký quỹ và ${(fee).toFixed(2)} USDT phí mở vị thế)`);
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch("/api/futures/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: selectedSymbol,
          side,
          qty,
          price: currentPrice,
          leverage
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể đặt lệnh.");
      }

      setFormSuccess(`Đã mở vị thế ${side} ${selectedSymbol} thành công!`);
      fetchAccount();
    } catch (e: any) {
      setFormError(e.message || "Lỗi mạng khi mở vị thế.");
    } finally {
      setActionLoading(false);
    }
  };

  // Close position
  const handleClosePosition = async (symbol: string) => {
    const currentPrice = marketPrices[symbol];
    if (!currentPrice) {
      alert("Không có giá đánh dấu mới nhất để đóng vị thế.");
      return;
    }

    if (!confirm(`Bạn có chắc muốn đóng vị thế ${symbol} ở giá thị trường ${currentPrice} không?`)) {
      return;
    }

    try {
      const res = await fetch("/api/futures/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, closePrice: currentPrice })
      });

      if (res.ok) {
        fetchAccount();
      } else {
        const data = await res.json();
        alert(data.error || "Không thể đóng vị thế.");
      }
    } catch (e) {
      console.error("Error closing position:", e);
    }
  };

  // Reset Demo Account
  const handleResetAccount = async () => {
    if (!confirm("Bạn có muốn làm mới số dư tài khoản Demo về 10,000 USDT và đóng hết toàn bộ các vị thế đang mở không?")) {
      return;
    }

    try {
      const res = await fetch("/api/futures/reset", { method: "POST" });
      if (res.ok) {
        fetchAccount();
      }
    } catch (e) {
      console.error("Error resetting demo account:", e);
    }
  };

  // Poll Scanner Data (from Binance 24h Ticker API)
  const fetchScannerData = useCallback(async () => {
    try {
      const res = await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr");
      if (res.ok) {
        const data = await res.json();
        const usdtPairs = data
          .filter((item: any) => item.symbol.endsWith("USDT"))
          .map((item: any) => ({
            symbol: item.symbol,
            price: parseFloat(item.lastPrice),
            change24h: parseFloat(item.priceChangePercent),
            volume24h: parseFloat(item.quoteVolume) // Quote volume = USDT volume
          }));
        
        // Sort by quote volume descending
        usdtPairs.sort((a: any, b: any) => b.volume24h - a.volume24h);
        setScannerData(usdtPairs);
        
        // Run Pump Detection on Top Gainers
        const potentialPumps = usdtPairs.filter((coin: any) => coin.change24h > 6 && coin.volume24h > 1000000);
        detectPumpSpikes(potentialPumps.slice(0, 15)); // Analyze top 15 candidates
      }
    } catch (e) {
      console.error("Failed to load scanner data:", e);
    } finally {
      setLoadingScanner(false);
    }
  }, []);

  useEffect(() => {
    fetchScannerData();
    const interval = setInterval(fetchScannerData, 15000); // Poll scanner every 15s
    return () => clearInterval(interval);
  }, [fetchScannerData]);

  // Pump & Dump Detection Algorithm
  const detectPumpSpikes = async (candidates: ScannerItem[]) => {
    const newAlerts: PumpAlert[] = [];
    const timestamp = new Date().toLocaleTimeString();

    for (const coin of candidates) {
      try {
        // Fetch recent 5m Klines (12 candles = 1 hour)
        const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${coin.symbol}&interval=5m&limit=24`);
        if (!res.ok) continue;
        const klines = await res.json();
        
        if (klines.length < 15) continue;
        
        // 1. Calculate price change in the last 15 minutes (last 3 candles)
        const currentClose = parseFloat(klines[klines.length - 1][4]);
        const open15mAgo = parseFloat(klines[klines.length - 3][1]);
        const pct15m = ((currentClose - open15mAgo) / open15mAgo) * 100;
        
        // 2. Calculate volume ratio (last 3 candles volume vs average of previous 12 candles volume)
        const recentVol = klines.slice(klines.length - 3).reduce((acc: number, c: any) => acc + parseFloat(c[7]), 0);
        const prevVolAvg = klines.slice(klines.length - 15, klines.length - 3).reduce((acc: number, c: any) => acc + parseFloat(c[7]), 0) / 12;
        const volRatio = prevVolAvg > 0 ? recentVol / (prevVolAvg * 3) : 1;
        
        // 3. If Price rises > 3.5% in 15m AND volume is 2x normal average, trigger Pump alert!
        if (pct15m > 3.5 && volRatio > 2.0) {
          const suggestedShort = currentClose;
          const stopLoss = currentClose * (1 + 0.05); // 5% stop loss
          
          newAlerts.push({
            symbol: coin.symbol,
            change24h: coin.change24h,
            pct15m,
            volRatio,
            timestamp,
            markPrice: currentClose,
            suggestedShort,
            stopLoss
          });
        }
      } catch (err) {
        console.error("Failed to analyze klines for " + coin.symbol, err);
      }
    }
    
    // Sort alerts by 15m pump intensity
    newAlerts.sort((a, b) => b.pct15m - a.pct15m);
    setAlerts(newAlerts);
  };

  // Auto liquidation monitor
  useEffect(() => {
    positions.forEach(async (pos) => {
      const currentPrice = marketPrices[pos.symbol];
      if (!currentPrice) return;

      let liqPrice = 0;
      if (pos.side === "LONG") {
        liqPrice = pos.entryPrice * (1 - 1 / pos.leverage * 0.95);
      } else {
        liqPrice = pos.entryPrice * (1 + 1 / pos.leverage * 0.95);
      }

      const isLiquidated = 
        (pos.side === "LONG" && currentPrice <= liqPrice) ||
        (pos.side === "SHORT" && currentPrice >= liqPrice);

      if (isLiquidated) {
        console.log(`[Simulator] Auto liquidating position for ${pos.symbol} at ${currentPrice}`);
        try {
          await fetch("/api/futures/liquidate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol: pos.symbol, liqPrice })
          });
          fetchAccount();
        } catch (err) {
          console.error("Liquidation request failed:", err);
        }
      }
    });
  }, [positions, marketPrices, fetchAccount]);

  const copyToClipboard = (alert: PumpAlert) => {
    const text = `Đồng ${alert.symbol} đang pump mạnh +${alert.change24h.toFixed(2)}% trong 24h. Chỉ số biến động 15m tăng vọt +${alert.pct15m.toFixed(2)}% với khối lượng giao dịch đột biến gấp ${alert.volRatio.toFixed(1)} lần. Không có thông tin tin tức cơ bản nào hỗ trợ rõ ràng. Hãy tiến hành phân tích kỹ thuật và định giá xem có nên Short lệnh phái sinh Futures không? Hãy cung cấp điểm entry gợi ý quanh $${alert.suggestedShort.toFixed(4)}, mức đòn bẩy phù hợp, Stop Loss cụ thể tầm $${alert.stopLoss.toFixed(4)} và các mức Target chốt lời dự đoán.`;
    
    navigator.clipboard.writeText(text);
    setCopiedAlert(alert.symbol);
    setTimeout(() => setCopiedAlert(null), 3000);
  };

  // Filtered scanner data
  const filteredScanner = scannerData.filter(item => 
    item.symbol.toLowerCase().includes(scannerSearch.toLowerCase())
  );

  // Position Calculations
  const totalMargin = positions.reduce((acc, pos) => acc + pos.margin, 0);
  
  const totalUnrealizedPnl = positions.reduce((acc, pos) => {
    const currentPrice = marketPrices[pos.symbol] || pos.entryPrice;
    let pnl = 0;
    if (pos.side === "LONG") {
      pnl = pos.qty * (currentPrice - pos.entryPrice);
    } else {
      pnl = pos.qty * (pos.entryPrice - currentPrice);
    }
    return acc + pnl;
  }, 0);

  const accountEquity = balance + totalMargin + totalUnrealizedPnl;

  return (
    <div className="space-y-6" id="futures-hub">
      {/* Header Info */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          <h2 className="font-sans font-black text-2xl uppercase tracking-normal text-foreground flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFD600] text-black">
              <TrendingDown className="h-5 w-5" />
            </span>
            FUTURES TRADING SIMULATOR &amp; SCANNER
          </h2>
          <p className="text-muted-fg text-sm mt-0.5 font-medium">Theo dõi dữ liệu Binance Futures trực tiếp, phát hiện biến động bất thường và thực hành giao dịch phái sinh.</p>
        </div>
        
        {/* Account balance status bar */}
        <div className="flex flex-wrap items-center gap-3 bg-card border border-border p-3 rounded-2xl">
          <div className="px-3 border-r border-border">
            <span className="text-[10px] font-black uppercase text-muted-fg block">Số Dư Demo</span>
            <span className="text-base font-black text-[#FFD600]">${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</span>
          </div>
          <div className="px-3 border-r border-border">
            <span className="text-[10px] font-black uppercase text-muted-fg block">Tài Sản Thực Tế (Equity)</span>
            <span className="text-base font-black text-foreground">${accountEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</span>
          </div>
          <div className="px-3 border-r border-border">
            <span className="text-[10px] font-black uppercase text-muted-fg block">Ký Quỹ Mở Vị Thế</span>
            <span className="text-base font-black text-foreground">${totalMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</span>
          </div>
          <div className="px-3">
            <span className="text-[10px] font-black uppercase text-muted-fg block">PnL Vị Thế (Chưa Khớp)</span>
            <span className={`text-base font-black ${totalUnrealizedPnl >= 0 ? "text-success" : "text-danger"}`}>
              {totalUnrealizedPnl >= 0 ? "+" : ""}${totalUnrealizedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <button 
            onClick={handleResetAccount} 
            className="p-2 border border-border rounded-xl text-muted-fg hover:text-danger hover:bg-muted/50 transition-colors"
            title="Làm mới tài khoản Demo"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Sub Navigation */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveSubTab("trading")}
          className={`px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 -mb-[2px] transition-colors ${
            activeSubTab === "trading"
              ? "border-[#FFD600] text-foreground"
              : "border-transparent text-muted-fg hover:text-foreground"
          }`}
        >
          Trình Giả Lập Giao Dịch
        </button>
        <button
          onClick={() => setActiveSubTab("scanner")}
          className={`px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 -mb-[2px] transition-colors ${
            activeSubTab === "scanner"
              ? "border-[#FFD600] text-foreground"
              : "border-transparent text-muted-fg hover:text-foreground"
          }`}
        >
          Bộ Quét Giá &amp; Cảnh Báo Pump
        </button>
        <button
          onClick={() => setActiveSubTab("history")}
          className={`px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 -mb-[2px] transition-colors ${
            activeSubTab === "history"
              ? "border-[#FFD600] text-foreground"
              : "border-transparent text-muted-fg hover:text-foreground"
          }`}
        >
          Lịch Sử Giao Dịch
        </button>
      </div>

      {/* Content Area */}
      {activeSubTab === "trading" && (
        <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          {/* Order Entry Column */}
          <div className="space-y-6">
            <div className="rounded-3xl border border-border bg-card/60 p-5 space-y-5">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FFD600]">Đặt Lệnh Giao Dịch</span>
              
              {/* Alert Feedback Messages */}
              {formError && (
                <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl text-xs font-semibold text-danger">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="p-3 bg-success/10 border border-success/20 rounded-xl text-xs font-semibold text-success">
                  {formSuccess}
                </div>
              )}

              {/* Ticker Search & Select */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-muted-fg block">Mã Hợp Đồng (Coin)</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-fg" />
                  <input
                    type="text"
                    value={selectedSymbol}
                    onChange={(e) => setSelectedSymbol(e.target.value.toUpperCase())}
                    placeholder="Nhập mã ví dụ: ETHUSDT"
                    className="w-full bg-background border border-border rounded-xl py-3.5 pl-10 pr-4 text-sm font-bold uppercase tracking-wider text-foreground focus:outline-none focus:border-[#FFD600]"
                  />
                </div>
                {marketPrices[selectedSymbol] ? (
                  <span className="text-[11px] text-muted-fg font-medium flex justify-between">
                    <span>Giá hiện tại (Binance Futures):</span>
                    <span className="font-bold text-foreground">${marketPrices[selectedSymbol]} USDT</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-danger font-medium">Hợp đồng USDT-M không tồn tại hoặc chưa kết nối API.</span>
                )}
              </div>

              {/* Leverage Slider */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black uppercase text-muted-fg">Đòn bẩy (Leverage)</label>
                  <span className="px-2 py-0.5 rounded-lg bg-[#FFD600]/10 text-[#FFD600] font-black text-xs border border-[#FFD600]/30">{leverage}x</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={leverage}
                  onChange={(e) => setLeverage(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-background rounded-lg appearance-none cursor-pointer accent-[#FFD600]"
                />
                <span className="text-[9px] text-muted-fg font-bold block text-right">Đề xuất short pump-and-dump: 10x - 20x để an toàn</span>
              </div>

              {/* Order Size Input */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black uppercase text-muted-fg">Kích Thước Lệnh</label>
                  <div className="flex border border-border rounded-lg overflow-hidden text-[9px] font-black uppercase">
                    <button
                      onClick={() => setOrderType("USDT")}
                      className={`px-2.5 py-1 ${orderType === "USDT" ? "bg-[#FFD600] text-black" : "bg-background text-muted-fg"}`}
                    >
                      USDT
                    </button>
                    <button
                      onClick={() => setOrderType("COIN")}
                      className={`px-2.5 py-1 ${orderType === "COIN" ? "bg-[#FFD600] text-black" : "bg-background text-muted-fg"}`}
                    >
                      Coin
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  value={orderSize}
                  onChange={(e) => setOrderSize(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl py-3 text-sm font-bold text-foreground focus:outline-none focus:border-[#FFD600]"
                  placeholder="Kích thước"
                />
                
                {/* Dynamically calculate details */}
                {marketPrices[selectedSymbol] && !isNaN(parseFloat(orderSize)) && parseFloat(orderSize) > 0 && (
                  <div className="pt-2 text-[11px] font-semibold text-muted-fg space-y-1">
                    <div className="flex justify-between">
                      <span>Tổng giá trị vị thế (Value):</span>
                      <span className="text-foreground font-bold">
                        {orderType === "USDT" 
                          ? `${parseFloat(orderSize).toFixed(2)} USDT` 
                          : `${(parseFloat(orderSize) * marketPrices[selectedSymbol]).toFixed(2)} USDT`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Ký quỹ tối thiểu yêu cầu:</span>
                      <span className="text-foreground font-black">
                        {(orderType === "USDT" 
                          ? (parseFloat(orderSize) / leverage) 
                          : (parseFloat(orderSize) * marketPrices[selectedSymbol]) / leverage).toFixed(2)} USDT
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Phí mở vị thế (Market Fee 0.05%):</span>
                      <span className="text-foreground font-bold">
                        {(orderType === "USDT" 
                          ? parseFloat(orderSize) * 0.0005 
                          : parseFloat(orderSize) * marketPrices[selectedSymbol] * 0.0005).toFixed(4)} USDT
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="grid gap-3 grid-cols-2 pt-2">
                <button
                  onClick={() => handlePlaceOrder("LONG")}
                  disabled={actionLoading || !marketPrices[selectedSymbol]}
                  className="h-12 bg-success text-success-fg font-black text-xs uppercase tracking-wider rounded-xl hover:shadow-lg hover:shadow-success/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <TrendingUp className="h-4 w-4" /> LONG (BUY)
                </button>
                <button
                  onClick={() => handlePlaceOrder("SHORT")}
                  disabled={actionLoading || !marketPrices[selectedSymbol]}
                  className="h-12 bg-danger text-danger-fg font-black text-xs uppercase tracking-wider rounded-xl hover:shadow-lg hover:shadow-danger/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <TrendingDown className="h-4 w-4" /> SHORT (SELL)
                </button>
              </div>
            </div>
            
            {/* Quick Tips box */}
            <div className="rounded-3xl border border-border bg-card/60 p-5 space-y-3">
              <span className="text-[10px] font-black uppercase text-muted-fg flex items-center gap-2">
                <Info className="h-4 w-4 text-[#FFD600]" /> Gợi ý chiến thuật phái sinh
              </span>
              <p className="text-xs leading-relaxed text-muted-fg">
                Khi sử dụng bộ lọc bên tab <b>Bộ Quét Giá</b>, hãy theo dõi các coin có cột 24h change cực lớn nhưng volume 15m đạt đột biến. 
                Gợi ý hãy đặt lệnh <b>Short</b> với kích thước vừa phải (dưới 10% vốn ký quỹ tối đa) để chống chịu tốt qua các cây nến giật đỉnh trước khi coin đó dump thật sự.
              </p>
            </div>
          </div>

          {/* Chart View Column */}
          <div className="space-y-6">
            <div className="rounded-3xl border border-border bg-card/50 overflow-hidden shadow-xl" id="tradingview-chart-container">
              <div className="bg-card/90 px-5 py-3 border-b border-border flex items-center justify-between">
                <span className="text-xs font-black uppercase text-foreground flex items-center gap-2">
                  <Play className="h-3 w-3 fill-[#FFD600] text-[#FFD600]" /> BIỂU ĐỒ TRỰC TIẾP BINANCE: {selectedSymbol}
                </span>
                <span className="px-2 py-0.5 bg-[#FFD600]/10 border border-[#FFD600]/30 rounded text-[9px] font-bold text-[#FFD600]">
                  REALTIME 15m
                </span>
              </div>
              <div className="h-[400px] w-full bg-[#131722]">
                <iframe
                  title="TradingView Chart"
                  src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_chart&symbol=BINANCE:${selectedSymbol}&interval=15&hidesidetoolbar=1&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=%5B%5D&theme=dark`}
                  width="100%"
                  height="100%"
                  className="border-0"
                />
              </div>
            </div>

            {/* Active Positions Table */}
            <div className="rounded-3xl border border-border bg-card/60 p-5 space-y-4">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FFD600] block">Vị Thế Đang Mở (Active Positions)</span>
              
              {positions.length === 0 ? (
                <div className="text-center py-8 text-sm font-semibold text-muted-fg">
                  Không có vị thế phái sinh nào đang hoạt động. Chọn mã và đặt lệnh bên trái để mở vị thế.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-wider text-muted-fg border-b border-border pb-3">
                        <th className="pb-3">Hợp đồng</th>
                        <th className="pb-3">Vị thế</th>
                        <th className="pb-3">Đòn bẩy</th>
                        <th className="pb-3">Giá Vào Lệnh</th>
                        <th className="pb-3">Giá Đánh Dấu</th>
                        <th className="pb-3">Ký Quỹ</th>
                        <th className="pb-3">Giá Thanh Lý</th>
                        <th className="pb-3 text-right">Lợi Nhuận (PnL / ROE%)</th>
                        <th className="pb-3 text-right">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-sans font-bold">
                      {positions.map((pos) => {
                        const currentPrice = marketPrices[pos.symbol] || pos.entryPrice;
                        
                        let pnl = 0;
                        if (pos.side === "LONG") {
                          pnl = pos.qty * (currentPrice - pos.entryPrice);
                        } else {
                          pnl = pos.qty * (pos.entryPrice - currentPrice);
                        }
                        
                        const roe = (pnl / pos.margin) * 100;
                        
                        // Liquidation Price calculation (approximate lose of 95% margin)
                        let liqPrice = 0;
                        if (pos.side === "LONG") {
                          liqPrice = pos.entryPrice * (1 - 1 / pos.leverage * 0.95);
                        } else {
                          liqPrice = pos.entryPrice * (1 + 1 / pos.leverage * 0.95);
                        }

                        return (
                          <tr key={pos.symbol} className="hover:bg-muted/10 transition-colors">
                            <td className="py-3.5 uppercase tracking-wider text-foreground">{pos.symbol}</td>
                            <td className="py-3.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black ${pos.side === "LONG" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
                                {pos.side}
                              </span>
                            </td>
                            <td className="py-3.5 text-foreground">{pos.leverage}</td>
                            <td className="py-3.5 text-foreground">${pos.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                            <td className="py-3.5 text-[#FFD600] animate-pulse">${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                            <td className="py-3.5 text-foreground">${pos.margin.toFixed(2)} USDT</td>
                            <td className="py-3.5 text-warning font-mono">${liqPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                            <td className={`py-3.5 text-right font-mono ${pnl >= 0 ? "text-success" : "text-danger"}`}>
                              <div>{pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} USDT</div>
                              <div className="text-[10px] font-black">({pnl >= 0 ? "+" : ""}{roe.toFixed(2)}%)</div>
                            </td>
                            <td className="py-3.5 text-right">
                              <button
                                onClick={() => handleClosePosition(pos.symbol)}
                                className="h-8 px-3 rounded-lg border border-danger/30 text-danger text-[10px] font-black uppercase tracking-wider hover:bg-danger hover:text-white transition-colors"
                              >
                                ĐÓNG THỊ TRƯỜNG
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeSubTab === "scanner" && (
        <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
          {/* Main scanner view */}
          <div className="rounded-3xl border border-border bg-card/60 p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FFD600]">Bộ Quét Tỷ Giá Binance USDT-M Futures</span>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-fg" />
                <input
                  type="text"
                  value={scannerSearch}
                  onChange={(e) => setScannerSearch(e.target.value)}
                  placeholder="Tìm coin ví dụ: ETH"
                  className="w-full bg-background border border-border rounded-xl py-2 pl-9 pr-4 text-xs font-bold text-foreground focus:outline-none"
                />
              </div>
            </div>

            {loadingScanner ? (
              <div className="text-center py-12 text-sm font-semibold text-muted-fg animate-pulse">
                Đang nạp dữ liệu tỷ giá từ Binance...
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[500px]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-wider text-muted-fg border-b border-border pb-3">
                      <th className="pb-3">Cặp Giao Dịch</th>
                      <th className="pb-3">Giá Hiện Tại</th>
                      <th className="pb-3">Biến Động 24h</th>
                      <th className="pb-3">Khối Lượng 24h</th>
                      <th className="pb-3 text-right">Hành Động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-sans font-bold">
                    {filteredScanner.map((coin) => (
                      <tr key={coin.symbol} className="hover:bg-muted/10 transition-colors">
                        <td className="py-3 uppercase tracking-wider text-foreground flex items-center gap-2">
                          {coin.symbol}
                          {coin.change24h > 15 && (
                            <span className="px-1.5 py-0.5 rounded bg-warning/10 text-warning text-[9px] font-black tracking-wide border border-warning/20">
                              HOT PUMP
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-foreground font-mono">${coin.price.toLocaleString(undefined, { maximumFractionDigits: 5 })}</td>
                        <td className={`py-3 font-mono ${coin.change24h >= 0 ? "text-success" : "text-danger"}`}>
                          {coin.change24h >= 0 ? "+" : ""}{coin.change24h.toFixed(2)}%
                        </td>
                        <td className="py-3 text-muted-fg font-mono">${(coin.volume24h / 1000000).toFixed(1)}M USDT</td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedSymbol(coin.symbol);
                              setActiveSubTab("trading");
                            }}
                            className="h-8 px-4 rounded-lg bg-[#FFD600] text-black text-[10px] font-black uppercase tracking-wider hover:shadow-lg hover:shadow-[#FFD600]/20 transition-all"
                          >
                            GIAO DỊCH
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pump Detector Side alerts Panel */}
          <div className="space-y-6">
            <div className="rounded-3xl border border-border bg-card/60 p-5 space-y-4">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-warning flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" /> PUMP &amp; DUMP ALERTS
              </span>
              
              <p className="text-xs text-muted-fg leading-relaxed">
                Các đồng coin có biến động tăng bất thường kèm khối lượng giao dịch đột biến trong 15 phút gần nhất được quét tự động bên dưới:
              </p>

              {alerts.length === 0 ? (
                <div className="p-4 border border-dashed border-border rounded-2xl text-center text-xs text-muted-fg py-8 font-semibold">
                  Chưa phát hiện hành vi Pump ảo bất thường nào trên sàn Binance Futures.
                </div>
              ) : (
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                  {alerts.map((alert) => (
                    <div key={alert.symbol} className="p-4 bg-warning/5 border border-warning/20 rounded-2xl space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="font-sans font-black text-sm uppercase tracking-wider text-foreground">{alert.symbol}</span>
                        <span className="px-2 py-0.5 rounded bg-warning text-black text-[9px] font-black tracking-widest uppercase">
                          SPIKE ALARM
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-muted-fg">
                        <div>Tăng 24h: <span className="text-foreground font-black">+{alert.change24h.toFixed(1)}%</span></div>
                        <div>Tăng 15m: <span className="text-danger font-black">+{alert.pct15m.toFixed(1)}%</span></div>
                        <div className="col-span-2">Vol nổ đột biến: <span className="text-foreground font-black">gấp {alert.volRatio.toFixed(1)} lần</span></div>
                        <div className="col-span-2">Đề xuất Entry Short: <span className="text-[#FFD600] font-mono font-black">${alert.suggestedShort.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span></div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedSymbol(alert.symbol);
                            setActiveSubTab("trading");
                          }}
                          className="flex-1 h-8 bg-background border border-border text-[9px] font-black uppercase tracking-wider text-foreground rounded-lg hover:bg-muted transition-colors flex items-center justify-center"
                        >
                          TRADE
                        </button>
                        <button
                          onClick={() => copyToClipboard(alert)}
                          className="h-8 w-24 bg-[#FFD600] text-black text-[9px] font-black uppercase tracking-wider rounded-lg hover:shadow-lg hover:shadow-[#FFD600]/25 transition-all flex items-center justify-center gap-1"
                        >
                          <Copy className="h-3 w-3" />
                          {copiedAlert === alert.symbol ? "COPIED" : "HỎI AI"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Guide to ask AI */}
            <div className="p-5 border border-border bg-card/30 rounded-3xl space-y-2">
              <span className="text-[10px] font-black uppercase text-muted-fg block">Cách sử dụng nút "Hỏi AI"</span>
              <p className="text-xs text-muted-fg leading-relaxed">
                Khi bấm <b>HỎI AI</b>, hệ thống tự động lưu văn bản phân tích kỹ thuật vào bộ nhớ tạm. Hãy click vào <b>bong bóng chat AI nổi ở góc phải bên dưới</b>, hoặc sang tab <b>CHAT NEURAL</b> và <b>DÁN (Ctrl + V)</b> câu hỏi để AI phân tích và đưa ra quyết định Short tốt nhất.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === "history" && (
        <div className="rounded-3xl border border-border bg-card/60 p-5 space-y-4">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FFD600] block">Lịch sử giao dịch Demo</span>
          
          {trades.length === 0 ? (
            <div className="text-center py-12 text-sm font-semibold text-muted-fg">
              Chưa có lịch sử giao dịch phái sinh nào được ghi nhận trên tài khoản Demo này.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-wider text-muted-fg border-b border-border pb-3">
                    <th className="pb-3">Hợp đồng</th>
                    <th className="pb-3">Hướng Lệnh</th>
                    <th className="pb-3">Loại</th>
                    <th className="pb-3">Kích thước</th>
                    <th className="pb-3">Giá Khớp</th>
                    <th className="pb-3">Đòn bẩy</th>
                    <th className="pb-3 text-right">Lợi Nhuận Thực Tế (PnL)</th>
                    <th className="pb-3 text-right">Phí Sim</th>
                    <th className="pb-3 text-right">Thời Gian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-sans font-bold">
                  {trades.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/10 transition-colors">
                      <td className="py-3 uppercase tracking-wider text-foreground">{t.symbol}</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${t.side === "BUY" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
                          {t.side === "BUY" ? "BUY" : "SELL"}
                        </span>
                      </td>
                      <td className="py-3 text-foreground uppercase tracking-wider text-[10px]">{t.type}</td>
                      <td className="py-3 text-foreground">{t.qty.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                      <td className="py-3 text-foreground">${t.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                      <td className="py-3 text-foreground">{t.leverage}x</td>
                      <td className={`py-3 text-right font-mono ${t.realizedPnl > 0 ? "text-success" : t.realizedPnl < 0 ? "text-danger" : "text-muted-fg"}`}>
                        {t.realizedPnl > 0 ? "+" : ""}{t.realizedPnl === 0 ? "0.00" : `${t.realizedPnl.toFixed(2)} USDT`}
                      </td>
                      <td className="py-3 text-right text-muted-fg font-mono">${t.fee.toFixed(4)} USDT</td>
                      <td className="py-3 text-right text-muted-fg">{new Date(t.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
