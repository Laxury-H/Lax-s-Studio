import { useCallback, useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import DashboardView from "./components/DashboardView";
import PortfolioView from "./components/PortfolioView";
import MarketAnalysisView from "./components/MarketAnalysisView";
import AIInsightsView from "./components/AIInsightsView";
import AssetDetailModal from "./components/AssetDetailModal";
import FloatingAIChatBubble from "./components/FloatingAIChatBubble";
import { Holding, MarketAsset, MarketDataResponse } from "./types";
import { Bell, RefreshCw, ShieldCheck, CheckCircle2, AlertTriangle, Sparkles, TrendingUp } from "lucide-react";
import { useSettings } from "./SettingsContext";
import SupportModal from "./components/SupportModal";
import { motion, AnimatePresence } from "motion/react";

interface Notification {
  id: string;
  message: string;
  time: Date;
  read: boolean;
  type: "system" | "price" | "ai";
}

export default function App() {
  const { language, setLanguage, theme, setTheme, t } = useSettings();
  const [currentTab, setCurrentTab] = useState<string>("dashboard");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [marketAssets, setMarketAssets] = useState<MarketAsset[]>([]);
  const [watchlist, setWatchlist] = useState<MarketAsset[]>([]);
  const [marketDataStatus, setMarketDataStatus] = useState<{
    isLoading: boolean;
    source: MarketDataResponse["source"];
    updatedAt?: string;
    errors: string[];
    providerStatus?: MarketDataResponse["providerStatus"];
    error?: string | null;
  }>({
    isLoading: false,
    source: "empty",
    errors: []
  });
  
  // State to transition custom prompt inputs from Dashboard/Markets into the AI Chat
  const [initialTickerQuery, setInitialTickerQuery] = useState<string | undefined>(undefined);
  const [detailedAssetSymbol, setDetailedAssetSymbol] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);

  const syncMarketAssets = useCallback((assets: MarketAsset[]) => {
    const bySymbol = new Map(assets.map(asset => [asset.symbol, asset]));

    setMarketAssets(assets);
    setWatchlist(prev => prev.map(item => bySymbol.get(item.symbol) || item).filter(item => bySymbol.has(item.symbol)));
    setHoldings(prev => prev.map(holding => {
      const asset = bySymbol.get(holding.asset);
      if (!asset) return holding;

      return {
        ...holding,
        name: asset.name,
        currentPrice: asset.price
      };
    }));
  }, []);

  const fetchMarketData = useCallback(async (forceRefresh = false) => {
    setMarketDataStatus(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch(`/api/market-data${forceRefresh ? "?force=true" : ""}`);
      if (!response.ok) {
        throw new Error(`Market data request failed with ${response.status}`);
      }

      const data: MarketDataResponse = await response.json();
      if (Array.isArray(data.assets) && data.assets.length > 0) {
        const bySymbol = new Map(data.assets.map(asset => [asset.symbol, asset]));
        
        // Fetch watchlist and holdings from our new APIs
        const [watchlistRes, portfolioRes] = await Promise.all([
          fetch("/api/watchlist"),
          fetch("/api/portfolio")
        ]);
        
        const watchlistSymbols = watchlistRes.ok ? await watchlistRes.json() : [];
        const savedHoldings = portfolioRes.ok ? await portfolioRes.json() : [];
        
        const loadedWatchlist = watchlistSymbols.map((sym: string) => bySymbol.get(sym)).filter(Boolean);
        const loadedHoldings = savedHoldings.map((h: any) => ({
          ...h,
          currentPrice: bySymbol.get(h.asset)?.price || 0
        }));

        setMarketAssets(data.assets);
        setWatchlist(loadedWatchlist.length > 0 ? loadedWatchlist : data.assets.slice(0, 4));
        setHoldings(loadedHoldings);
      }

      setMarketDataStatus({
        isLoading: false,
        source: data.source,
        updatedAt: data.updatedAt,
        errors: data.errors || [],
        providerStatus: data.providerStatus,
        error: null
      });
    } catch (error: any) {
      setMarketDataStatus(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || "Unable to refresh market data"
      }));
    }
  }, [syncMarketAssets]);

  useEffect(() => {
    fetchMarketData();
    const intervalId = window.setInterval(() => fetchMarketData(), 60_000);
    return () => window.clearInterval(intervalId);
  }, [fetchMarketData]);

  // Global actions
  const handleAddTransaction = async (newHolding: Omit<Holding, "id">) => {
    const id = "h_u_" + Date.now();
    const resolvedHolding: Holding = { ...newHolding, id };
    
    // Optimistic update
    setHoldings(prev => [resolvedHolding, ...prev]);
    triggerInlineNotification(`Successfully updated transactions: +${newHolding.qty} ${newHolding.asset}`);
    
    // Sync with backend
    try {
      await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resolvedHolding)
      });
    } catch (e) {
      console.error("Failed to add transaction", e);
    }
  };

  const handleRemoveHolding = async (id: string) => {
    const target = holdings.find(h => h.id === id);
    if (target) {
      setHoldings(prev => prev.filter(h => h.id !== id));
      triggerInlineNotification(`Removed asset holding: ${target.asset}`);
      
      try {
        await fetch(`/api/portfolio/${id}`, { method: "DELETE" });
      } catch (e) {
        console.error("Failed to remove transaction", e);
      }
    }
  };

  const handleAddWatchlist = async (asset: MarketAsset) => {
    const exists = watchlist.some(w => w.symbol === asset.symbol);
    if (exists) {
      setWatchlist(prev => prev.filter(w => w.symbol !== asset.symbol));
      triggerInlineNotification(`Removed from Watchlist: ${asset.symbol}`);
      fetch(`/api/watchlist/${asset.symbol}`, { method: "DELETE" }).catch(console.error);
    } else {
      setWatchlist(prev => [...prev, asset]);
      triggerInlineNotification(`Added to Watchlist: ${asset.symbol}`);
      fetch(`/api/watchlist`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: asset.symbol })
      }).catch(console.error);
    }
  };

  const handleRemoveWatchlistSymbol = async (symbol: string) => {
    setWatchlist(prev => prev.filter(w => w.symbol !== symbol));
    triggerInlineNotification(`Removed from Watchlist: ${symbol}`);
    fetch(`/api/watchlist/${symbol}`, { method: "DELETE" }).catch(console.error);
  };

  const handleReorderWatchlist = async (draggedSymbol: string, targetSymbol: string) => {
    let newOrder: string[] = [];
    setWatchlist(prev => {
      const oldIndex = prev.findIndex(item => item.symbol === draggedSymbol);
      const newIndex = prev.findIndex(item => item.symbol === targetSymbol);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev;
      const newWatchlist = [...prev];
      const [moved] = newWatchlist.splice(oldIndex, 1);
      newWatchlist.splice(newIndex, 0, moved);
      newOrder = newWatchlist.map(w => w.symbol);
      return newWatchlist;
    });
    
    if (newOrder.length > 0) {
      fetch("/api/watchlist/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: newOrder })
      }).catch(console.error);
    }
  };

  // Select a ticker from Dashboard/Market grid to trigger full AI chat
  const handleSelectTickerForChat = (tickerSymbol: string) => {
    setInitialTickerQuery(tickerSymbol);
    setCurrentTab("insights");
  };

  const handleViewAssetDetail = (symbol: string) => {
    setDetailedAssetSymbol(symbol);
  };

  const triggerInlineNotification = (message: string, type: "system" | "price" | "ai" = "system") => {
    const newNotif: Notification = {
      id: Math.random().toString(36).substring(7),
      message,
      time: new Date(),
      read: false,
      type
    };
    setNotifications(prev => [newNotif, ...prev]);
    setAlertMessage(message);
    setTimeout(() => {
      setAlertMessage(null);
    }, 4000);
  };

  const watchlistSymbols = watchlist.map(w => w.symbol);
  const marketStatusTime = marketDataStatus.updatedAt
    ? new Date(marketDataStatus.updatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "offline";

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground font-sans antialiased" id="app-viewport">
      
      <div className="flex-1 flex overflow-hidden">
        {/* 1. Global Left Navigation Panel */}
        <Sidebar 
          currentTab={currentTab} 
          onTabChange={setCurrentTab} 
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onOpenSupport={() => setIsSupportOpen(true)}
        />

        {/* 2. Main Workspace Scrollable Context Client Area */}
        <div className="flex-1 flex flex-col h-full overflow-y-auto relative bg-background" id="workspace-viewport">
          
          {/* Top Header Controls Bar */}
          <header className="bg-card border-b border-border h-20 px-10 flex items-center justify-between sticky top-0 z-40 select-none" id="app-header-controls">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-accent-fg bg-accent border border-border px-2.5 py-1">
                {marketDataStatus.source.toUpperCase()} DATA · {marketStatusTime}
              </span>
              <button
                onClick={() => fetchMarketData(true)}
                disabled={marketDataStatus.isLoading}
                className="p-1.5 border border-border bg-card text-foreground disabled:opacity-60 hover:bg-card border border-border hover:text-accent-fg transition-all cursor-pointer"
                title={marketDataStatus.error || t("liveFeed")}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${marketDataStatus.isLoading ? "animate-spin" : ""}`} />
              </button>
            </div>

            <div className="flex items-center gap-4">
              {/* Settings, language, theme toggles */}
              <div className="flex items-center gap-2 border-r border-border pr-4 mr-1">
                <button
                  onClick={() => setLanguage(language === "en" ? "vi" : "en")}
                  className="font-bold text-xs uppercase border border-border px-2 py-1 hover:translate-y-[0.5px] active:translate-y-[1px] transition-all cursor-pointer bg-card text-foreground min-w-[32px] text-foregroundenter"
                  title={t("changeLanguage")}
                >
                  {language.toUpperCase()}
                </button>
                <button
                  onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                  className="p-1.5 border border-border hover:translate-y-[0.5px] active:translate-y-[1px] transition-all cursor-pointer bg-card text-foreground"
                  title={t("changeTheme")}
                >
                  {theme === "light" ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
                  )}
                </button>
              </div>

              {/* Top right quick shortcuts and alerts */}
              <div className="flex items-center gap-1 relative z-50">
                <button 
                  onClick={() => setIsNotificationPanelOpen(!isNotificationPanelOpen)}
                  className="p-2 text-foreground hover:bg-muted border border-transparent hover:border-border rounded-xl relative cursor-pointer transition-colors"
                  title="Notifications"
                >
                  {notifications.filter(n => !n.read).length > 0 ? (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-fg text-[8px] font-black rounded-full flex items-center justify-center shadow-sm border border-border">
                      {notifications.filter(n => !n.read).length}
                    </div>
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-[#00FF00] border border-border absolute top-1 right-1 animate-pulse" />
                  )}
                  <Bell className="w-4 h-4 text-foreground" />
                </button>
                
                <AnimatePresence>
                  {isNotificationPanelOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ type: "spring", damping: 25, stiffness: 300 }}
                      className="absolute top-12 right-0 w-80 bg-card border border-border rounded-2xl shadow-xl shadow-black/10 dark:shadow-black/40 overflow-hidden z-[100]"
                    >
                      <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
                        <h3 className="font-sans font-black text-xs uppercase tracking-wider text-foreground">Notifications</h3>
                        <button 
                          onClick={() => setNotifications(prev => prev.map(n => ({...n, read: true})))}
                          className="text-[10px] text-primary hover:underline uppercase font-bold tracking-widest cursor-pointer"
                        >
                          Mark all read
                        </button>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {notifications.length > 0 ? (
                          <div className="flex flex-col divide-y divide-border">
                            {notifications.map(notif => (
                              <div key={notif.id} className={`p-4 flex gap-3 transition-colors ${notif.read ? 'opacity-70 bg-background' : 'bg-card hover:bg-muted/30'}`}>
                                <div className="mt-0.5">
                                  {notif.type === 'system' ? <ShieldCheck className="w-4 h-4 text-primary" /> :
                                   notif.type === 'price' ? <TrendingUp className="w-4 h-4 text-success" /> :
                                   <Sparkles className="w-4 h-4 text-[#A020F0]" />}
                                </div>
                                <div className="flex-1">
                                  <p className="text-xs font-semibold text-foreground leading-snug">{notif.message}</p>
                                  <span className="text-[9px] text-muted-fg font-mono uppercase mt-1 block">
                                    {notif.time.toLocaleTimeString()}
                                  </span>
                                </div>
                                {!notif.read && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-8 flex flex-col items-center justify-center text-center">
                            <Bell className="w-8 h-8 text-border mb-3" />
                            <p className="text-xs text-muted-fg font-bold uppercase tracking-wider">No notifications yet</p>
                            <p className="text-[10px] text-muted-fg/70 mt-1">System alerts will appear here</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Profile widget user */}
              <div className="flex items-center gap-2.5 pl-3 border-l border-border" id="user-profile-badge">
                <div className="w-8 h-8 rounded-xl border border-border overflow-hidden shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-shadow">
                  <img src="/favicon.svg" alt="Laxurie Logo" className="w-full h-full object-cover" />
                </div>
                <div className="hidden md:block text-left">
                  <span className="text-[10px] font-black text-foreground/60 block leading-none uppercase tracking-widest">made by</span>
                  <span className="text-xs font-black text-foreground block leading-none uppercase mt-0.5">Laxurie</span>
                </div>
              </div>
            </div>
          </header>

          {/* Floating Quick Action Alerts Notification Popup */}
          {alertMessage && (
            <div className="fixed bottom-12 right-6 z-50 bg-primary text-primary-fg text-xs font-black px-4 py-3 border border-border shadow-lg shadow-black/5 dark:shadow-black/20 flex items-center gap-2 animate-bounce" id="floating-banner-alert">
              <ShieldCheck className="w-4 h-4 text-foreground" />
              <span className="uppercase tracking-tight">{alertMessage}</span>
              <button onClick={() => setAlertMessage(null)} className="ml-2 hover:text-danger font-bold font-sans">✕</button>
            </div>
          )}

          {/* Detailed Asset Modal Popup */}
          {detailedAssetSymbol && (
            <AssetDetailModal
              asset={marketAssets.find(a => a.symbol === detailedAssetSymbol)!}
              onClose={() => setDetailedAssetSymbol(null)}
              onAnalyze={(symbol) => {
                setDetailedAssetSymbol(null);
                handleSelectTickerForChat(symbol);
              }}
            />
          )}

        {/* View Layout Container Router switcher inside workspace viewports */}
        <main className="flex-1 flex flex-col p-8" id="workspace-container">
          {currentTab === "dashboard" && (
            <DashboardView
              watchlist={watchlist}
              marketAssets={marketAssets}
              onAddSymbol={(sym) => {
                const found = marketAssets.find(m => m.symbol === sym);
                if (found) {
                  handleAddWatchlist(found);
                } else {
                  triggerInlineNotification(`Symbol ${sym} not supported in surveillance asset lists.`);
                }
              }}
              onSelectTicker={handleSelectTickerForChat}
              onViewAssetDetail={handleViewAssetDetail}
              onRemoveWatchlist={handleRemoveWatchlistSymbol}
              onReorderWatchlist={handleReorderWatchlist}
            />
          )}

          {currentTab === "watchlist" && (
            <div className="space-y-6" id="watchlist-standalone-view">
              <div>
                <h2 className="font-sans font-bold text-2xl text-foreground tracking-tight">Watchlist Settings</h2>
                <p className="text-muted-fg text-sm mt-0.5">Toggle tracking parameters for rapid surveillance ticker feeds.</p>
              </div>

              <div className="bg-card border border-[#e2e8f0] p-6 rounded-xl space-y-4">
                <span className="text-xs font-semibold text-muted-fg uppercase tracking-widest block">Selected Assets under Surveillance ({watchlist.length})</span>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="watchlist-elements-rack">
                  {marketAssets.map((asset) => {
                    const isAdded = watchlistSymbols.includes(asset.symbol);
                    return (
                      <div key={asset.symbol} className="border border-border p-4 rounded-lg flex items-center justify-between bg-muted cursor-pointer hover:border-primary transition-colors" onClick={() => setDetailedAssetSymbol(asset.symbol)}>
                        <div>
                          <span className="font-mono font-bold text-xs text-primary">{asset.symbol}</span>
                          <span className="text-xs text-muted-fg font-medium block">{asset.name}</span>
                        </div>
                        <button
                          onClick={() => handleAddWatchlist(asset)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                            isAdded ? "bg-accent/20 text-accent hover:bg-accent/30" : "bg-primary/10 text-primary hover:bg-primary/20"
                          }`}
                        >
                          {isAdded ? "★ Tracked" : "☆ Add"}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-4 border-t border-[#f1f5f9] text-foregroundenter">
                  <button 
                    onClick={() => setCurrentTab("dashboard")}
                    className="bg-primary text-primary-fg text-xs font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-all"
                  >
                    Go Back to Core Dashboard
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentTab === "portfolio" && (
            <PortfolioView
              holdings={holdings}
              marketAssets={marketAssets}
              onAddTransaction={handleAddTransaction}
              onRemoveHolding={handleRemoveHolding}
              onViewAssetDetail={handleViewAssetDetail}
            />
          )}

          {currentTab === "market" && (
            <MarketAnalysisView
              marketAssets={marketAssets}
              onSelectTicker={handleSelectTickerForChat}
              onViewAssetDetail={handleViewAssetDetail}
              onAddWatchlist={handleAddWatchlist}
              watchlistSymbols={watchlistSymbols}
            />
          )}

          {currentTab === "insights" && (
            <AIInsightsView
              initialTickerQuery={initialTickerQuery}
              marketAssets={marketAssets}
              onClearInitialQuery={() => setInitialTickerQuery(undefined)}
            />
          )}

          {currentTab === "settings" && (
            <div className="space-y-6" id="settings-view">
              <div>
                <h2 className="font-sans font-bold text-2xl text-foreground">Platform Preferences</h2>
                <p className="text-muted-fg text-sm mt-0.5">Control secure parameters and local states of your client terminals.</p>
              </div>

              <div className="bg-card border border-[#e2e8f0] p-6 rounded-xl space-y-4 max-w-xl">
                <span className="text-xs font-semibold text-muted-fg uppercase tracking-widest block">Secure Keys Configuration</span>
                <p className="text-xs text-muted-fg leading-relaxed font-sans">
                  The API keys for GenAI and third-party gateways are managed securely under server-side variables, entirely locked away from browser inspectors.
                </p>

                <div className="space-y-2 pt-3 border-t border-[#f1f5f9]" id="preferences-toggle-controls">
                  <div className="flex items-center justify-between text-xs py-2">
                    <span className="font-semibold text-muted-fg">Local Language Accent</span>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setLanguage("vi")}
                        className={`px-2 py-1 rounded font-bold text-xs ${language === "vi" ? "bg-primary text-primary-fg" : "bg-muted text-foreground"}`}
                      >VI</button>
                      <button 
                        onClick={() => setLanguage("en")}
                        className={`px-2 py-1 rounded font-bold text-xs ${language === "en" ? "bg-primary text-primary-fg" : "bg-muted text-foreground"}`}
                      >EN</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs py-2 border-t border-border">
                    <span className="font-semibold text-muted-fg">UI Theme Preference</span>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setTheme("light")}
                        className={`px-2 py-1 rounded font-bold text-xs ${theme === "light" ? "bg-primary text-primary-fg" : "bg-muted text-foreground"}`}
                      >Light</button>
                      <button 
                        onClick={() => setTheme("dark")}
                        className={`px-2 py-1 rounded font-bold text-xs ${theme === "dark" ? "bg-primary text-primary-fg" : "bg-muted text-foreground"}`}
                      >Dark</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs py-2 border-t border-border">
                    <span className="font-semibold text-muted-fg">Secure Environment Encrypted</span>
                    <span className="font-mono text-[10px] text-muted-fg font-bold">AES-GCM-256</span>
                  </div>
                  <div className="flex items-center justify-between text-xs py-2 border-t border-border gap-4">
                    <span className="font-semibold text-muted-fg">Market Data Source</span>
                    <span className="text-xs font-mono text-muted-fg text-right">
                      {marketDataStatus.providerStatus
                        ? `${marketDataStatus.providerStatus.stocks} / ${marketDataStatus.providerStatus.crypto}`
                        : marketDataStatus.source}
                    </span>
                  </div>
                  {marketDataStatus.providerStatus?.database && (
                    <div className="flex items-center justify-between text-xs py-2 border-t border-border gap-4">
                      <span className="font-semibold text-muted-fg">Local Market Database</span>
                      <span className="text-xs font-mono text-muted-fg text-right">
                        {marketDataStatus.providerStatus.database}
                      </span>
                    </div>
                  )}
                  {marketDataStatus.errors.length > 0 && (
                    <div className="text-[10px] text-accent bg-warning/10 border border-warning/30 p-2 rounded font-bold">
                      {marketDataStatus.errors[0]}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
      </div>

      {/* 3. Immersive Bottom Status Rail */}
      <footer className="h-8 bg-muted text-foreground flex items-center overflow-hidden text-[9px] font-bold tracking-widest uppercase select-none shrink-0 border-t border-border relative whitespace-nowrap" id="bottom-status-rail">
        <div className="flex items-center gap-10 min-w-max animate-marquee w-full">
          <span className="text-amber-600 dark:text-primary">{t("systemStatus")}</span>
          <span className="hidden sm:inline">{t("coordinates")}</span>
          <span className="hidden md:inline text-muted-fg">{t("buildInfo")}</span>
          <span className="text-amber-600 dark:text-primary flex items-center gap-2">
            <span>{t("surveillanceRibbon")}</span>
            <div className="w-1.5 h-1.5 bg-emerald-500 dark:bg-emerald-400 rounded-full animate-pulse"></div>
          </span>
          {marketAssets.slice(0, 7).map(asset => (
            <span
              key={asset.symbol}
              className={asset.changePercent >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}
            >
              {asset.symbol}: {asset.changePercent >= 0 ? "+" : ""}{asset.changePercent.toFixed(2)}%
            </span>
          ))}
          <span>{t("flowIndex")}</span>
        </div>
      </footer>

      <FloatingAIChatBubble
        marketAssets={marketAssets}
        currentTab={currentTab}
        onOpenPredictor={() => setCurrentTab("insights")}
      />
      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
    </div>
  );
}
