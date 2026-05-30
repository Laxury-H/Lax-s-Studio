import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Copy,
  Database,
  FileText,
  Gauge,
  LineChart as LineChartIcon,
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
  User,
  Zap
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
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
import { useSettings } from "../SettingsContext";

interface AIInsightsViewProps {
  initialTickerQuery?: string;
  marketAssets?: MarketAsset[];
  onClearInitialQuery?: () => void;
}

type SignalStyle = {
  label: string;
  text: string;
  border: string;
  bg: string;
  softBg: string;
  icon: typeof TrendingUp;
};

const predictionHorizons: PredictionHorizon[] = ["1D", "1W", "1M", "3M"];

const signalStyles: Record<PredictionSignal, SignalStyle> = {
  Bullish: {
    label: "Bullish",
    text: "text-success",
    border: "border-success/30",
    bg: "bg-success",
    softBg: "bg-success/10",
    icon: TrendingUp
  },
  Neutral: {
    label: "Neutral",
    text: "text-foreground",
    border: "border-border",
    bg: "bg-primary",
    softBg: "bg-muted",
    icon: Activity
  },
  Bearish: {
    label: "Bearish",
    text: "text-danger",
    border: "border-danger/30",
    bg: "bg-danger",
    softBg: "bg-danger/10",
    icon: TrendingDown
  }
};

const stanceStyles: Record<PredictionDriver["stance"], string> = {
  positive: "text-success bg-success/10 border-success/25",
  neutral: "text-foreground bg-muted border-border",
  negative: "text-danger bg-danger/10 border-danger/25"
};

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0.00%";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function getJsonErrorMessage(rawText: string, fallback: string) {
  const trimmed = rawText.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
    return "Prediction endpoint returned an HTML page. Restart the local server so /api/prediction is registered.";
  }
  return trimmed.slice(0, 180);
}

function MetricTile({
  icon: Icon,
  label,
  value,
  tone = "text-foreground"
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-3 min-w-0">
      <div className="flex items-center gap-1.5 text-muted-fg mb-1">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[8.5px] font-black uppercase tracking-wider truncate">{label}</span>
      </div>
      <span className={`font-mono text-sm font-black truncate block ${tone}`}>{value}</span>
    </div>
  );
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center bg-card border border-dashed border-border rounded-xl px-6">
      <BrainCircuit className="w-7 h-7 text-primary mb-3" />
      <span className="text-xs font-black uppercase tracking-wider text-foreground">{title}</span>
      <p className="text-[11px] text-muted-fg font-semibold leading-relaxed mt-2 max-w-sm">{detail}</p>
    </div>
  );
}

