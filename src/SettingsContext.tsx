import React, { createContext, useContext, useState, useEffect } from "react";

type Language = "en" | "vi";
type Theme = "light" | "dark";

interface Translations {
  [key: string]: {
    en: string;
    vi: string;
  };
}

export const translations: Translations = {
  dashboard: { en: "DASHBOARD", vi: "BẢNG ĐIỀU KHIỂN" },
  watchlist: { en: "WATCHLIST", vi: "THEO DÕI" },
  portfolio: { en: "PORTFOLIO", vi: "DANH MỤC" },
  market: { en: "MARKET AI", vi: "THỊ TRƯỜNG AI" },
  insights: { en: "NEURAL CHAT", vi: "CHAT NEURAL" },
  settings: { en: "SYSTEM CONFIG", vi: "CẤU HÌNH HỆ THỐNG" },
  liveFeed: { en: "Live Feed Pipeline", vi: "Luồng Dữ Liệu Trực Tiếp" },
  surveillanceWorkspace: { en: "SURVEILLANCE WORKSPACE", vi: "KHÔNG GIAN GIÁM SÁT" },
  aiExplorer: { en: "AI EXPLORER", vi: "KHÁM PHÁ AI" },
  systemStatus: { en: "SYSTEM_STATUS: ACTIVE", vi: "TRẠNG_THÁI: HOẠT ĐỘNG" },
  coordinates: { en: "COORDINATES: HN.210285° N // 105.8542° E", vi: "TỌA ĐỘ: HN.210285° N // 105.8542° E" },
  buildInfo: { en: "BUILD: STABLE_BUILD_v2.0", vi: "BẢN DỰNG: STABLE_BUILD_v2.0" },
  surveillanceRibbon: { en: "SURVEILLANCE RIBBON : LIVE PIPELINE", vi: "BĂNG GIÁM SÁT : LUỒNG TRỰC TIẾP" },
  flowIndex: { en: "SURVEILLANCE FLOW INDEX: 72% OPT", vi: "CHỈ SỐ LƯU LƯỢNG GIÁM SÁT: 72% OPT" },
  changeTheme: { en: "Toggle Theme", vi: "Đổi Giao Diện" },
  changeLanguage: { en: "Change Language", vi: "Đổi Ngôn Ngữ" },
  surveillanceList: { en: "SURVEILLANCE LIST", vi: "DANH SÁCH GIÁM SÁT" },
  marketIntelligence: { en: "MARKET INTELLIGENCE", vi: "THÔNG MINH THỊ TRƯỜNG" }
};

export interface SettingsContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  pinnedSymbols: string[];
  setPinnedSymbols: (symbols: string[]) => void;
  t: (key: string) => string;
}

export const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>("en");
  const [theme, setThemeState] = useState<Theme>("light");
  const [pinnedSymbols, setPinnedSymbolsState] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => {
        if (data.language) setLanguageState(data.language as Language);
        if (data.theme) setThemeState(data.theme as Theme);
        if (data.pinnedSymbols) {
          try {
            setPinnedSymbolsState(JSON.parse(data.pinnedSymbols));
          } catch(e){}
        }
        setIsLoaded(true);
      })
      .catch(() => setIsLoaded(true));
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    if (isLoaded) {
      fetch("/api/settings", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ language: lang }) 
      }).catch(console.error);
    }
  };

  const setTheme = (t: Theme) => {
    setThemeState(t);
    if (isLoaded) {
      fetch("/api/settings", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ theme: t }) 
      }).catch(console.error);
    }
  };

  const setPinnedSymbols = (symbols: string[]) => {
    setPinnedSymbolsState(symbols);
    if (isLoaded) {
      fetch("/api/settings", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ pinnedSymbols: JSON.stringify(symbols) }) 
      }).catch(console.error);
    }
  };

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const t = (key: string) => {
    return translations[key]?.[language] || key;
  };

  return (
    <SettingsContext.Provider value={{ language, setLanguage, theme, setTheme, pinnedSymbols, setPinnedSymbols, t }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
};
