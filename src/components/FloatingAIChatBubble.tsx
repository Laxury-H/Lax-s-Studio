import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
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
import { useSettings } from "../SettingsContext";

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
  const { language } = useSettings();
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
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-8),
          language
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(`AI request failed with ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let rawText = "";

      const extractXML = (raw: string, tag: string) => {
        const open = `<${tag}>`;
        const close = `</${tag}>`;
        const start = raw.indexOf(open);
        if (start === -1) return "";
        const end = raw.indexOf(close);
        if (end === -1) return raw.slice(start + open.length).trim();
        return raw.slice(start + open.length, end).trim();
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content || "";
              rawText += content;
              
              setMessages(prev => prev.map(message => (
                message.id === loadingId
                  ? {
                      ...message,
                      compactTitle: "Answer",
                      text: extractXML(rawText, "text") || rawText.replace(/<[^>]+>/g, '').trim() || "Typing...",
                      summary: extractXML(rawText, "summary") || "",
                      technicalView: extractXML(rawText, "technicalView") || "",
                      riskFactors: extractXML(rawText, "riskFactors") || "",
                      timestamp: nowLabel(),
                      isLoading: false
                    }
                  : message
              )));
            } catch (e) {
              // Ignore partial JSON chunks
            }
          }
        }
      }
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
    <div className="fixed bottom-20 right-3 md:bottom-12 md:right-5 z-[120] pointer-events-none">
      {isOpen && (
        <section className="pointer-events-auto mb-3 md:mb-4 w-[min(420px,calc(100vw-1.5rem))] max-h-[calc(100dvh-7.5rem)] overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/25 origin-bottom-right animate-in zoom-in-95 fade-in-0 duration-200 slide-in-from-bottom-2">
          <header className="bg-background border-b border-border px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-radiant text-primary-fg border border-border flex items-center justify-center shrink-0">
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

          <div className="max-h-[min(420px,calc(100dvh-18rem))] overflow-y-auto bg-muted p-3 sm:p-4 space-y-3">
            {messages.map(message => {
              const isAI = message.sender === "ai";
              return (
                <div key={message.id} className={`flex gap-2 ${isAI ? "justify-start" : "justify-end"}`}>
                  {isAI && (
                    <div className="h-8 w-8 rounded-xl bg-radiant text-primary-fg border border-border flex items-center justify-center shrink-0">
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
                    {isAI && (message.summary || message.technicalView) && !message.isLoading && (
                      <div className="mt-3 grid gap-2">
                        {message.summary && (
                          <div 
                            onClick={() => handleCopy({ text: message.summary || "" } as BubbleMessage)}
                            className="rounded-lg border border-border bg-background px-3 py-2 cursor-pointer hover:border-primary/50 transition-colors group relative"
                            title="Click to copy summary"
                          >
                            <span className="block text-[8px] font-black uppercase tracking-wider text-muted-fg mb-1 group-hover:text-primary transition-colors">Summary</span>
                            <p className="text-[10px] font-semibold leading-relaxed text-foreground/85">{message.summary}</p>
                            <Copy className="w-3 h-3 absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-muted-fg transition-opacity" />
                          </div>
                        )}
                        {message.technicalView && (
                          <div 
                            onClick={() => handleCopy({ text: message.technicalView || "" } as BubbleMessage)}
                            className="rounded-lg border border-border bg-background px-3 py-2 cursor-pointer hover:border-primary/50 transition-colors group relative"
                            title="Click to copy technical details"
                          >
                            <span className="block text-[8px] font-black uppercase tracking-wider text-muted-fg mb-1 group-hover:text-primary transition-colors">Technical</span>
                            <p className="text-[10px] font-semibold leading-relaxed text-foreground/85">{message.technicalView}</p>
                            <Copy className="w-3 h-3 absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-muted-fg transition-opacity" />
                          </div>
                        )}
                      </div>
                    )}
                    <div className={`mt-2 flex items-center justify-between gap-3 text-[9px] font-bold ${
                      isAI ? "text-muted-fg" : "text-primary-fg/65"
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0">{message.timestamp}</span>
                        {isAI && !message.isLoading && message.riskFactors && (
                          <span
                            className="inline-flex items-center gap-1 max-w-[150px] rounded-md border border-danger/20 bg-danger/10 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider text-danger cursor-help"
                            title={message.riskFactors}
                          >
                            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{message.riskFactors}</span>
                          </span>
                        )}
                      </div>
                      {isAI && !message.isLoading && (
                        <button
                          onClick={() => handleCopy(message)}
                          className="hover:text-primary cursor-pointer shrink-0"
                          title="Copy full response"
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
                className="h-11 w-11 rounded-xl bg-radiant text-primary-fg border border-border flex items-center justify-center disabled:opacity-50 cursor-pointer"
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
        className="pointer-events-auto group h-11 rounded-xl border border-border bg-radiant backdrop-blur-md text-primary-fg shadow-xl shadow-black/25 opacity-80 hover:opacity-100 hover:translate-y-[-1px] active:translate-y-0 transition-all duration-300 flex items-center gap-2.5 px-3 cursor-pointer"
        title={isOpen ? "Close AI chat" : "Open AI chat"}
      >
        <span className="relative flex h-7.5 w-7.5 items-center justify-center rounded-lg bg-primary-fg text-primary shrink-0">
          {isOpen ? <X className="w-3.5 h-3.5" /> : <MessageCircle className="w-3.5 h-3.5" />}
          {!isOpen && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-success border border-primary animate-pulse" />}
        </span>
        <span className="hidden sm:block text-left">
          <span className="block text-[9.5px] font-black uppercase leading-none tracking-wider">Ask AI</span>
          <span className="block text-[8px] font-black uppercase leading-none tracking-wider opacity-70 mt-0.5">Quick assistant</span>
        </span>
      </button>
    </div>
  );
}