export default function AIInsightsView({
  initialTickerQuery,
  marketAssets = [],
  onClearInitialQuery
}: AIInsightsViewProps) {
  const { language, formatMoney } = useSettings();
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
  const [selectedModel, setSelectedModel] = useState<PredictionModel>("finpilot-v1");
  const [prediction, setPrediction] = useState<AIPrediction | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<"prediction" | "chat">("prediction");
  const [chartView, setChartView] = useState<"area" | "line" | "composed">("area");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const helperSuggestions = [
    "Predict NVDA next month",
    "Analyze BTC risk",
    "Find AAPL support",
    "Portfolio hedge ideas"
  ];

  const activeSession = chatHistory.find(s => s.id === activeSessionId) || chatHistory[0];
  const selectedAsset = marketAssets.find(asset => asset.symbol === selectedSymbol);
  const sourceCurrency = selectedAsset?.currencySymbol || "$";
  const currentPrice = prediction?.currentPrice || selectedAsset?.price || 0;
  const displayedMove = selectedAsset?.changePercent ?? prediction?.expectedMovePercent ?? 0;
  const lastUpdated = prediction?.updatedAt
    ? new Date(prediction.updatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "pending";

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
  const confidenceWidth = Math.max(0, Math.min(100, prediction?.confidence || 0));
  const scoreWidth = Math.max(0, Math.min(100, prediction?.score || 0));

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadPrediction = useCallback(async (
    symbol = selectedSymbol,
    horizon = predictionHorizon,
    model = selectedModel
  ) => {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (!normalizedSymbol) return;

    setPredictionLoading(true);
    setPredictionError(null);

    try {
      const response = await fetch("/api/prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: normalizedSymbol, horizon, language, model })
      });

      const rawText = await response.text();
      let data: AIPrediction | { error?: string } | null = null;

      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(getJsonErrorMessage(rawText, "Prediction endpoint returned an empty response."));
      }

      if (!response.ok) {
        const apiError = data && "error" in data ? data.error : undefined;
        throw new Error(apiError || `Prediction failed with ${response.status}`);
      }

      if (!data || !("forecast" in data) || !Array.isArray(data.forecast)) {
        throw new Error("Prediction payload is incomplete. Please refresh market data and try again.");
      }

      setPrediction(data);
    } catch (error: any) {
      setPrediction(null);
      setPredictionError(error.message || "Prediction engine unavailable");
    } finally {
      setPredictionLoading(false);
    }
  }, [language, predictionHorizon, selectedSymbol]);

  const handleSendMessage = async (rawText?: string) => {
    const textToSend = rawText || inputText;
    if (!textToSend.trim()) return;

    setWorkspaceTab("chat");
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
          history: activeSession?.messages || [],
          language
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
    if (filteredAssets.length > 0 && !filteredAssets.some(asset => asset.symbol === selectedSymbol)) {
      setSelectedSymbol(filteredAssets[0].symbol);
    }
  }, [filteredAssets, selectedSymbol]);

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
    setWorkspaceTab("chat");
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
    setWorkspaceTab("chat");
    handleSendMessage(
      `Explain the ${prediction.horizon} AI prediction for ${prediction.symbol}: signal ${prediction.signal}, confidence ${prediction.confidence}%, expected move ${formatPercent(prediction.expectedMovePercent)}, RSI ${prediction.rsi}, volatility ${prediction.volatility}%.`
    );
  };

  return (
    <div className="flex flex-1 -mx-3 -my-3 sm:-mx-5 sm:-my-5 lg:-mx-8 lg:-my-8 min-h-0 overflow-hidden bg-muted" id="ai-insights-container">
      <div className="flex-1 flex flex-col min-w-0 bg-card" id="chat-processing-terminal">
        <div className="shrink-0 bg-background border-b border-border px-3 sm:px-6 py-3 sm:py-4 space-y-3">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-xl bg-primary text-primary-fg border border-border flex items-center justify-center shadow-lg shadow-primary/20">
                  <BrainCircuit className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-black uppercase tracking-tight text-foreground leading-none">
                    {workspaceTab === "prediction" ? "AI Prediction Command Center" : "AI Copilot Desk"}
                  </h2>
                  <p className="text-[10px] text-muted-fg font-black uppercase tracking-wider mt-1">
                    {workspaceTab === "prediction"
                      ? "Quant forecast | Scenario engine | Live market diagnostics"
                      : "Conversation | Interpretation | Execution notes"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 shrink-0">
                <button
                  onClick={() => setWorkspaceTab("prediction")}
                  className={`h-8 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                    workspaceTab === "prediction"
                      ? "bg-primary text-primary-fg"
                      : "text-muted-fg hover:text-foreground hover:bg-muted"
                  }`}
                >
                  Prediction Center
                </button>
                <button
                  onClick={() => setWorkspaceTab("chat")}
                  className={`h-8 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                    workspaceTab === "chat"
                      ? "bg-primary text-primary-fg"
                      : "text-muted-fg hover:text-foreground hover:bg-muted"
                  }`}
                >
                  AI Copilot Chat
                </button>
              </div>
              <span className="text-[9px] text-foreground font-black uppercase tracking-wider shrink-0 mr-1">Quick runs</span>
              {helperSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setWorkspaceTab("chat");
                    handleSendMessage(suggestion);
                  }}
                  className="px-3 py-2 bg-card border border-border text-foreground text-[10px] tracking-wider font-black uppercase hover:bg-accent hover:shadow-lg shadow-black/5 dark:shadow-black/20 active:translate-y-0.5 transition-all rounded-xl shrink-0 cursor-pointer whitespace-nowrap"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {workspaceTab === "chat" && (
          <div className="flex items-center gap-2 overflow-x-auto">
            <button
              onClick={handleStartNewChat}
              className="h-9 px-3 rounded-xl bg-primary text-primary-fg border border-border flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider shrink-0 cursor-pointer"
              title="Start new analysis thread"
            >
              <Plus className="w-3.5 h-3.5" />
              New Thread
            </button>
            {chatHistory.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={`h-9 max-w-[220px] px-3 rounded-xl border flex items-center gap-2 text-[10px] font-black uppercase tracking-wider shrink-0 cursor-pointer transition-colors ${
                    isActive
                      ? "bg-card text-foreground border-primary"
                      : "bg-card/60 text-muted-fg border-border hover:text-foreground hover:bg-card"
                  }`}
                >
                  <MessagesSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-primary" : "text-muted-fg"}`} />
                  <span className="truncate">{session.title}</span>
                  <span className="font-mono text-[8px] opacity-60">{session.timeLabel}</span>
                </button>
              );
            })}
          </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto bg-muted min-h-0">
          {workspaceTab === "prediction" && (
          <section className="p-3 sm:p-5 space-y-4" id="prediction-command-center">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricTile icon={Database} label="Data" value={prediction?.dataQuality || selectedAsset?.dataQuality || "Pending"} />
              <MetricTile icon={Activity} label="Live Price" value={formatMoney(currentPrice, sourceCurrency)} />
              <MetricTile
                icon={TrendingUp}
                label="24H Move"
                value={formatPercent(displayedMove)}
                tone={displayedMove >= 0 ? "text-success" : "text-danger"}
              />
              <MetricTile icon={CheckCircle2} label="Updated" value={lastUpdated} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(560px,1fr)_340px] gap-4 items-stretch">
              <div className="bg-background border border-border rounded-xl p-4 min-w-0 shadow-lg shadow-black/5 dark:shadow-black/20 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-black text-[10px] uppercase tracking-wider text-foreground block">Instrument</span>
                    <span className="text-[9px] font-bold text-muted-fg uppercase tracking-wider truncate block">
                      Market feed and horizon
                    </span>
                  </div>
                  <button
                    onClick={() => loadPrediction(selectedSymbol, predictionHorizon)}
                    disabled={predictionLoading}
                    className="h-10 w-10 rounded-xl bg-primary text-primary-fg border border-border flex items-center justify-center cursor-pointer disabled:opacity-60 shrink-0"
                    title="Refresh prediction"
                  >
                    <RefreshCw className={`w-4 h-4 ${predictionLoading ? "animate-spin" : ""}`} />
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
                        className={`h-11 rounded-xl border text-[10px] font-black uppercase transition-all cursor-pointer ${
                          predictionHorizon === horizon
                            ? "bg-primary text-primary-fg border-border"
                            : "bg-card text-foreground border-border hover:bg-muted"
                        }`}
                      >
                        {horizon}
                      </button>
                    ))}
                  </div>

                  <select
                    value={selectedModel}
                    onChange={(event) => setSelectedModel(event.target.value as PredictionModel)}
                    className="w-full bg-muted border border-border rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-wider text-foreground outline-none mt-2 cursor-pointer"
                  >
                    <option value="finpilot-v1">🚀 FinPilot Quant V1</option>
                    <option value="deepseek-r1">🧠 DeepSeek Institutional</option>
                    <option value="llama-3-sent">🔥 Llama 3 Sentiment</option>
                    <option value="mistral-macro">🌍 Mistral Macro Oracle</option>
                    <option value="claude-3-opus">🏛️ Claude 3 Fundamentals</option>
                    <option value="gpt-4-quant">📈 GPT-4 Quant Master</option>
                    <option value="whale-tracker">🐋 Whale Wallet Tracker</option>
                    <option value="retail-fomo">🎢 Retail FOMO Indicator</option>
                  </select>
                </div>

                <div className={`border rounded-xl p-4 flex-1 min-h-[218px] ${signalMeta.softBg} ${signalMeta.border}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[9px] font-black uppercase tracking-wider text-muted-fg block">Model Signal</span>
                      <span className={`text-3xl font-black uppercase tracking-tight ${signalMeta.text}`}>
                        {prediction?.signal || "Neutral"}
                      </span>
                      <span className="text-[10px] text-muted-fg font-black uppercase tracking-wider block mt-1">
                        {prediction?.recommendation || "Awaiting model"}
                      </span>
                    </div>
                    <div className={`h-12 w-12 rounded-xl ${signalMeta.bg} text-primary-fg flex items-center justify-center shadow-lg shadow-black/10`}>
                      <SignalIcon className="w-6 h-6" />
                    </div>
                  </div>

                  <div className="mt-6 space-y-5">
                    <div>
                      <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-muted-fg mb-1.5">
                        <span>Confidence</span>
                        <span>{prediction?.confidence || 0}%</span>
                      </div>
                      <div className="h-2 bg-card border border-border rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${confidenceWidth}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-muted-fg mb-1.5">
                        <span>Quant Score</span>
                        <span>{prediction?.score || 0}/100</span>
                      </div>
                      <div className="h-2 bg-card border border-border rounded-full overflow-hidden">
                        <div className={`h-full ${prediction?.signal === "Bearish" ? "bg-danger" : prediction?.signal === "Bullish" ? "bg-success" : "bg-primary"}`} style={{ width: `${scoreWidth}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-background border border-border rounded-xl p-4 min-w-0 shadow-lg shadow-black/5 dark:shadow-black/20">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <LineChartIcon className="w-4 h-4 text-primary shrink-0" />
                      <h3 className="font-black text-sm uppercase tracking-wider text-foreground truncate">
                        {prediction?.symbol || selectedSymbol} Forecast Path
                      </h3>
                    </div>
                    <p className="text-[10px] text-muted-fg font-bold uppercase tracking-wider mt-1 truncate">
                      {prediction?.name || selectedAsset?.name || "Market asset"} | {prediction?.horizon || predictionHorizon} horizon
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
                    <div className="flex items-center bg-muted border border-border rounded-xl p-1">
                      <button onClick={() => setChartView("area")} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${chartView === "area" ? "bg-card shadow-sm text-foreground" : "text-muted-fg hover:text-foreground"}`}>Area</button>
                      <button onClick={() => setChartView("composed")} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${chartView === "composed" ? "bg-card shadow-sm text-foreground" : "text-muted-fg hover:text-foreground"}`}>Bands</button>
                      <button onClick={() => setChartView("line")} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${chartView === "line" ? "bg-card shadow-sm text-foreground" : "text-muted-fg hover:text-foreground"}`}>Line</button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 shrink-0 lg:min-w-[240px]">
                      <MetricTile icon={Target} label="Target" value={formatMoney(prediction?.expectedPrice || 0, sourceCurrency)} />
                      <MetricTile
                        icon={Zap}
                        label="Expected Move"
                        value={formatPercent(prediction?.expectedMovePercent || 0)}
                        tone={(prediction?.expectedMovePercent || 0) >= 0 ? "text-success" : "text-danger"}
                      />
                    </div>
                  </div>
                </div>

                <div className="h-[360px]">
                  {predictionLoading ? (
                    <div className="h-full flex items-center justify-center bg-card border border-dashed border-border rounded-xl text-xs font-black uppercase text-muted-fg">
                      <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                      Building forecast model
                    </div>
                  ) : predictionError ? (
                    <div className="h-full flex flex-col items-center justify-center bg-card border border-danger/30 rounded-xl text-center px-6">
                      <AlertTriangle className="w-7 h-7 text-danger mb-3" />
                      <span className="text-xs font-black uppercase tracking-wider text-danger">Prediction handshake failed</span>
                      <p className="text-[11px] text-muted-fg font-semibold leading-relaxed mt-2 max-w-md">{predictionError}</p>
                      <button
                        onClick={() => loadPrediction(selectedSymbol, predictionHorizon)}
                        className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-fg border border-border text-[10px] font-black uppercase cursor-pointer"
                      >
                        Retry model
                      </button>
                    </div>
                  ) : prediction ? (
                    <ResponsiveContainer width="100%" height="100%">
                      {chartView === "area" ? (
                        <AreaChart data={prediction.forecast} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-fg)", fontWeight: 700 }} axisLine={false} tickLine={false} />
                          <YAxis width={58} tick={{ fontSize: 10, fill: "var(--muted-fg)", fontWeight: 700 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} tickFormatter={(value) => formatMoney(Number(value), sourceCurrency, { compact: true })} />
                          <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--foreground)", fontSize: "11px", fontWeight: 700 }} formatter={(value: number, name: string) => [formatMoney(Number(value), sourceCurrency), name === "bullPrice" ? "Bull case" : name === "bearPrice" ? "Bear case" : "Base"]} />
                          <Area type="monotone" dataKey="bullPrice" stroke="#0ecb81" fill="#0ecb81" fillOpacity={0.07} strokeWidth={1.6} />
                          <Area type="monotone" dataKey="bearPrice" stroke="#f6465d" fill="#f6465d" fillOpacity={0.06} strokeWidth={1.6} />
                          <Area type="monotone" dataKey="price" stroke="#fcd535" fill="#fcd535" fillOpacity={0.18} strokeWidth={2.8} />
                        </AreaChart>
                      ) : chartView === "composed" ? (
                        <ComposedChart data={prediction.forecast} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-fg)", fontWeight: 700 }} axisLine={false} tickLine={false} />
                          <YAxis width={58} tick={{ fontSize: 10, fill: "var(--muted-fg)", fontWeight: 700 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} tickFormatter={(value) => formatMoney(Number(value), sourceCurrency, { compact: true })} />
                          <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--foreground)", fontSize: "11px", fontWeight: 700 }} formatter={(value: number, name: string) => [formatMoney(Number(value), sourceCurrency), name === "bullPrice" ? "Bull case" : name === "bearPrice" ? "Bear case" : "Base"]} />
                          <Bar dataKey="bullPrice" fill="#0ecb81" fillOpacity={0.15} radius={[4, 4, 0, 0]} maxBarSize={30} />
                          <Bar dataKey="bearPrice" fill="#f6465d" fillOpacity={0.15} radius={[4, 4, 0, 0]} maxBarSize={30} />
                          <Line type="monotone" dataKey="price" stroke="#fcd535" strokeWidth={3} dot={{ r: 4, fill: "#fcd535", strokeWidth: 0 }} />
                        </ComposedChart>
                      ) : (
                        <LineChart data={prediction.forecast} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-fg)", fontWeight: 700 }} axisLine={false} tickLine={false} />
                          <YAxis width={58} tick={{ fontSize: 10, fill: "var(--muted-fg)", fontWeight: 700 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} tickFormatter={(value) => formatMoney(Number(value), sourceCurrency, { compact: true })} />
                          <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--foreground)", fontSize: "11px", fontWeight: 700 }} formatter={(value: number, name: string) => [formatMoney(Number(value), sourceCurrency), name === "bullPrice" ? "Bull case" : name === "bearPrice" ? "Bear case" : "Base"]} />
                          <Line type="monotone" dataKey="bullPrice" stroke="#0ecb81" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                          <Line type="monotone" dataKey="bearPrice" stroke="#f6465d" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                          <Line type="monotone" dataKey="price" stroke="#fcd535" strokeWidth={3} dot={{ r: 4, fill: "#fcd535", strokeWidth: 0 }} />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  ) : (
                    <EmptyPanel title="No forecast loaded" detail="Select an instrument and horizon to run the prediction model." />
                  )}
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
                  <MetricTile icon={ShieldCheck} label="Support" value={formatMoney(prediction?.support || 0, sourceCurrency)} />
                  <MetricTile icon={BarChart3} label="Resistance" value={formatMoney(prediction?.resistance || 0, sourceCurrency)} />
                  <MetricTile icon={AlertTriangle} label="Stop Risk" value={formatMoney(prediction?.stopLoss || 0, sourceCurrency)} tone="text-danger" />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-1 gap-4 min-w-0 xl:col-span-2 2xl:col-span-1">
                <div className="bg-background border border-border rounded-xl p-4 shadow-lg shadow-black/5 dark:shadow-black/20">
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
                    {prediction?.scenarios?.length ? prediction.scenarios.map((scenario) => (
                      <div key={scenario.label} className="bg-card border border-border rounded-xl p-3">
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
                          <span className="font-mono text-foreground">{formatMoney(scenario.targetPrice, sourceCurrency)}</span>
                          <span className={scenario.movePercent >= 0 ? "text-success" : "text-danger"}>{formatPercent(scenario.movePercent)}</span>
                        </div>
                      </div>
                    )) : (
                      <EmptyPanel title="No scenarios" detail="Run a forecast to calculate base, bull, and bear probability paths." />
                    )}
                  </div>
                </div>

                <div className="bg-background border border-border rounded-xl p-4 shadow-lg shadow-black/5 dark:shadow-black/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Gauge className="w-4 h-4 text-primary" />
                    <span className="font-black text-[10px] uppercase tracking-wider text-foreground">Signal Drivers</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(prediction?.drivers || []).slice(0, 6).map((driver) => (
                      <div key={driver.label} className={`border rounded-xl p-2.5 min-w-0 ${stanceStyles[driver.stance]}`}>
                        <span className="block text-[8px] font-black uppercase tracking-wider truncate">{driver.label}</span>
                        <span className="block font-mono text-[11px] font-black truncate">{driver.value}</span>
                      </div>
                    ))}
                    {!prediction && Array.from({ length: 6 }).map((_, index) => (
                      <div key={index} className="border border-border rounded-xl p-2.5 bg-card min-h-[50px] opacity-60" />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {prediction && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                <div className="bg-background border border-border rounded-xl p-4">
                  <span className="text-[9px] font-black uppercase tracking-wider text-primary block mb-1">Thesis</span>
                  <p className="text-[11px] font-semibold leading-relaxed text-foreground/85">{prediction.thesis}</p>
                </div>
                <div className="bg-background border border-border rounded-xl p-4">
                  <span className="text-[9px] font-black uppercase tracking-wider text-primary block mb-1">Action Plan</span>
                  <p className="text-[11px] font-semibold leading-relaxed text-foreground/85">{prediction.actionPlan}</p>
                </div>
                <div className="bg-background border border-border rounded-xl p-4">
                  <span className="text-[9px] font-black uppercase tracking-wider text-danger block mb-1">Risk Controls</span>
                  <p className="text-[11px] font-semibold leading-relaxed text-foreground/85">{prediction.riskControls}</p>
                </div>
              </div>
            )}
          </section>
          )}

          {workspaceTab === "chat" && (
          <section className="p-3 sm:p-5" id="chat-bubbles-container">
            <div className="bg-background border border-border rounded-xl overflow-hidden shadow-lg shadow-black/5 dark:shadow-black/20">
              <div className="px-4 py-3 border-b border-border flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <MessagesSquare className="w-4 h-4 text-primary shrink-0" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-foreground truncate">AI Copilot Desk</h3>
                  </div>
                  <p className="text-[10px] text-muted-fg font-bold uppercase tracking-wider mt-1 truncate">
                    Conversation, interpretation, and execution notes stay in one workspace.
                  </p>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto">
                  <span className="px-3 py-1.5 rounded-lg bg-card border border-border text-[9px] font-black uppercase tracking-wider text-muted-fg shrink-0">
                    {activeSession.messages.length} messages
                  </span>
                  <span className="px-3 py-1.5 rounded-lg bg-card border border-border text-[9px] font-black uppercase tracking-wider text-foreground shrink-0">
                    {selectedSymbol} / {predictionHorizon}
                  </span>
                  <span className={`px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-wider shrink-0 ${signalMeta.softBg} ${signalMeta.border} ${signalMeta.text}`}>
                    {prediction?.signal || "No active signal"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_280px] min-h-[360px]">
                <div className="p-3 sm:p-4 bg-muted/60 space-y-3 max-h-[520px] overflow-y-auto">
                  {activeSession.messages.map((msg) => {
                    const isAI = msg.sender === "ai";
                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 ${isAI ? "justify-start text-left" : "justify-end text-right flex-row-reverse"}`}
                        id={`chat-bubble-${msg.id}`}
                      >
                        <div
                          className={`w-8 h-8 rounded-xl border border-border flex items-center justify-center shrink-0 shadow-lg shadow-black/5 dark:shadow-black/20 ${
                            isAI ? "bg-primary text-primary-fg" : "bg-card text-foreground"
                          }`}
                        >
                          {isAI ? (
                            <Sparkles className="w-3.5 h-3.5 fill-current" />
                          ) : (
                            <User className="w-3.5 h-3.5" />
                          )}
                        </div>

                        <div className={`space-y-3 min-w-0 ${isAI ? "max-w-4xl" : "max-w-2xl"}`}>
                          {!isAI && (
                            <div className="bg-card text-foreground text-xs px-4 py-3 border border-border rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 inline-block font-sans text-left leading-relaxed font-bold">
                              {msg.text}
                            </div>
                          )}

                          {isAI && (
                            <div className="bg-card border border-border rounded-xl p-4 shadow-lg shadow-black/5 dark:shadow-black/20 space-y-4 text-left max-w-full relative overflow-hidden" id="ai-structured-box">
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />

                              <div className="flex items-center justify-between gap-3 border-b border-border/10 pb-2">
                                <div className="flex items-center gap-2 text-foreground min-w-0">
                                  <Sparkles className="w-4 h-4 text-primary fill-current shrink-0" />
                                  <span className="font-black text-[10px] uppercase tracking-wider font-sans truncate">
                                    Neural Pipeline Output
                                  </span>
                                </div>
                                <span className="text-[9px] text-muted-fg font-bold shrink-0">{msg.timestamp}</span>
                              </div>

                              {msg.isLoading ? (
                                <div className="flex items-center gap-2 py-4 text-xs text-foreground font-semibold">
                                  <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                                  <span>Streaming live intelligence response payload...</span>
                                </div>
                              ) : (
                                <>
                                  <p className="text-foreground text-xs font-semibold leading-relaxed font-sans whitespace-pre-line">
                                    {msg.text}
                                  </p>

                                  {(msg.summary || msg.technicalView) && (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" id="ai-boxes-grid">
                                      {msg.summary && (
                                        <button
                                          type="button"
                                          onClick={() => handleSendMessage(`Turn this analysis into a concise action summary with 3 bullet points: ${msg.text}`)}
                                          className="bg-background border border-border p-3 rounded-xl text-left hover:border-primary hover:bg-muted transition-colors cursor-pointer"
                                          id="summary-section"
                                          title="Ask AI for a concise action summary"
                                        >
                                          <div className="flex items-center gap-1.5 text-primary mb-2">
                                            <FileText className="w-3.5 h-3.5" />
                                            <span className="font-black text-[9px] uppercase tracking-wider">Summary</span>
                                          </div>
                                          <p className="text-foreground/85 text-[11px] font-semibold leading-relaxed">
                                            {msg.summary}
                                          </p>
                                          <span className="mt-2 block text-[8px] font-black uppercase tracking-wider text-muted-fg">
                                            Click to expand summary
                                          </span>
                                        </button>
                                      )}

                                      {msg.technicalView && (
                                        <button
                                          type="button"
                                          onClick={() => handleSendMessage(`Deepen the technical view for this analysis. Focus on signal confidence, trend, support, resistance, and invalidation levels: ${msg.text}`)}
                                          className="bg-background border border-border p-3 rounded-xl text-left hover:border-primary hover:bg-muted transition-colors cursor-pointer"
                                          id="tech-view-section"
                                          title="Ask AI for deeper technical analysis"
                                        >
                                          <div className="flex items-center gap-1.5 text-foreground mb-2">
                                            <Activity className="w-3.5 h-3.5 text-primary" />
                                            <span className="font-black text-[9px] uppercase tracking-wider">Technical View</span>
                                          </div>
                                          <p className="text-foreground/85 text-[11px] font-semibold leading-relaxed">
                                            {msg.technicalView}
                                          </p>
                                          <span className="mt-2 block text-[8px] font-black uppercase tracking-wider text-muted-fg">
                                            Click to inspect setup
                                          </span>
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  <div className="pt-2 border-t border-border/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[10px] text-foreground/50">
                                    <div className="flex items-center gap-3">
                                      <button className="hover:text-foreground transition-colors cursor-pointer" title="Vote useful">
                                        <ThumbsUp className="w-3.5 h-3.5" />
                                      </button>
                                      <button className="hover:text-foreground transition-colors cursor-pointer" title="Vote not useful">
                                        <ThumbsDown className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleCopyText(msg.text + "\n" + (msg.summary || ""))}
                                        className="hover:text-primary transition-colors cursor-pointer"
                                        title="Copy analysis payload"
                                      >
                                        <Copy className="w-3.5 h-3.5 text-foreground hover:text-primary" />
                                      </button>
                                      {isCopied && <span className="text-success font-black font-sans uppercase">Copied!</span>}
                                    </div>

                                    <div className="flex items-center gap-2 min-w-0 sm:justify-end">
                                      <span className="font-bold shrink-0">Research only</span>
                                    </div>
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

                <aside className="hidden 2xl:flex flex-col gap-3 border-l border-border bg-card p-4">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-primary block">Thread Context</span>
                    <p className="text-[11px] font-semibold leading-relaxed text-muted-fg mt-1">
                      Use this desk for follow-up questions after the forecast has been generated.
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <MetricTile icon={Activity} label="Price" value={formatMoney(currentPrice, sourceCurrency)} />
                    <MetricTile icon={Target} label="Target" value={formatMoney(prediction?.expectedPrice || 0, sourceCurrency)} />
                    <MetricTile
                      icon={Zap}
                      label="Move"
                      value={formatPercent(prediction?.expectedMovePercent || displayedMove)}
                      tone={(prediction?.expectedMovePercent || displayedMove) >= 0 ? "text-success" : "text-danger"}
                    />
                  </div>

                  <div className="mt-auto space-y-2">
                    <span className="text-[9px] font-black uppercase tracking-wider text-muted-fg block">Quick follow-ups</span>
                    {helperSuggestions.slice(0, 3).map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => handleSendMessage(suggestion)}
                        className="w-full text-left px-3 py-2 rounded-xl bg-background border border-border text-[10px] font-black uppercase tracking-wider text-foreground hover:bg-accent hover:text-accent-fg transition-colors cursor-pointer"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </aside>
              </div>

              <div className="p-3 bg-background border-t border-border" id="input-processing-panel">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-3 w-full relative"
                >
                  <button
                    type="button"
                    className="bg-card hover:bg-muted border border-border rounded-xl shrink-0 cursor-pointer transition-all flex items-center justify-center h-11 w-11"
                    title="Attach context"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  <input
                    type="text"
                    placeholder="Ask about signal confidence, risk controls, support, or scenario probabilities..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="flex-1 bg-card border border-border px-4 h-11 rounded-xl text-sm text-foreground placeholder:text-muted-fg font-semibold focus:outline-none focus:bg-muted transition-all min-w-0"
                    id="ai-insights-chat-input"
                  />

                  <button
                    type="submit"
                    className="h-11 w-11 bg-primary hover:bg-card border border-border text-primary-fg hover:text-accent-fg rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0"
                    title="Transmit query"
                    id="btn-transmit-chat"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>

                <div className="text-center text-[8.5px] text-foreground/50 mt-2 font-bold tracking-wider uppercase">
                  Powered by NVIDIA NIM inference | Strict sandboxed proxy routing.
                </div>
              </div>
            </div>
          </section>
          )}
        </div>
      </div>
    </div>
  );
}
