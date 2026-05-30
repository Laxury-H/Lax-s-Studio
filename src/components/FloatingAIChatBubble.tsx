import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  BrainCircuit,
  ChevronDown,
  Copy,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  X,
  Zap
} from "lucide-react";
import { ChatMessage, MarketAsset } from "../types";

interface FloatingAIChatBubbleProps {
  marketAssets: MarketAsset[];
  currentTab: string;
  onOpenPredictor: () => void;
}

type BubbleMessage = ChatMessage & {
  compactTitle?: string;
};

const STORAGE_KEY = "finpilot-floating-ai-chat";

function nowLabel() {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function parseAssistantPayload(rawText: string, fallback: string) {
  if (!rawText.trim()) {
    throw new Error(fallback);
  }

  try {
    return JSON.parse(rawText);
  } catch {
    if (rawText.trim().startsWith("<")) {
      throw new Error("AI endpoint returned an HTML response. Restart the server and try again.");
    }
    throw new Error(rawText.slice(0, 180));
  }
}

function createWelcomeMessage(): BubbleMessage {
  return {
    id: "float_ai_welcome",
    sender: "ai",
    compactTitle: "Ready",
    text: "I can help you inspect tickers, summarize risk, explain portfolio moves, or open the full AI Predictor when you need deeper forecasting.",
    timestamp: nowLabel(),
    summary: "Floating assistant is online.",
    technicalView: "Uses the same secure server-side AI proxy as the main predictor.",
    riskFactors: "Use responses as research support, not financial advice."
  };
}

export default function FloatingAIChatBubble({
  marketAssets,
  currentTab,
  onOpenPredictor
}: FloatingAIChatBubbleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [messages, setMessages] = useState<BubbleMessage[]>(() => {
    if (typeof window === "undefined") return [createWelcomeMessage()];
    try {
      const saved = window.sessionStorage.getItem(STORAGE_KEY);
      if (!saved) return [createWelcomeMessage()];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : [createWelcomeMessage()];
    } catch {
      return [createWelcomeMessage()];
    }
  });

  const endRef = useRef<HTMLDivElement>(null);
  const lastUserMessage = messages.filter(message => message.sender === "user").at(-1)?.text;

  const quickPrompts = useMemo(() => {
    const topAssets = marketAssets.slice(0, 3).map(asset => asset.symbol);
    const first = topAssets[0] || "AAPL";
    const second = topAssets[1] || "BTC";
    const third = topAssets[2] || "NVDA";

    return [
      `Quick risk on ${first}`,
      `Explain ${second} move`,
      `Support for ${third}`,
      "Portfolio hedge"
    ];
  }, [marketAssets]);

  useEffect(() => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20)));
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isOpen, messages]);

  const handleCopy = (message: BubbleMessage) => {
    const payload = [
      message.text,
      message.summary ? `Summary: ${message.summary}` : "",
      message.technicalView ? `Technical: ${message.technicalView}` : "",
      message.riskFactors ? `Risk: ${message.riskFactors}` : ""
    ].filter(Boolean).join("\n");

    navigator.clipboard.writeText(payload);
    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 1600);
  };

  const handleClear = () => {
    setMessages([createWelcomeMessage()]);
  };

  const sendMessage = async (rawText?: string) => {
    const text = (rawText || inputText).trim();
    if (!text || isSending) return;

    if (!rawText) setInputText("");
    setIsOpen(true);
    setIsSending(true);

    const userMessage: BubbleMessage = {
      id: `float_user_${Date.now()}`,
      sender: "user",
      text,
      timestamp: nowLabel()
    };

    const loadingId = `float_ai_${Date.now()}`;
    const loadingMessage: BubbleMessage = {
      id: loadingId,
      sender: "ai",
      compactTitle: "Thinking",
      text: "Analyzing the request...",
      timestamp: "--:--",
      isLoading: true
    };

    setMessages(prev => [...prev, userMessage, loadingMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-8)
        })
      });

      const rawResponse = await response.text();
      const data = parseAssistantPayload(rawResponse, "AI returned an empty response.");

      if (!response.ok) {
        throw new Error(data.error || `AI request failed with ${response.status}`);
      }

      setMessages(prev => prev.map(message => (
        message.id === loadingId
          ? {
              ...message,
              compactTitle: "Answer",
              text: data.text || data.analysis || "I could not produce a detailed answer for that request.",
              summary: data.summary,
              technicalView: data.technicalView,
              riskFactors: data.riskFactors,
              timestamp: nowLabel(),
              isLoading: false
            }
          : message
      )));
    } catch (error: any) {
      setMessages(prev => prev.map(message => (
        message.id === loadingId
          ? {
              ...message,
              compactTitle: "Connection issue",
              text: error.message || "AI assistant is temporarily unavailable.",
              summary: "The floating assistant could not complete the request.",
              technicalView: "Check backend availability and AI provider configuration.",
              riskFactors: "Retry before relying on this response.",
              timestamp: nowLabel(),
              isLoading: false
            }
          : message
      )));
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sendMessage();
  };

  return (
    <div className="fixed bottom-12 right-5 z-[70] pointer-events-none">
      {isOpen && (
        <section className="pointer-events-auto mb-4 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/25">
          <header className="bg-background border-b border-border px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-primary text-primary-fg border border-border flex items-center justify-center shrink-0">
                <BrainCircuit className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-black uppercase tracking-wider text-foreground truncate">FinPilot AI Bubble</h3>
                <p className="text-[9px] font-black uppercase tracking-wider text-muted-fg truncate">
                  {currentTab === "insights" ? "Predictor context active" : "Available across workspace"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={onOpenPredictor}
                className="h-9 w-9 rounded-xl border border-border bg-card text-foreground hover:bg-accent hover:text-accent-fg flex items-center justify-center cursor-pointer"
                title="Open full AI Predictor"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
              <button
                onClick={handleClear}
                className="h-9 w-9 rounded-xl border border-border bg-card text-foreground hover:bg-muted flex items-center justify-center cursor-pointer"
                title="Clear chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="h-9 w-9 rounded-xl border border-border bg-card text-foreground hover:bg-muted flex items-center justify-center cursor-pointer"
                title="Minimize"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </header>

          <div className="max-h-[420px] overflow-y-auto bg-muted p-4 space-y-3">
            {messages.map(message => {
              const isAI = message.sender === "ai";
              return (
                <div key={message.id} className={`flex gap-2 ${isAI ? "justify-start" : "justify-end"}`}>
                  {isAI && (
                    <div className="h-8 w-8 rounded-xl bg-primary text-primary-fg border border-border flex items-center justify-center shrink-0">
                      {message.isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                    </div>
                  )}
                  <div className={`max-w-[82%] rounded-xl border px-3 py-2 ${
                    isAI
                      ? "bg-card border-border text-foreground"
                      : "bg-primary text-primary-fg border-border"
                  }`}>
                    {message.compactTitle && (
                      <div className={`mb-1 flex items-center gap-1.5 text-[8.5px] font-black uppercase tracking-wider ${
                        isAI ? "text-primary" : "text-primary-fg/70"
                      }`}>
                        <Sparkles className="w-3 h-3" />
                        <span>{message.compactTitle}</span>
                      </div>
                    )}
                    <p className="text-xs font-semibold leading-relaxed whitespace-pre-line">{message.text}</p>
                    {isAI && (message.summary || message.technicalView || message.riskFactors) && !message.isLoading && (
                      <div className="mt-3 grid gap-2">
                        {message.summary && (
                          <div className="rounded-lg border border-border bg-background px-3 py-2">
                            <span className="block text-[8px] font-black uppercase tracking-wider text-muted-fg mb-1">Summary</span>
                            <p className="text-[10px] font-semibold leading-relaxed text-foreground/85">{message.summary}</p>
                          </div>
                        )}
                        {message.technicalView && (
                          <div className="rounded-lg border border-border bg-background px-3 py-2">
                            <span className="block text-[8px] font-black uppercase tracking-wider text-muted-fg mb-1">Technical</span>
                            <p className="text-[10px] font-semibold leading-relaxed text-foreground/85">{message.technicalView}</p>
                          </div>
                        )}
                        {message.riskFactors && (
                          <div className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2">
                            <span className="block text-[8px] font-black uppercase tracking-wider text-danger mb-1">Risk</span>
                            <p className="text-[10px] font-bold leading-relaxed text-danger">{message.riskFactors}</p>
                          </div>
                        )}
                      </div>
                    )}
                    <div className={`mt-2 flex items-center justify-between gap-3 text-[9px] font-bold ${
                      isAI ? "text-muted-fg" : "text-primary-fg/65"
                    }`}>
                      <span>{message.timestamp}</span>
                      {isAI && !message.isLoading && (
                        <button
                          onClick={() => handleCopy(message)}
                          className="hover:text-primary cursor-pointer"
                          title="Copy response"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          <div className="bg-card border-t border-border p-3 space-y-3">
            <div className="flex items-center gap-2 overflow-x-auto">
              {quickPrompts.map(prompt => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  disabled={isSending}
                  className="px-3 py-2 rounded-xl bg-muted border border-border text-[9px] font-black uppercase tracking-wider text-foreground hover:bg-accent hover:text-accent-fg shrink-0 disabled:opacity-60 cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <input
                value={inputText}
                onChange={event => setInputText(event.target.value)}
                placeholder="Ask AI anywhere..."
                className="h-11 flex-1 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground placeholder:text-muted-fg outline-none focus:bg-muted"
              />
              <button
                type="submit"
                disabled={isSending || !inputText.trim()}
                className="h-11 w-11 rounded-xl bg-primary text-primary-fg border border-border flex items-center justify-center disabled:opacity-50 cursor-pointer"
                title="Send"
              >
                {isSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>

            {lastUserMessage && (
              <div className="flex items-center gap-1.5 text-[8.5px] font-black uppercase tracking-wider text-muted-fg">
                <Zap className="w-3 h-3 text-primary" />
                <span className="truncate">Last prompt: {lastUserMessage}</span>
              </div>
            )}
            {isCopied && (
              <span className="block text-[9px] font-black uppercase tracking-wider text-success">Copied response</span>
            )}
          </div>
        </section>
      )}

      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="pointer-events-auto group h-14 rounded-2xl border border-border bg-primary text-primary-fg shadow-2xl shadow-black/25 hover:translate-y-[-1px] active:translate-y-0 transition-all flex items-center gap-3 px-4 cursor-pointer"
        title={isOpen ? "Close AI chat" : "Open AI chat"}
      >
        <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-primary-fg text-primary">
          {isOpen ? <X className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
          {!isOpen && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-success border-2 border-primary animate-pulse" />}
        </span>
        <span className="hidden sm:block text-left">
          <span className="block text-[10px] font-black uppercase leading-none tracking-wider">Ask AI</span>
          <span className="block text-[8.5px] font-black uppercase leading-none tracking-wider opacity-70 mt-1">Quick assistant</span>
        </span>
      </button>
    </div>
  );
}
