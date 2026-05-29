import { useCallback, useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import DashboardView from "./components/DashboardView";
import PortfolioView from "./components/PortfolioView";
import MarketAnalysisView from "./components/MarketAnalysisView";
import AIInsightsView from "./components/AIInsightsView";
import { INITIAL_HOLDINGS, MARKET_ASSETS } from "./data";
import { Holding, MarketAsset, MarketDataResponse } from "./types";
import { Bell, RefreshCw, ShieldCheck } from "lucide-react";
import { useSettings } from "./SettingsContext";

export default function App() {
  const { language, setLanguage, theme, setTheme, t } = useSettings();
  const [currentTab, setCurrentTab] = useState<string>("dashboard");
  const [holdings, setHoldings] = useState<Holding[]>(INITIAL_HOLDINGS);
  const [marketAssets, setMarketAssets] = useState<MarketAsset[]>(MARKET_ASSETS);
  const [watchlist, setWatchlist] = useState<MarketAsset[]>(MARKET_ASSETS.slice(0, 4));
  const [marketDataStatus, setMarketDataStatus] = useState<{
    isLoading: boolean;
    source: MarketDataResponse["source"];
    updatedAt?: string;
    errors: string[];
    providerStatus?: MarketDataResponse["providerStatus"];
    error?: string | null;
  }>({
    isLoading: false,
    source: "mock",
    errors: []
  });
  
  // State to transition custom prompt inputs from Dashboard/Markets into the AI Chat
  const [initialTickerQuery, setInitialTickerQuery] = useState<string | undefined>(undefined);
  
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const syncMarketAssets = useCallback((assets: MarketAsset[]) => {
    const bySymbol = new Map(assets.map(asset => [asset.symbol, asset]));

    setMarketAssets(assets);
    setWatchlist(prev => prev.map(item => bySymbol.get(item.symbol) || item));
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
        syncMarketAssets(data.assets);
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
  const handleAddTransaction = (newHolding: Omit<Holding, "id">) => {
    const id = "h_u_" + Date.now();
    const resolvedHolding: Holding = {
      ...newHolding,
      id
    };
    setHoldings([resolvedHolding, ...holdings]);
    triggerInlineNotification(`Successfully updated transactions: +${newHolding.qty} ${newHolding.asset}`);
  };

  const handleRemoveHolding = (id: string) => {
    const target = holdings.find(h => h.id === id);
    if (target) {
      setHoldings(holdings.filter(h => h.id !== id));
      triggerInlineNotification(`Removed asset holding: ${target.asset}`);
    }
  };

  const handleAddWatchlist = (asset: MarketAsset) => {
    const exists = watchlist.some(w => w.symbol === asset.symbol);
    if (exists) {
      setWatchlist(watchlist.filter(w => w.symbol !== asset.symbol));
      triggerInlineNotification(`Removed from Watchlist: ${asset.symbol}`);
    } else {
      setWatchlist([...watchlist, asset]);
      triggerInlineNotification(`Added to Watchlist: ${asset.symbol}`);
    }
  };

  const handleRemoveWatchlistSymbol = (symbol: string) => {
    setWatchlist(watchlist.filter(w => w.symbol !== symbol));
    triggerInlineNotification(`Removed from Watchlist: ${symbol}`);
  };

  const handleReorderWatchlist = (draggedSymbol: string, targetSymbol: string) => {
    setWatchlist(prev => {
      const oldIndex = prev.findIndex(item => item.symbol === draggedSymbol);
      const newIndex = prev.findIndex(item => item.symbol === targetSymbol);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev;
      const newWatchlist = [...prev];
      const [moved] = newWatchlist.splice(oldIndex, 1);
      newWatchlist.splice(newIndex, 0, moved);
      return newWatchlist;
    });
  };

  // Select a ticker from Dashboard/Market grid to trigger full AI chat
  const handleSelectTickerForChat = (tickerSymbol: string) => {
    setInitialTickerQuery(tickerSymbol);
    setCurrentTab("insights");
  };

  const triggerInlineNotification = (message: string) => {
    setAlertMessage(message);
    setTimeout(() => {
      setAlertMessage(null);
    }, 4000);
  };

  const watchlistSymbols = watchlist.map(w => w.symbol);
  const marketStatusTime = marketDataStatus.updatedAt
    ? new Date(marketDataStatus.updatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "offline";

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#F3F3F3] text-black font-sans antialiased" id="app-viewport">
      
      <div className="flex-1 flex overflow-hidden">
        {/* 1. Global Left Navigation Panel */}
        <Sidebar 
          currentTab={currentTab} 
          onTabChange={setCurrentTab} 
        />

        {/* 2. Main Workspace Scrollable Context Client Area */}
        <div className="flex-1 flex flex-col h-full overflow-y-auto relative bg-[#F3F3F3]" id="workspace-viewport">
          
          {/* Top Header Controls Bar */}
          <header className="bg-white border-b-2 border-black h-16 px-8 flex items-center justify-between sticky top-0 z-40 select-none" id="app-header-controls">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-black bg-[#FFD600] border border-black px-2.5 py-1">
                {marketDataStatus.source.toUpperCase()} DATA · {marketStatusTime}
              </span>
              <button
                onClick={() => fetchMarketData(true)}
                disabled={marketDataStatus.isLoading}
                className="p-1.5 border border-black bg-white text-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] disabled:opacity-60 hover:bg-black hover:text-[#FFD600] transition-all cursor-pointer"
                title={marketDataStatus.error || t("liveFeed")}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${marketDataStatus.isLoading ? "animate-spin" : ""}`} />
              </button>
            </div>

            <div className="flex items-center gap-4">
              {/* Settings, language, theme toggles */}
              <div className="flex items-center gap-2 border-r border-black pr-4 mr-1">
                <button
                  onClick={() => setLanguage(language === "en" ? "vi" : "en")}
                  className="font-bold text-xs uppercase border border-black px-2 py-1 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[0.5px] active:translate-y-[1px] transition-all cursor-pointer bg-white text-black min-w-[32px] text-center"
                  title={t("changeLanguage")}
                >
                  {language.toUpperCase()}
                </button>
                <button
                  onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                  className="p-1.5 border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[0.5px] active:translate-y-[1px] transition-all cursor-pointer bg-white text-black"
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
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => triggerInlineNotification("Core telemetry stream calibrated at 24ms network speed.")}
                  className="p-2 text-black hover:bg-neutral-100 border border-transparent hover:border-black rounded-xs relative cursor-pointer"
                  title="System signals status"
                >
                  <div className="w-2 h-2 rounded-full bg-[#00FF00] border border-black absolute top-1 right-1 animate-pulse" />
                  <Bell className="w-4 h-4 text-black" />
                </button>
              </div>

              {/* Profile widget user */}
              <div className="flex items-center gap-2.5 pl-3 border-l border-black" id="user-profile-badge">
                <div className="w-8 h-8 rounded-xs border border-black bg-[#0047FF] text-white font-black text-xs flex items-center justify-center">
                  LX
                </div>
                <div className="hidden md:block text-left">
                  <span className="text-xs font-black text-black block leading-none uppercase">Laxurie</span>
                  <span className="text-[9px] text-[#0047FF] font-black mt-0.5 block leading-none tracking-widest uppercase">{t("aiExplorer")}</span>
                </div>
              </div>
            </div>
          </header>

          {/* Floating Quick Action Alerts Notification Popup */}
          {alertMessage && (
            <div className="fixed bottom-12 right-6 z-50 bg-[#FFD600] text-black text-xs font-black px-4 py-3 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center gap-2 animate-bounce" id="floating-banner-alert">
              <ShieldCheck className="w-4 h-4 text-black" />
              <span className="uppercase tracking-tight">{alertMessage}</span>
              <button onClick={() => setAlertMessage(null)} className="ml-2 hover:text-red-600 font-bold font-sans">✕</button>
            </div>
          )}

        {/* View Layout Container Router switcher inside workspace viewports */}
        <main className="flex-1 p-8" id="workspace-container">
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
              onRemoveWatchlist={handleRemoveWatchlistSymbol}
              onReorderWatchlist={handleReorderWatchlist}
            />
          )}

          {currentTab === "watchlist" && (
            <div className="space-y-6" id="watchlist-standalone-view">
              <div>
                <h2 className="font-sans font-bold text-2xl text-[#0b1c30] tracking-tight">Watchlist Settings</h2>
                <p className="text-gray-500 text-sm mt-0.5">Toggle tracking parameters for rapid surveillance ticker feeds.</p>
              </div>

              <div className="bg-white border border-[#e2e8f0] p-6 rounded-xl space-y-4">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest block">Selected Assets under Surveillance ({watchlist.length})</span>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="watchlist-elements-rack">
                  {marketAssets.map((asset) => {
                    const isAdded = watchlistSymbols.includes(asset.symbol);
                    return (
                      <div key={asset.symbol} className="border border-gray-100 p-4 rounded-lg flex items-center justify-between bg-gray-50">
                        <div>
                          <span className="font-mono font-bold text-xs text-[#5856d6]">{asset.symbol}</span>
                          <span className="text-xs text-gray-500 font-medium block">{asset.name}</span>
                        </div>
                        <button
                          onClick={() => handleAddWatchlist(asset)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                            isAdded ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "bg-[#eff4ff] text-[#5856d6] hover:bg-[#dce9ff]"
                          }`}
                        >
                          {isAdded ? "★ Tracked" : "☆ Add"}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-4 border-t border-[#f1f5f9] text-center">
                  <button 
                    onClick={() => setCurrentTab("dashboard")}
                    className="bg-[#5856d6] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#3f3bbd] transition-all"
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
            />
          )}

          {currentTab === "market" && (
            <MarketAnalysisView
              marketAssets={marketAssets}
              onSelectTicker={handleSelectTickerForChat}
              onAddWatchlist={handleAddWatchlist}
              watchlistSymbols={watchlistSymbols}
            />
          )}

          {currentTab === "insights" && (
            <AIInsightsView
              initialTickerQuery={initialTickerQuery}
              onClearInitialQuery={() => setInitialTickerQuery(undefined)}
            />
          )}

          {currentTab === "settings" && (
            <div className="space-y-6" id="settings-view">
              <div>
                <h2 className="font-sans font-bold text-2xl text-[#0b1c30]">Platform Preferences</h2>
                <p className="text-gray-500 text-sm mt-0.5">Control secure parameters and local states of your client terminals.</p>
              </div>

              <div className="bg-white border border-[#e2e8f0] p-6 rounded-xl space-y-4 max-w-xl">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest block">Secure Keys Configuration</span>
                <p className="text-xs text-gray-500 leading-relaxed font-sans">
                  The API keys for GenAI and third-party gateways are managed securely under server-side variables, entirely locked away from browser inspectors.
                </p>

                <div className="space-y-2 pt-3 border-t border-[#f1f5f9]" id="preferences-toggle-controls">
                  <div className="flex items-center justify-between text-xs py-2">
                    <span className="font-semibold text-gray-600">Local Language Accent</span>
                    <span className="text-xs font-mono text-gray-500">Vietnamese / English</span>
                  </div>
                  <div className="flex items-center justify-between text-xs py-2 border-t border-gray-50">
                    <span className="font-semibold text-gray-600">Data Density Profile</span>
                    <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-bold">Comfortable (16px)</span>
                  </div>
                  <div className="flex items-center justify-between text-xs py-2 border-t border-gray-50">
                    <span className="font-semibold text-gray-600">Secure Environment Encrypted</span>
                    <span className="font-mono text-[10px] text-gray-400 font-bold">AES-GCM-256</span>
                  </div>
                  <div className="flex items-center justify-between text-xs py-2 border-t border-gray-50 gap-4">
                    <span className="font-semibold text-gray-600">Market Data Source</span>
                    <span className="text-xs font-mono text-gray-500 text-right">
                      {marketDataStatus.providerStatus
                        ? `${marketDataStatus.providerStatus.stocks} / ${marketDataStatus.providerStatus.crypto}`
                        : marketDataStatus.source}
                    </span>
                  </div>
                  {marketDataStatus.errors.length > 0 && (
                    <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded font-bold">
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
      <footer className="h-8 bg-black text-white flex items-center overflow-hidden text-[9px] font-bold tracking-widest uppercase select-none shrink-0 border-t border-black relative whitespace-nowrap" id="bottom-status-rail">
        <div className="flex items-center gap-10 min-w-max animate-marquee w-full">
          <span className="text-[#FFD600]">{t("systemStatus")}</span>
          <span className="hidden sm:inline">{t("coordinates")}</span>
          <span className="hidden md:inline text-white/50">{t("buildInfo")}</span>
          <span className="text-[#FFD600] flex items-center gap-2">
            <span>{t("surveillanceRibbon")}</span>
            <div className="w-1.5 h-1.5 bg-[#00FF00] rounded-full animate-pulse"></div>
          </span>
          {marketAssets.slice(0, 7).map(asset => (
            <span
              key={asset.symbol}
              className={asset.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}
            >
              {asset.symbol}: {asset.changePercent >= 0 ? "+" : ""}{asset.changePercent.toFixed(2)}%
            </span>
          ))}
          <span>{t("flowIndex")}</span>
        </div>
      </footer>

    </div>
  );
}
