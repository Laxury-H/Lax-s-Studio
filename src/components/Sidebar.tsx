import { 
  LayoutDashboard, 
  Star, 
  TrendingUp, 
  Sparkles, 
  Briefcase, 
  Settings, 
  HelpCircle,
  TrendingDown
} from "lucide-react";

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onRequestProModal?: () => void;
}

export default function Sidebar({ currentTab, onTabChange, onRequestProModal }: SidebarProps) {
  const menuItems = [
    { id: "dashboard", label: "DASHBOARD", icon: LayoutDashboard },
    { id: "watchlist", label: "WATCHLIST", icon: Star },
    { id: "market", label: "MARKET WATCH", icon: TrendingUp },
    { id: "insights", label: "AI PREDICTOR", icon: Sparkles },
    { id: "portfolio", label: "PORTFOLIO", icon: Briefcase },
  ];

  return (
    <aside className="w-64 bg-[#F3F3F3] border-r-2 border-black flex flex-col justify-between h-screen sticky top-0 p-6 select-none shrink-0" id="sidebar-container">
      {/* Brand Header */}
      <div className="flex flex-col mb-8" id="sidebar-brand-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 border border-black bg-[#0047FF] flex items-center justify-center text-white font-black text-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] rounded-xs" id="brand-logo">
            FP
          </div>
          <div>
            <h1 className="font-sans font-black text-xl text-black tracking-tighter leading-none italic uppercase">STUDIO.FP</h1>
            <span className="text-[9px] text-black/60 font-bold uppercase tracking-widest block mt-0.5">FinPilot Intelligence</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Menu */}
      <nav className="flex-1 space-y-2.5" id="sidebar-menu">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              id={`sidebar-item-${item.id}`}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 border border-black rounded-xs text-xs font-black tracking-wider transition-all duration-100 uppercase ${
                isActive
                  ? "bg-[#0047FF] text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                  : "bg-white text-black hover:bg-[#FFD600] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-black"}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Promotional upgrade block */}
      <div className="mt-auto space-y-6" id="sidebar-footer">
        <div className="bg-white border-2 border-black p-4 rounded-xs shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden" id="pro-banner">
          <div className="relative z-10">
            <h4 className="font-black text-black text-xs uppercase tracking-tight italic">UPGRADE TO PRO</h4>
            <p className="text-[10px] text-black/70 mt-1 leading-relaxed font-bold">
              Unlock advanced neural predictors, live surveillance ribbons & professional trade grounding.
            </p>
            <button 
              onClick={onRequestProModal}
              className="mt-3.5 w-full bg-[#FFD600] text-black text-[10px] tracking-widest font-black py-2.5 px-3 border border-black hover:bg-black hover:text-white transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase"
            >
              Go Premium
            </button>
          </div>
        </div>

        {/* Footer actions */}
        <div className="space-y-1.5 pt-4 border-t border-black/20">
          <button 
            onClick={() => onTabChange("settings")}
            className={`w-full flex items-center gap-3 px-4 py-2 border rounded-xs text-xs font-black transition-all uppercase ${
              currentTab === "settings"
                ? "bg-black text-white border-black"
                : "bg-white text-black border-transparent hover:border-black hover:bg-neutral-50"
            }`}
            id="sidebar-item-settings"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
          <a
            href="mailto:laxworkspace@gmail.com"
            className="w-full flex items-center gap-3 px-4 py-2 border border-transparent rounded-xs text-xs font-black text-black/60 bg-white hover:border-black hover:text-black transition-all uppercase"
            id="sidebar-item-support"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Support</span>
          </a>
        </div>
      </div>
    </aside>
  );
}
