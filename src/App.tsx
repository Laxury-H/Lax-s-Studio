import { useState } from "react";
import Sidebar from "./components/Sidebar";
import DashboardView from "./components/DashboardView";
import PortfolioView from "./components/PortfolioView";
import MarketAnalysisView from "./components/MarketAnalysisView";
import AIInsightsView from "./components/AIInsightsView";
import { INITIAL_HOLDINGS, MARKET_ASSETS } from "./data";
import { Holding, MarketAsset } from "./types";
import { Bell, Sparkles, X, Star, CreditCard, ShieldCheck } from "lucide-react";
import { useSettings } from "./SettingsContext";

export default function App() {
  const { language, setLanguage, theme, setTheme, t } = useSettings();
  const [currentTab, setCurrentTab] = useState<string>("dashboard");
  const [holdings, setHoldings] = useState<Holding[]>(INITIAL_HOLDINGS);
  const [marketAssets, setMarketAssets] = useState<MarketAsset[]>(MARKET_ASSETS);
  const [watchlist, setWatchlist] = useState<MarketAsset[]>(MARKET_ASSETS.slice(0, 4));
  
  // State to transition custom prompt inputs from Dashboard/Markets into the AI Chat
  const [initialTickerQuery, setInitialTickerQuery] = useState<string | undefined>(undefined);
  
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

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
              <span className="text-[10px] font-black uppercase tracking-wider text-black bg-[#FFD600] border border-black px-2.5 py-1">{t("liveFeed")}</span>
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
          <span className="text-emerald-400">AAPL: +1.24%</span>
          <span className="text-red-400">TSLA: -0.82%</span>
          <span className="text-emerald-400">BTC: +4.15%</span>
          <span className="text-emerald-400">ETH: +2.11%</span>
          <span className="text-red-400">META: -1.05%</span>
          <span className="text-emerald-400">NVDA: +3.20%</span>
          <span>{t("flowIndex")}</span>
        </div>
      </footer>

    </div>
  );
}
