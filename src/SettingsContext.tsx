import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { formatCurrencyValue, isDisplayCurrency, SUPPORTED_DISPLAY_CURRENCIES } from "./currency";
import type { DisplayCurrency, FxRatesResponse } from "./types";

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
  futures: { en: "FUTURES HUB", vi: "GIAO DỊCH FUTURES" },
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
  changeLanguage: { en: "AI Response Language", vi: "Ngôn Ngữ Phản Hồi AI" },
  surveillanceList: { en: "SURVEILLANCE LIST", vi: "DANH SÁCH GIÁM SÁT" },
  marketIntelligence: { en: "MARKET INTELLIGENCE", vi: "THÔNG MINH THỊ TRƯỜNG" }
};

export interface SettingsContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (currency: DisplayCurrency) => void;
  fxRates: Record<string, number>;
  fxUpdatedAt?: string;
  fxProvider?: string;
  fxError?: string | null;
  formatMoney: (value: number, sourceCurrency?: string, options?: { compact?: boolean }) => string;
  pinnedSymbols: string[];
  setPinnedSymbols: (symbols: string[]) => void;
  volatilityFilter: number;
  setVolatilityFilter: (val: number) => void;
  selectedExchange: string;
  setSelectedExchange: (exchange: string) => void;
  connectedExchanges: string[];
  reloadSettings: () => Promise<void>;
  t: (key: string) => string;
}

export const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>("en");
  const [theme, setThemeState] = useState<Theme>("light");
  const [displayCurrency, setDisplayCurrencyState] = useState<DisplayCurrency>("USD");
  const [fxRates, setFxRates] = useState<Record<string, number>>({ USD: 1 });
  const [fxUpdatedAt, setFxUpdatedAt] = useState<string | undefined>(undefined);
  const [fxProvider, setFxProvider] = useState<string | undefined>(undefined);
  const [fxError, setFxError] = useState<string | null>(null);
  const [pinnedSymbols, setPinnedSymbolsState] = useState<string[]>([]);
  const [volatilityFilter, setVolatilityFilterState] = useState<number>(0);
  const [selectedExchange, setSelectedExchangeState] = useState<string>("binance");
  const [connectedExchanges, setConnectedExchanges] = useState<string[]>(["binance"]);
  const [isLoaded, setIsLoaded] = useState(false);

  const reloadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.status === 401) {
        setIsLoaded(true);
        return;
      }
      if (!res.ok) throw new Error(`Settings request failed with ${res.status}`);

      const data = await res.json();
      if (data.language && data.language !== "en") {
        fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language: "en" })
        }).catch(console.error);
      }
      setLanguageState("en");
      if (data.theme) {
        setThemeState(data.theme as Theme);
      } else {
        setThemeState("light");
      }
      if (isDisplayCurrency(data.displayCurrency)) {
        setDisplayCurrencyState(data.displayCurrency);
      } else {
        setDisplayCurrencyState("USD");
      }
      if (data.pinnedSymbols) {
        try {
          setPinnedSymbolsState(JSON.parse(data.pinnedSymbols));
        } catch {}
      } else {
        setPinnedSymbolsState([]);
      }
      if (data.volatilityFilter !== undefined) {
        setVolatilityFilterState(Number(data.volatilityFilter));
      } else {
        setVolatilityFilterState(0);
      }

      // Load connected exchanges
      try {
        const exRes = await fetch("/api/settings/exchange/connected");
        if (exRes.ok) {
          const exData = await exRes.json();
          if (exData.connected && exData.connected.length > 0) {
            setConnectedExchanges(exData.connected);
            // If currently selected is not in connected list, switch to first connected
            setSelectedExchangeState(prev => exData.connected.includes(prev) ? prev : exData.connected[0]);
          } else {
            setConnectedExchanges([]);
          }
        }
      } catch (e) {
        console.error("Failed to load connected exchanges", e);
      }

      setIsLoaded(true);
    } catch {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    reloadSettings();
  }, [reloadSettings]);

  const setLanguage = (_lang: Language) => {
    setLanguageState("en");
    if (isLoaded) {
      fetch("/api/settings", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ language: "en" }) 
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

  const setDisplayCurrency = (currency: DisplayCurrency) => {
    setDisplayCurrencyState(currency);
    if (isLoaded) {
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayCurrency: currency })
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

  const setVolatilityFilter = useCallback((val: number) => {
    setVolatilityFilterState(val);
    if (isLoaded) {
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volatilityFilter: String(val) })
      }).catch(console.error);
    }
  }, [isLoaded]);

  const setSelectedExchange = useCallback((val: string) => {
    setSelectedExchangeState(val);
  }, []);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  useEffect(() => {
    const symbols = SUPPORTED_DISPLAY_CURRENCIES.map(item => item.code).join(",");
    fetch(`/api/fx/rates?base=USD&symbols=${encodeURIComponent(symbols)}`)
      .then(res => {
        if (!res.ok) throw new Error(`FX request failed with ${res.status}`);
        return res.json();
      })
      .then((data: FxRatesResponse) => {
        setFxRates({ USD: 1, ...(data.rates || {}) });
        setFxUpdatedAt(data.updatedAt || data.date);
        setFxProvider(data.provider);
        setFxError(null);
      })
      .catch(error => {
        console.error(error);
        setFxError(error.message || "FX rates unavailable");
      });
  }, []);

  const t = useCallback((key: string) => {
    return translations[key]?.en || key;
  }, []);

  const formatMoney = (value: number, sourceCurrency = "USD", options?: { compact?: boolean }) => {
    return formatCurrencyValue(value, sourceCurrency, displayCurrency, fxRates, options);
  };

  return (
    <SettingsContext.Provider value={{
      language,
      setLanguage,
      theme,
      setTheme,
      displayCurrency,
      setDisplayCurrency,
      fxRates,
      fxUpdatedAt,
      fxProvider,
      fxError,
      formatMoney,
      pinnedSymbols,
      setPinnedSymbols,
      volatilityFilter,
      setVolatilityFilter,
      selectedExchange,
      setSelectedExchange,
      connectedExchanges,
      reloadSettings,
      t
    }}>
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
