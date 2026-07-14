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
  PanelLeft,
  User
} from "lucide-react";
import { useSettings } from "../SettingsContext";

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenSupport?: () => void;
}

export default function Sidebar({ currentTab, onTabChange, isCollapsed, onToggleCollapse, onOpenSupport }: SidebarProps) {
  const { t } = useSettings();
  
  const menuItems = [
    { id: "dashboard", label: t("dashboard"), icon: LayoutDashboard },
    { id: "market", label: "MARKET WATCH", icon: TrendingUp },
    { id: "futures", label: t("futures"), icon: TrendingDown },
    { id: "portfolio", label: t("portfolio"), icon: Briefcase },
  ];

  return (
    <aside 
      className={`fixed bottom-0 left-0 right-0 z-[115] h-16 px-2 py-2 bg-background border-t-2 border-border flex items-center justify-between select-none shrink-0 md:relative md:z-auto md:h-full md:border-t-0 md:border-r-2 md:flex-col md:py-6 md:transition-all md:duration-300 ${isCollapsed ? 'md:w-[88px] md:px-4' : 'md:w-64 md:px-6'}`} 
      id="sidebar-container"
    >
      {/* Collapse Toggle Button */}
      <button 
        onClick={onToggleCollapse}
        className="hidden md:block absolute -right-3.5 top-6 bg-card border-2 border-border rounded-full p-1 text-foreground hover:text-primary transition-colors z-50 cursor-pointer shadow-md"
        title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        {isCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
      </button>

      {/* Brand Header */}
      <div className={`hidden md:flex ${isCollapsed ? 'flex-col items-center' : 'flex-col'} mb-8`} id="sidebar-brand-header">
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
      <nav className={`flex w-full items-center gap-1 md:flex-1 md:space-y-2.5 md:gap-0 ${isCollapsed ? 'md:flex md:flex-col md:items-center' : 'md:block'}`} id="sidebar-menu">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              id={`sidebar-item-${item.id}`}
              onClick={() => onTabChange(item.id)}
              className={`flex-1 h-12 min-w-0 justify-center px-2 md:flex-none md:min-w-0 ${isCollapsed ? 'md:w-12 md:h-12 md:justify-center' : 'md:w-full md:px-4 md:justify-start'} flex items-center gap-1 md:gap-3 md:py-3 border border-border rounded-xl text-xs font-black tracking-wider transition-all duration-200 uppercase ${
                isActive
                  ? "bg-radiant text-primary-fg shadow-lg shadow-primary/20 scale-[1.02]"
                  : "bg-card text-foreground hover:bg-muted hover:border-primary/50 hover:shadow-lg shadow-black/5 dark:shadow-black/20 hover:scale-[1.02] active:scale-[0.98]"
              }`}
              title={item.label}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-primary-fg" : "text-foreground"}`} />
              {!isCollapsed && <span className="hidden md:inline truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className={`hidden md:block mt-auto space-y-6 ${isCollapsed ? 'md:flex md:flex-col md:items-center' : ''}`} id="sidebar-footer">
        {/* Footer actions */}
        <div className={`space-y-1.5 pt-4 border-t border-border/20 ${isCollapsed ? 'w-full flex flex-col items-center' : ''}`}>
          <button 
            onClick={() => onTabChange("profile")}
            className={`${isCollapsed ? 'w-12 h-12 justify-center' : 'w-full px-4'} flex items-center gap-3 py-2 border rounded-xl text-xs font-black transition-all duration-200 uppercase ${
              currentTab === "profile"
                ? "bg-muted text-foreground border-border scale-[1.02]"
                : "bg-card text-foreground border-transparent hover:border-primary/50 hover:bg-muted hover:scale-[1.02] active:scale-[0.98]"
            }`}
            id="sidebar-item-profile"
            title={isCollapsed ? "Profile" : undefined}
          >
            <User className="w-3.5 h-3.5 shrink-0" />
            {!isCollapsed && <span>Profile</span>}
          </button>
          <button 
            onClick={() => onTabChange("settings")}
            className={`${isCollapsed ? 'w-12 h-12 justify-center' : 'w-full px-4'} flex items-center gap-3 py-2 border rounded-xl text-xs font-black transition-all duration-200 uppercase ${
              currentTab === "settings"
                ? "bg-muted text-foreground border-border scale-[1.02]"
                : "bg-card text-foreground border-transparent hover:border-primary/50 hover:bg-muted hover:scale-[1.02] active:scale-[0.98]"
            }`}
            id="sidebar-item-settings"
            title={isCollapsed ? t("settings") : undefined}
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
            {!isCollapsed && <span>{t("settings")}</span>}
          </button>
          <button
            onClick={onOpenSupport}
            className={`${isCollapsed ? 'w-12 h-12 justify-center' : 'w-full px-4'} flex items-center gap-3 py-2 border border-transparent rounded-xl text-xs font-black text-foreground/60 bg-card hover:border-primary/50 hover:text-foreground hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 uppercase cursor-pointer`}
            id="sidebar-item-support"
            title={isCollapsed ? "Support" : undefined}
          >
            <HelpCircle className="w-3.5 h-3.5 shrink-0" />
            {!isCollapsed && <span>Support</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}
