import { useEffect, useRef, useState, useId } from "react";
import { useSettings } from "../SettingsContext";

interface TradingViewChartProps {
  symbol: string;
  interval?: string;
  containerId?: string;
  mode?: "clean" | "advanced";
}

let tvScriptLoadingPromise: Promise<void> | null = null;

function loadTvScript(): Promise<void> {
  if (tvScriptLoadingPromise) {
    return tvScriptLoadingPromise;
  }

  tvScriptLoadingPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "tradingview-widget-loading-script";
    script.src = "https://s3.tradingview.com/tv.js";
    script.type = "text/javascript";
    script.onload = () => resolve();
    script.onerror = (err) => {
      tvScriptLoadingPromise = null;
      reject(err);
    };
    document.head.appendChild(script);
  });

  return tvScriptLoadingPromise;
}

export default function TradingViewChart({
  symbol,
  interval = "15",
  containerId,
  mode = "advanced"
}: TradingViewChartProps) {
  const { theme } = useSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const generatedId = useId();
  const resolvedContainerId = containerId || `tv-chart-${generatedId.replace(/:/g, "")}`;

  useEffect(() => {
    loadTvScript()
      .then(() => setIsScriptLoaded(true))
      .catch((err) => console.error("Error loading TradingView script:", err));
  }, []);

  useEffect(() => {
    if (!isScriptLoaded || !containerRef.current) return;

    // Clear previous widget content
    containerRef.current.innerHTML = "";

    // Create container element
    const childDiv = document.createElement("div");
    childDiv.id = resolvedContainerId;
    childDiv.style.height = "100%";
    childDiv.style.width = "100%";
    containerRef.current.appendChild(childDiv);

    if ((window as any).TradingView) {
      widgetRef.current = new (window as any).TradingView.widget({
        autosize: true,
        symbol: symbol,
        interval: interval,
        timezone: "Etc/UTC",
        theme: theme,
        style: "1",
        locale: "en",
        toolbar_bg: theme === "dark" ? "#1e2329" : "#f1f3f6",
        enable_publishing: false,
        hide_side_toolbar: mode === "clean", // Hide drawing tools in clean mode
        allow_symbol_change: true,
        container_id: resolvedContainerId,
        studies: mode === "advanced" ? [
          "RSI@tv-basicstudies",
          "MASimple@tv-basicstudies",
          "MACD@tv-basicstudies"
        ] : [], // No studies in clean mode
        save_image: true,
        show_popup_button: true,
        popup_width: "1000",
        popup_height: "650",
        withdateranges: true
      });
    }
  }, [isScriptLoaded, symbol, interval, theme, resolvedContainerId, mode]);

  return (
    <div ref={containerRef} className="w-full h-full relative" />
  );
}
