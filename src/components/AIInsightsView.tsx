import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Copy,
  FileText,
  Gauge,
  MessagesSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  User
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  AIPrediction,
  ChatHistoryItem,
  ChatMessage,
  MarketAsset,
  PredictionDriver,
  PredictionHorizon,
  PredictionSignal
} from "../types";

interface AIInsightsViewProps {
  initialTickerQuery?: string;
  marketAssets?: MarketAsset[];
  onClearInitialQuery?: () => void;
}

const predictionHorizons: PredictionHorizon[] = ["1D", "1W", "1M", "3M"];

const signalStyles: Record<PredictionSignal, { text: string; bg: string; icon: typeof TrendingUp }> = {
  Bullish: { text: "text-success", bg: "bg-success/10 border-success/30", icon: TrendingUp },
  Neutral: { text: "text-foreground", bg: "bg-muted border-border", icon: Activity },
  Bearish: { text: "text-danger", bg: "bg-danger/10 border-danger/30", icon: TrendingDown }
};

const stanceStyles: Record<PredictionDriver["stance"], string> = {
  positive: "text-success bg-success/10 border-success/20",
  neutral: "text-foreground bg-muted border-border",
  negative: "text-danger bg-danger/10 border-danger/20"
};

function formatCurrency(value: number, currencySymbol = "$") {
  if (!Number.isFinite(value)) return `${currencySymbol}0.00`;
  if (Math.abs(value) >= 1000) {
    return `${currencySymbol}${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  return `${currencySymbol}${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCompactCurrency(value: number, currencySymbol = "$") {
  if (!Number.isFinite(value)) return `${currencySymbol}0`;
  if (Math.abs(value) >= 1_000_000) return `${currencySymbol}${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${currencySymbol}${(value / 1_000).toFixed(1)}K`;
  return `${currencySymbol}${value.toFixed(value >= 100 ? 0 : 2)}`;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0.00%";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export default function AIInsightsView({
  initialTickerQuery,
  marketAssets = [],
  onClearInitialQuery
}: AIInsightsViewProps) {
  const createWelcomeSession = (): ChatHistoryItem => ({
    id: "c_welcome",
    title: "New Analysis Request",
    timeLabel: "READY",
    messages: [
      {
        id: "m_welcome",
        sender: "ai",
        text: "FinPilot AI is ready. Ask about a live US stock or crypto asset loaded from your data providers.",
        timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        summary: "No historical analysis is preloaded.",
        technicalView: "Live market data is supplied by configured quote APIs.",
        riskFactors: "AI output is informational only and should be checked against live provider data."
      }
    ]
  });

  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>(() => [createWelcomeSession()]);
  const [activeSessionId, setActiveSessionId] = useState<string>("c_welcome");
  const [inputText, setInputText] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState(() => marketAssets[0]?.symbol || "AAPL");
  const [assetSearch, setAssetSearch] = useState("");
  const [predictionHorizon, setPredictionHorizon] = useState<PredictionHorizon>("1M");
  const [prediction, setPrediction] = useState<AIPrediction | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [predictionError, setPredictionError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const helperSuggestions = [
    "Predict NVDA next month",
    "Analyze BTC risk",
    "Find AAPL support",
    "Portfolio hedge ideas"
  ];

  const activeSession = chatHistory.find(s => s.id === activeSessionId) || chatHistory[0];
  const selectedAsset = marketAssets.find(asset => asset.symbol === selectedSymbol);
  const currencySymbol = selectedAsset?.currencySymbol || "$";

  const filteredAssets = useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    const source = marketAssets.length > 0
      ? marketAssets
      : [{
          symbol: selectedSymbol,
          name: selectedSymbol,
          price: prediction?.currentPrice || 0,
          changePercent: prediction?.expectedMovePercent || 0,
          marketCap: "N/A",
          peRatio: "N/A",
          volume: "N/A",
          category: "US" as const
        }];

    return source
      .filter(asset => (
        !query ||
        asset.symbol.toLowerCase().includes(query) ||
        asset.name.toLowerCase().includes(query)
      ))
      .slice(0, 80);
  }, [assetSearch, marketAssets, prediction?.currentPrice, prediction?.expectedMovePercent, selectedSymbol]);

  const signalMeta = prediction ? signalStyles[prediction.signal] : signalStyles.Neutral;
  const SignalIcon = signalMeta.icon;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadPrediction = useCallback(async (
    symbol = selectedSymbol,
    horizon = predictionHorizon
  ) => {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (!normalizedSymbol) return;

    setPredictionLoading(true);
    setPredictionError(null);

    try {
      const response = await fetch("/api/prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: normalizedSymbol, horizon })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Prediction failed with ${response.status}`);
      }

      setPrediction(data);
    } catch (error: any) {
      setPredictionError(error.message || "Prediction engine unavailable");
    } finally {
      setPredictionLoading(false);
    }
  }, [predictionHorizon, selectedSymbol]);

  const handleSendMessage = async (rawText?: string) => {
    const textToSend = rawText || inputText;
    if (!textToSend.trim()) return;

    if (!rawText) setInputText("");

    const userMsgId = "msg_u_" + Date.now();
    const newUserMsg: ChatMessage = {
      id: userMsgId,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    };

    const aiMsgId = "msg_ai_" + Date.now();
    const newAiMsg: ChatMessage = {
      id: aiMsgId,
      sender: "ai",
      text: "",
      timestamp: "--:-- PM",
      isLoading: true
    };

    const updatedHistory = chatHistory.map((sess) => {
      if (sess.id === activeSessionId) {
        return {
          ...sess,
          messages: [...sess.messages, newUserMsg, newAiMsg]
        };
      }
      return sess;
    });

    setChatHistory(updatedHistory);

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          history: activeSession?.messages || []
        })
      });

      if (!response.body) throw new Error("No readable stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let completeText = "";
      let sseBuffer = "";

      const updateChatWithBuffer = (buf: string, isDone = false) => {
        setChatHistory(prev => prev.map(sess => {
          if (sess.id === activeSessionId) {
            return {
              ...sess,
              messages: sess.messages.map(m => {
                if (m.id === aiMsgId) {
                  const extract = (tag: string) => {
                    const match = buf.match(new RegExp(`<${tag}>([\\s\\S]*?)(?:<\\/${tag}>|$)`, "i"));
                    return match ? match[1].trim() : undefined;
                  };

                  const hasTextTag = buf.includes("<text>");
                  const text = hasTextTag ? (extract("text") || "") : buf.trim();

                  return {
                    ...m,
                    text,
                    summary: extract("summary"),
                    technicalView: extract("technicalView"),
                    riskFactors: extract("riskFactors"),
                    isLoading: !isDone,
                    timestamp: isDone ? new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "--:-- PM"
                  };
                }
                return m;
              })
            };
          }
          return sess;
        }));
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          updateChatWithBuffer(completeText, true);
          break;
        }

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) throw new Error(data.error);
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                completeText += content;
              }
            } catch {
              // Partial SSE chunks are expected while streaming.
            }
          }
        }

        updateChatWithBuffer(completeText, false);
      }
    } catch (e) {
      console.error(e);
      setChatHistory(prev => prev.map((sess) => {
        if (sess.id === activeSessionId) {
          return {
            ...sess,
            messages: sess.messages.map((m) => {
              if (m.id === aiMsgId) {
                return {
                  ...m,
                  text: "Sorry, I lost connectivity with the backend processor. Please check that your process.env.NVIDIA_API_KEY secret is correctly set or retry slightly later.",
                  isLoading: false,
                  timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
                  summary: "Operational timeout of network thread.",
                  technicalView: "No values loaded.",
                  riskFactors: "Key configurations must be validated."
                };
              }
              return m;
            })
          };
        }
        return sess;
      }));
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages, activeSession?.messages.length]);

  useEffect(() => {
    fetch("/api/chat/history")
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          setChatHistory(data);
          setActiveSessionId(data[0].id);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const active = chatHistory.find(s => s.id === activeSessionId);
    if (active) {
      fetch("/api/chat/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(active)
      }).catch(console.error);
    }
  }, [chatHistory, activeSessionId]);

  useEffect(() => {
    if (marketAssets.length > 0 && !marketAssets.some(asset => asset.symbol === selectedSymbol)) {
      setSelectedSymbol(marketAssets[0].symbol);
    }
  }, [marketAssets, selectedSymbol]);

  useEffect(() => {
    if (selectedSymbol) {
      loadPrediction(selectedSymbol, predictionHorizon);
    }
  }, [loadPrediction, predictionHorizon, selectedSymbol]);

  useEffect(() => {
    if (initialTickerQuery) {
      if (initialTickerQuery === "TECH_ALERT") {
        handleSendMessage("Explain why Technology indices indicate strong structural buy tags after semi-conductor breakthroughs.");
      } else if (initialTickerQuery === "SENTIMENT_DATA") {
        handleSendMessage("Produce a sentiment indicator analysis detailing capital rotation from high-multiplier tech towards energy.");
      } else if (initialTickerQuery === "ALL_NEWS") {
        handleSendMessage("Summarize the chief events occurring in global financial markets over the last 24 hours.");
      } else {
        const symbol = initialTickerQuery.toUpperCase();
        setSelectedSymbol(symbol);
        loadPrediction(symbol, predictionHorizon);
        handleSendMessage(`Analyze the technical indicators, resistance points, and risks for ${symbol}.`);
      }
      if (onClearInitialQuery) onClearInitialQuery();
    }
  }, [initialTickerQuery]);

  const handleStartNewChat = () => {
    const newId = "c_" + Date.now();
    const newSession: ChatHistoryItem = {
      id: newId,
      title: "New Analysis Request",
      timeLabel: "JUST NOW",
      messages: [
        {
          id: "m_welcome",
          sender: "ai",
          text: "Welcome to FinPilot AI Precision Terminal. How can I assist you with your digital or equity holdings technical reviews today?",
          timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          summary: "FinPilot AI analysis thread initialized. Ask a ticker query or asset allocation question.",
          technicalView: "Ready to load live US stock and crypto tickers from configured providers.",
          riskFactors: "Review live financial indicators carefully before executing terminal actions."
        }
      ]
    };

    setChatHistory([newSession, ...chatHistory]);
    setActiveSessionId(newId);
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handlePredictionAsk = () => {
    if (!prediction) return;
    handleSendMessage(
      `Explain the ${prediction.horizon} AI prediction for ${prediction.symbol}: signal ${prediction.signal}, confidence ${prediction.confidence}%, expected move ${formatPercent(prediction.expectedMovePercent)}, RSI ${prediction.rsi}, volatility ${prediction.volatility}%.`
    );
  };

  return (
    <div className="flex flex-1 -mx-8 -my-8 min-h-0" id="ai-insights-container">
      <div className="w-72 bg-background border-r-2 border-border flex flex-col justify-between select-none shrink-0" id="chat-history-sidebar">
        <div className="p-5 border-b border-border bg-card flex items-center justify-between">
          <h3 className="font-sans font-black text-xs uppercase tracking-wider text-foreground">SURVEILLANCE WORKSPACE</h3>
          <button
            onClick={handleStartNewChat}
            className="p-2 border border-border bg-primary text-primary-fg hover:bg-accent hover:text-foreground shadow-lg shadow-black/5 dark:shadow-black/20 flex items-center justify-center cursor-pointer transition-all rounded-xl"
            title="Start new analysis thread"
            id="btn-add-chat"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-background" id="threads-list">
          {chatHistory.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <button
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
                className={`w-full text-left p-3.5 border rounded-xl transition-all duration-100 block cursor-pointer group ${
                  isActive
                    ? "bg-primary text-primary-fg border-border shadow-lg shadow-black/5 dark:shadow-black/20"
                    : "bg-card text-foreground border-border/10 hover:border-border hover:bg-accent"
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <MessagesSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-[#FFD600]" : "text-foreground/40"}`} />
                  <span className="font-sans font-black text-xs tracking-wide uppercase truncate block max-w-[160px]" id={`thread-title-${session.id}`}>
                    {session.title}
                  </span>
                </div>
                <span className={`text-[8.5px] font-black mt-1.5 block font-mono tracking-wider ${isActive ? "text-primary-fg/60" : "text-foreground/40"}`}>
                  {session.timeLabel}
                </span>
              </button>
            );
          })}
        </div>

        <div className="p-4 bg-card border-t border-border text-center" id="history-footer">
          <span className="text-[9px] text-[#FFD600] font-black uppercase block tracking-widest leading-none">SECURE CONTAINER CONNECTED</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-between bg-card relative overflow-hidden min-w-0" id="chat-processing-terminal">
        <div className="p-4 bg-background border-b border-border flex items-center gap-2 overflow-x-auto select-none shrink-0" id="suggestion-chips-bar">
          <span className="text-[9px] text-foreground font-black uppercase tracking-wider shrink-0 mr-1.5">AUTO DISPATCHER:</span>
          {helperSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => handleSendMessage(suggestion)}
              className="px-3 py-2 bg-card border border-border text-foreground text-[10px] tracking-wider font-black uppercase hover:bg-accent hover:shadow-lg shadow-black/5 dark:shadow-black/20 active:translate-y-0.5 transition-all rounded-xl shrink-0 cursor-pointer whitespace-nowrap"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <section className="bg-card border-b border-border p-4 shrink-0" id="prediction-command-center">
          <div className="grid grid-cols-1 2xl:grid-cols-[300px_minmax(0,1fr)_300px] gap-4">
            <div className="bg-background border border-border rounded-xl p-4 min-w-0 shadow-lg shadow-black/5 dark:shadow-black/20">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 min-w-0">
                  <BrainCircuit className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <span className="font-black text-[10px] uppercase tracking-wider text-foreground block truncate">AI Prediction Core</span>
                    <span className="text-[9px] font-bold text-muted-fg uppercase tracking-wider truncate block">
                      {prediction?.dataQuality || selectedAsset?.dataQuality || "loading"} data
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => loadPrediction(selectedSymbol, predictionHorizon)}
                  disabled={predictionLoading}
                  className="h-9 w-9 rounded-xl bg-primary text-primary-fg border border-border flex items-center justify-center cursor-pointer disabled:opacity-60 shrink-0"
                  title="Refresh prediction"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${predictionLoading ? "animate-spin" : ""}`} />
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2">
                  <Search className="w-3.5 h-3.5 text-muted-fg shrink-0" />
                  <input
                    value={assetSearch}
                    onChange={(event) => setAssetSearch(event.target.value)}
                    className="bg-transparent outline-none text-xs font-bold text-foreground placeholder:text-muted-fg w-full min-w-0"
                    placeholder="Filter ticker"
                  />
                </div>

                <select
                  value={selectedSymbol}
                  onChange={(event) => setSelectedSymbol(event.target.value)}
                  className="w-full bg-card border border-border rounded-xl px-3 py-3 text-xs font-black uppercase text-foreground outline-none"
                >
                  {filteredAssets.map((asset) => (
                    <option key={asset.symbol} value={asset.symbol}>
                      {asset.symbol} - {asset.name}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-4 gap-1.5">
                  {predictionHorizons.map((horizon) => (
                    <button
                      key={horizon}
                      onClick={() => setPredictionHorizon(horizon)}
                      className={`py-2 rounded-xl border text-[10px] font-black uppercase transition-all cursor-pointer ${
                        predictionHorizon === horizon
                          ? "bg-primary text-primary-fg border-border"
                          : "bg-card text-foreground border-border hover:bg-muted"
                      }`}
                    >
                      {horizon}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`mt-4 border rounded-xl p-4 ${signalMeta.bg}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[9px] font-black uppercase tracking-wider text-muted-fg block">Signal</span>
                    <span className={`text-lg font-black uppercase tracking-tight ${signalMeta.text}`}>
                      {prediction?.signal || "Neutral"}
                    </span>
                  </div>
                  <SignalIcon className={`w-6 h-6 shrink-0 ${signalMeta.text}`} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="bg-card/80 border border-border rounded-lg p-2">
                    <Gauge className="w-3.5 h-3.5 text-muted-fg mb-1" />
                    <span className="block text-[9px] uppercase font-black text-muted-fg">Confidence</span>
                    <span className="font-mono text-sm font-black text-foreground">{prediction?.confidence || 0}%</span>
                  </div>
                  <div className="bg-card/80 border border-border rounded-lg p-2">
                    <Target className="w-3.5 h-3.5 text-muted-fg mb-1" />
                    <span className="block text-[9px] uppercase font-black text-muted-fg">Score</span>
                    <span className="font-mono text-sm font-black text-foreground">{prediction?.score || 0}/100</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-background border border-border rounded-xl p-4 min-w-0 shadow-lg shadow-black/5 dark:shadow-black/20">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary shrink-0" />
                    <h3 className="font-black text-xs uppercase tracking-wider text-foreground truncate">
                      {prediction?.symbol || selectedSymbol} Forecast Path
                    </h3>
                  </div>
                  <p className="text-[10px] text-muted-fg font-bold uppercase tracking-wider mt-1 truncate">
                    {prediction?.name || selectedAsset?.name || "Market asset"} | {prediction?.horizon || predictionHorizon}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 shrink-0">
                  <div className="bg-card border border-border rounded-lg px-3 py-2 text-right">
                    <span className="text-[8.5px] font-black uppercase text-muted-fg block">Target</span>
                    <span className="font-mono text-sm font-black text-foreground">
                      {formatCurrency(prediction?.expectedPrice || 0, currencySymbol)}
                    </span>
                  </div>
                  <div className="bg-card border border-border rounded-lg px-3 py-2 text-right">
                    <span className="text-[8.5px] font-black uppercase text-muted-fg block">Move</span>
                    <span className={`font-mono text-sm font-black ${(prediction?.expectedMovePercent || 0) >= 0 ? "text-success" : "text-danger"}`}>
                      {formatPercent(prediction?.expectedMovePercent || 0)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="h-48 sm:h-56">
                {predictionLoading ? (
                  <div className="h-full flex items-center justify-center bg-card border border-dashed border-border rounded-xl text-xs font-black uppercase text-muted-fg">
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                    Building forecast
                  </div>
                ) : predictionError ? (
                  <div className="h-full flex items-center justify-center bg-card border border-danger/30 rounded-xl text-xs font-black uppercase text-danger text-center px-4">
                    {predictionError}
                  </div>
                ) : prediction ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={prediction.forecast} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-fg)", fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <YAxis
                        width={58}
                        tick={{ fontSize: 10, fill: "var(--muted-fg)", fontWeight: 700 }}
                        axisLine={false}
                        tickLine={false}
                        domain={["auto", "auto"]}
                        tickFormatter={(value) => formatCompactCurrency(Number(value), currencySymbol)}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          color: "var(--foreground)",
                          fontSize: "11px",
                          fontWeight: 700
                        }}
                        formatter={(value: number, name: string) => [
                          formatCurrency(Number(value), currencySymbol),
                          name === "bullPrice" ? "Bull case" : name === "bearPrice" ? "Bear case" : "Base"
                        ]}
                      />
                      <Area type="monotone" dataKey="bullPrice" stroke="#0ecb81" fill="#0ecb81" fillOpacity={0.08} strokeWidth={1.5} />
                      <Area type="monotone" dataKey="bearPrice" stroke="#f6465d" fill="#f6465d" fillOpacity={0.06} strokeWidth={1.5} />
                      <Area type="monotone" dataKey="price" stroke="#fcd535" fill="#fcd535" fillOpacity={0.16} strokeWidth={2.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center bg-card border border-dashed border-border rounded-xl text-xs font-black uppercase text-muted-fg">
                    No prediction loaded
                  </div>
                )}
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="bg-card border border-border rounded-lg p-3">
                  <span className="text-[8.5px] font-black uppercase text-muted-fg block">Support</span>
                  <span className="font-mono text-xs font-black text-foreground">{formatCurrency(prediction?.support || 0, currencySymbol)}</span>
                </div>
                <div className="bg-card border border-border rounded-lg p-3">
                  <span className="text-[8.5px] font-black uppercase text-muted-fg block">Resistance</span>
                  <span className="font-mono text-xs font-black text-foreground">{formatCurrency(prediction?.resistance || 0, currencySymbol)}</span>
                </div>
                <div className="bg-card border border-border rounded-lg p-3">
                  <span className="text-[8.5px] font-black uppercase text-muted-fg block">Stop Risk</span>
                  <span className="font-mono text-xs font-black text-danger">{formatCurrency(prediction?.stopLoss || 0, currencySymbol)}</span>
                </div>
              </div>
            </div>

            <div className="bg-background border border-border rounded-xl p-4 min-w-0 shadow-lg shadow-black/5 dark:shadow-black/20">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                  <span className="font-black text-[10px] uppercase tracking-wider text-foreground truncate">Scenario Stack</span>
                </div>
                <button
                  onClick={handlePredictionAsk}
                  disabled={!prediction}
                  className="px-3 py-2 rounded-xl bg-card border border-border text-[9px] font-black uppercase text-foreground hover:bg-accent disabled:opacity-50 cursor-pointer"
                >
                  Ask AI
                </button>
              </div>

              <div className="space-y-2">
                {(prediction?.scenarios || []).map((scenario) => (
                  <div key={scenario.label} className="bg-card border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black uppercase text-foreground">{scenario.label}</span>
                      <span className="font-mono text-[11px] font-black text-muted-fg">{scenario.probability}%</span>
                    </div>
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${scenario.label === "Bull" ? "bg-success" : scenario.label === "Bear" ? "bg-danger" : "bg-primary"}`}
                        style={{ width: `${Math.max(4, Math.min(100, scenario.probability))}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] font-bold">
                      <span className="font-mono text-foreground">{formatCurrency(scenario.targetPrice, currencySymbol)}</span>
                      <span className={scenario.movePercent >= 0 ? "text-success" : "text-danger"}>{formatPercent(scenario.movePercent)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {(prediction?.drivers || []).slice(0, 6).map((driver) => (
                  <div key={driver.label} className={`border rounded-lg p-2 min-w-0 ${stanceStyles[driver.stance]}`}>
                    <span className="block text-[8px] font-black uppercase tracking-wider truncate">{driver.label}</span>
                    <span className="block font-mono text-[11px] font-black truncate">{driver.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {prediction && (
            <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-3">
              <div className="bg-background border border-border rounded-xl p-3">
                <span className="text-[9px] font-black uppercase tracking-wider text-primary block mb-1">Thesis</span>
                <p className="text-[11px] font-semibold leading-relaxed text-foreground/85">{prediction.thesis}</p>
              </div>
              <div className="bg-background border border-border rounded-xl p-3">
                <span className="text-[9px] font-black uppercase tracking-wider text-primary block mb-1">Action Plan</span>
                <p className="text-[11px] font-semibold leading-relaxed text-foreground/85">{prediction.actionPlan}</p>
              </div>
              <div className="bg-background border border-border rounded-xl p-3">
                <span className="text-[9px] font-black uppercase tracking-wider text-danger block mb-1">Risk Controls</span>
                <p className="text-[11px] font-semibold leading-relaxed text-foreground/85">{prediction.riskControls}</p>
              </div>
            </div>
          )}
        </section>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-muted min-h-0" id="chat-bubbles-container">
          {activeSession.messages.map((msg) => {
            const isAI = msg.sender === "ai";
            return (
              <div
                key={msg.id}
                className={`flex gap-4 max-w-4xl ${
                  isAI ? "mr-auto text-left" : "ml-auto flex-row-reverse text-right"
                }`}
                id={`chat-bubble-${msg.id}`}
              >
                <div
                  className={`w-9 h-9 border border-border flex items-center justify-center shrink-0 shadow-lg shadow-black/5 dark:shadow-black/20 ${
                    isAI ? "bg-primary text-primary-fg" : "bg-primary text-primary-fg"
                  }`}
                >
                  {isAI ? (
                    <Sparkles className="w-4 h-4 fill-current text-[#FFD600]" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                </div>

                <div className="space-y-4 max-w-full min-w-0">
                  {!isAI && (
                    <div className="bg-muted text-foreground text-xs px-4.5 py-3 border border-border rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 inline-block font-sans text-left leading-relaxed font-bold">
                      {msg.text}
                    </div>
                  )}

                  {isAI && (
                    <div className="bg-card border border-border rounded-xl p-5 shadow-lg shadow-black/5 dark:shadow-black/20 space-y-5 text-left max-w-full relative overflow-hidden" id="ai-structured-box">
                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary" />

                      <div className="flex items-center gap-2 text-foreground border-b border-border/10 pb-2">
                        <Sparkles className="w-4 h-4 text-[#0047FF] fill-current" />
                        <span className="font-black text-[10px] uppercase tracking-wider font-sans">
                          NEURAL PIPELINE ANALYSIS OUTPUT
                        </span>
                      </div>

                      {msg.isLoading ? (
                        <div className="flex items-center gap-2 py-4 text-xs text-foreground font-semibold">
                          <RefreshCw className="w-4 h-4 animate-spin text-[#0047FF]" />
                          <span>Streaming live intelligence response payload...</span>
                        </div>
                      ) : (
                        <>
                          <p className="text-foreground text-xs font-semibold leading-relaxed font-sans whitespace-pre-line">
                            {msg.text}
                          </p>

                          {(msg.summary || msg.technicalView) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="ai-boxes-grid">
                              {msg.summary && (
                                <div className="bg-card border border-border p-4 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20" id="summary-section">
                                  <div className="flex items-center gap-1.5 text-[#0047FF] mb-2">
                                    <FileText className="w-3.5 h-3.5" />
                                    <span className="font-black text-[10px] uppercase tracking-wider">AI Bullet Summary</span>
                                  </div>
                                  <p className="text-foreground/85 text-[11px] font-semibold leading-relaxed">
                                    {msg.summary}
                                  </p>
                                </div>
                              )}

                              {msg.technicalView && (
                                <div className="bg-card border border-border p-4 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20" id="tech-view-section">
                                  <div className="flex items-center gap-1.5 text-foreground mb-2">
                                    <Activity className="w-3.5 h-3.5 text-[#0047FF]" />
                                    <span className="font-black text-[10px] uppercase tracking-wider">Technical Signal View</span>
                                  </div>
                                  <p className="text-foreground/85 text-[11px] font-semibold leading-relaxed">
                                    {msg.technicalView}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {msg.riskFactors && (
                            <div className="bg-[#fff1f2] border border-border p-4 rounded-xl" id="risks-danger-block">
                              <div className="flex items-center gap-1 text-danger mb-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span className="font-black text-[10px] uppercase tracking-wider">CRITICAL RISKS SUMMARY</span>
                              </div>
                              <p className="text-danger text-[11px] leading-relaxed font-sans font-bold uppercase">
                                {msg.riskFactors}
                              </p>
                            </div>
                          )}

                          <div className="pt-3 border-t border-border/10 flex items-center justify-between text-[10px] text-foreground/50">
                            <div className="flex items-center gap-3">
                              <button className="hover:text-foreground transition-colors cursor-pointer" title="Vote useful">
                                <ThumbsUp className="w-3.5 h-3.5" />
                              </button>
                              <button className="hover:text-foreground transition-colors cursor-pointer" title="Vote not useful">
                                <ThumbsDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleCopyText(msg.text + "\n" + (msg.summary || ""))}
                                className="hover:text-[#0047FF] transition-colors cursor-pointer"
                                title="Copy analysis payload"
                              >
                                <Copy className="w-3.5 h-3.5 text-foreground hover:text-[#0047FF]" />
                              </button>
                              {isCopied && <span className="text-success font-black font-sans uppercase">Copied!</span>}
                            </div>

                            <span className="font-bold">{msg.timestamp}</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-5 bg-background border-t border-border shrink-0" id="input-processing-panel">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-3 max-w-4xl mx-auto w-full relative"
          >
            <button
              type="button"
              className="p-3 bg-card hover:bg-card border border-border hover:text-primary-fg rounded-xl shrink-0 cursor-pointer transition-all shadow-lg shadow-black/5 dark:shadow-black/20 flex items-center justify-center h-12 w-12"
              title="Spreadsheets locked"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <input
              type="text"
              placeholder="Input ticker tag or ask a quantitative market query..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 bg-card border border-border px-4 py-3 h-12 rounded-xl text-sm text-foreground placeholder-black/30 font-semibold focus:outline-none focus:bg-muted focus:shadow-lg shadow-black/5 dark:shadow-black/20 transition-all"
              id="ai-insights-chat-input"
            />

            <button
              type="submit"
              className="h-12 w-12 bg-primary hover:bg-card border border-border text-primary-fg hover:text-accent-fg rounded-xl flex items-center justify-center shadow-lg shadow-black/5 dark:shadow-black/20 transition-all cursor-pointer shrink-0"
              title="Transmit query"
              id="btn-transmit-chat"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          <div className="text-center text-[8.5px] text-foreground/50 mt-2.5 font-bold tracking-wider uppercase">
            Powered by NVIDIA NIM inference | Strict sandboxed proxy routing.
          </div>
        </div>
      </div>
    </div>
  );
}
