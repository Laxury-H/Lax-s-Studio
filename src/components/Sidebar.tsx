import { 
  LayoutDashboard, 
  Star, 
  TrendingUp, 
  Sparkles, 
  Briefcase, 
  Settings, 
  HelpCircle,
  TrendingDown,
  PanelLeftClose,
  PanelLeft
} from "lucide-react";
import { useSettings } from "../SettingsContext";

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ currentTab, onTabChange, isCollapsed, onToggleCollapse }: SidebarProps) {
  const { t } = useSettings();
  
  const menuItems = [
    { id: "dashboard", label: t("dashboard"), icon: LayoutDashboard },
    { id: "watchlist", label: t("watchlist"), icon: Star },
    { id: "market", label: "MARKET WATCH", icon: TrendingUp },
    { id: "insights", label: "AI PREDICTOR", icon: Sparkles },
    { id: "portfolio", label: t("portfolio"), icon: Briefcase },
  ];

  return (
    <aside 
      className={`${isCollapsed ? 'w-[88px] px-4' : 'w-64 px-6'} py-6 bg-background border-r-2 border-border flex flex-col justify-between h-full select-none shrink-0 transition-all duration-300 relative`} 
      id="sidebar-container"
    >
      {/* Collapse Toggle Button */}
      <button 
        onClick={onToggleCollapse}
        className="absolute -right-3.5 top-6 bg-card border-2 border-border rounded-full p-1 text-foreground hover:text-primary transition-colors z-50 cursor-pointer shadow-md"
        title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        {isCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
      </button>

      {/* Brand Header */}
      <div className={`flex ${isCollapsed ? 'flex-col items-center' : 'flex-col'} mb-8`} id="sidebar-brand-header">
        <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="relative w-12 h-12 shrink-0 flex items-center justify-center rounded-2xl bg-gradient-to-br from-[#FFD600] to-[#FF8A00] p-[2px] shadow-[0_0_20px_rgba(255,214,0,0.2)] dark:shadow-[0_0_20px_rgba(255,214,0,0.1)] group" id="brand-logo">
            <div className="w-full h-full bg-card rounded-[14px] flex items-center justify-center relative overflow-hidden cursor-pointer">
              {/* Inner subtle glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-[#FFD600] blur-[12px] opacity-20 group-hover:opacity-50 transition-opacity duration-500"></div>
              {/* Geometric L-Chart SVG */}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative z-10 transform group-hover:scale-110 group-hover:-translate-y-0.5 transition-all duration-500">
                <defs>
                  <linearGradient id="logo-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#FFD600" />
                    <stop offset="100%" stopColor="#FF8A00" />
                  </linearGradient>
                </defs>
                <path d="M4 20H19L14 15H9V4L4 9V20Z" fill="url(#logo-grad)"/>
                <circle cx="18" cy="7" r="3" fill="#FF8A00" className="animate-pulse"/>
              </svg>
            </div>
          </div>
          {!isCollapsed && (
            <div>
              <h1 className="font-sans font-black text-xl text-foreground tracking-tighter leading-none italic uppercase whitespace-nowrap">Lax's Studio</h1>
              <span className="text-[9px] text-foreground/60 font-bold uppercase tracking-widest block mt-0.5 whitespace-nowrap">FinPilot Intelligence</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Navigation Menu */}
      <nav className={`flex-1 space-y-2.5 ${isCollapsed ? 'flex flex-col items-center' : ''}`} id="sidebar-menu">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              id={`sidebar-item-${item.id}`}
              onClick={() => onTabChange(item.id)}
              className={`${isCollapsed ? 'w-12 h-12 justify-center' : 'w-full px-4'} flex items-center gap-3 py-3 border border-border rounded-xl text-xs font-black tracking-wider transition-all duration-100 uppercase ${
                isActive
                  ? "bg-primary text-primary-fg shadow-lg shadow-black/5 dark:shadow-black/20"
                  : "bg-card text-foreground hover:bg-accent hover:shadow-lg shadow-black/5 dark:shadow-black/20"
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-primary-fg" : "text-foreground"}`} />
              {!isCollapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className={`mt-auto space-y-6 ${isCollapsed ? 'flex flex-col items-center' : ''}`} id="sidebar-footer">
        {/* Footer actions */}
        <div className={`space-y-1.5 pt-4 border-t border-border/20 ${isCollapsed ? 'w-full flex flex-col items-center' : ''}`}>
          <button 
            onClick={() => onTabChange("settings")}
            className={`${isCollapsed ? 'w-12 h-12 justify-center' : 'w-full px-4'} flex items-center gap-3 py-2 border rounded-xl text-xs font-black transition-all uppercase ${
              currentTab === "settings"
                ? "bg-muted text-foreground border-border"
                : "bg-card text-foreground border-transparent hover:border-border hover:bg-muted"
            }`}
            id="sidebar-item-settings"
            title={isCollapsed ? t("settings") : undefined}
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
            {!isCollapsed && <span>{t("settings")}</span>}
          </button>
          <a
            href="mailto:laxworkspace@gmail.com"
            className={`${isCollapsed ? 'w-12 h-12 justify-center' : 'w-full px-4'} flex items-center gap-3 py-2 border border-transparent rounded-xl text-xs font-black text-foreground/60 bg-card hover:border-border hover:text-foreground transition-all uppercase`}
            id="sidebar-item-support"
            title={isCollapsed ? "Support" : undefined}
          >
            <HelpCircle className="w-3.5 h-3.5 shrink-0" />
            {!isCollapsed && <span>Support</span>}
          </a>
        </div>
      </div>
    </aside>
  );
}
