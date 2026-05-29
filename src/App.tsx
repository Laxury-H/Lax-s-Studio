import { useState } from "react";
import Sidebar from "./components/Sidebar";
import DashboardView from "./components/DashboardView";
import PortfolioView from "./components/PortfolioView";
import MarketAnalysisView from "./components/MarketAnalysisView";
import AIInsightsView from "./components/AIInsightsView";
import { INITIAL_HOLDINGS, MARKET_ASSETS } from "./data";
import { Holding, MarketAsset } from "./types";
import { Bell, Sparkles, X, Star, CreditCard, ShieldCheck } from "lucide-react";

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>("dashboard");
  const [holdings, setHoldings] = useState<Holding[]>(INITIAL_HOLDINGS);
  const [marketAssets, setMarketAssets] = useState<MarketAsset[]>(MARKET_ASSETS);
  const [watchlist, setWatchlist] = useState<MarketAsset[]>(MARKET_ASSETS.slice(0, 4));
  
  // State to transition custom prompt inputs from Dashboard/Markets into the AI Chat
  const [initialTickerQuery, setInitialTickerQuery] = useState<string | undefined>(undefined);
  
  // Professional premium modal trigger
  const [isProModalOpen, setIsProModalOpen] = useState(false);
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
          onRequestProModal={() => setIsProModalOpen(true)}
        />

        {/* 2. Main Workspace Scrollable Context Client Area */}
        <div className="flex-1 flex flex-col h-full overflow-y-auto relative bg-[#F3F3F3]" id="workspace-viewport">
          
          {/* Top Header Controls Bar */}
          <header className="bg-white border-b-2 border-black h-16 px-8 flex items-center justify-between sticky top-0 z-40 select-none" id="app-header-controls">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-black bg-[#FFD600] border border-black px-2.5 py-1">Live Feed Pipeline</span>
            </div>

            <div className="flex items-center gap-4">
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
                  HN
                </div>
                <div className="hidden md:block text-left">
                  <span className="text-xs font-black text-black block leading-none uppercase">Huy Nguyen</span>
                  <span className="text-[9px] text-[#0047FF] font-black mt-0.5 block leading-none tracking-widest uppercase">AI EXPLORER</span>
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
      <footer className="h-8 bg-black text-white flex items-center px-8 justify-between text-[9px] font-bold tracking-widest uppercase select-none shrink-0 border-t border-black" id="bottom-status-rail">
        <div className="flex items-center gap-10">
          <span className="text-[#FFD600]">SYSTEM_STATUS: ACTIVE</span>
          <span className="hidden sm:inline">COORDINATES: HN.210285° N // 105.8542° E</span>
          <span className="hidden md:inline text-white/50">BUILD: STABLE_BUILD_v2.0</span>
        </div>
        <div className="flex items-center gap-4">
          <span>SURVEILLANCE FLOW INDEX: 72% OPT</span>
          <div className="w-1.5 h-1.5 bg-[#00FF00] rounded-full animate-pulse"></div>
        </div>
      </footer>

      {/* Premium upgrade Pro popup Modal overlay */}
      {isProModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in" onClick={() => setIsProModalOpen(false)}>
          <div 
            className="bg-white rounded-xs shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-md overflow-hidden border-2 border-black"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b-2 border-black bg-[#FFD600] flex items-center justify-between">
              <div className="flex items-center gap-2 text-black">
                <Sparkles className="w-4 h-4 fill-current text-black" />
                <span className="text-xs font-black uppercase tracking-wider">SELECT PRO PREDICTOR TIER</span>
              </div>
              <button onClick={() => setIsProModalOpen(false)} className="text-black hover:text-red-600 text-xs font-black">✕</button>
            </div>

            <div className="p-6 space-y-5 text-center">
              <div className="w-14 h-14 border-2 border-black rounded-xs bg-[#F3F3F3] text-black flex items-center justify-center mx-auto shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-sans font-black text-xl text-black uppercase tracking-tight italic">PREMIUM INTELLIGENCE CONTAINER</h3>
                <p className="text-xs text-black/70 max-w-sm mx-auto leading-relaxed mt-1 font-semibold">
                  Gain institutional grade capabilities including high-frequency news feeds, 24/7 financial grounding predictors and sector alerts.
                </p>
              </div>

              <div className="border border-black p-4 rounded-xs text-left bg-[#F3F3F3] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex items-center justify-between border-b border-black/10 pb-2">
                  <span className="text-xs font-black text-black uppercase tracking-wide">STUDIO.FP PRO COMPONENT</span>
                  <span className="text-xs font-mono text-[#0047FF] font-black">$29 / MONTH</span>
                </div>
                <ul className="text-[10px] text-black/80 mt-2.5 space-y-1.5 font-bold uppercase tracking-wide list-none">
                  <li>➔ PREMIUM NOISE CANCELLING FILTERS</li>
                  <li>➔ UNLIMITED TECHNICAL CHAT SUMMARIZATION</li>
                  <li>➔ PAID NEURAL MODEL GROUNDING CALIBRATED</li>
                </ul>
              </div>

              <div className="pt-4 flex items-center gap-3 justify-end border-t border-black/20">
                <button
                  type="button"
                  onClick={() => setIsProModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-black uppercase text-black/60 hover:text-black"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsProModalOpen(false);
                    triggerInlineNotification("PRO SUBSCRIPTION SECURELY REGISTERED.");
                  }}
                  className="px-6 py-2.5 text-xs font-black uppercase text-white bg-[#0047FF] hover:bg-black border border-black hover:text-[#FFD600] rounded-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer"
                >
                  Activate Pro Trial
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
