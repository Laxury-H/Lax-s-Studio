import { useState, useRef, useEffect } from "react";
import {
  Plus, 
  Sparkles, 
  Paperclip, 
  Send, 
  ThumbsUp, 
  ThumbsDown, 
  Copy, 
  RefreshCw, 
  AlertTriangle,
  FileText,
  User,
  MessagesSquare,
  Flame,
  Activity
} from "lucide-react";
import { ChatHistoryItem, ChatMessage } from "../types";

interface AIInsightsViewProps {
  initialTickerQuery?: string;
  onClearInitialQuery?: () => void;
}

export default function AIInsightsView({ initialTickerQuery, onClearInitialQuery }: AIInsightsViewProps) {
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

  // References for scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Suggested questions shown in Screen 2 help tags
  const helperSuggestions = [
    "Analyze AAPL",
    "Analyze NVDA",
    "Analyze BTC",
    "Tesla Technicals",
  ];

  // Current selected chat session
  const activeSession = chatHistory.find(s => s.id === activeSessionId) || chatHistory[0];

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages, activeSession?.messages.length]);

  // Load chat history on mount
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

  // Save active session on change
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

  // Handle setting initial query if passed from other views
  useEffect(() => {
    if (initialTickerQuery) {
      if (initialTickerQuery === "TECH_ALERT") {
        handleSendMessage("Explain why Technology indices indicate strong structural buy tags after semi-conductor breakthroughs.");
      } else if (initialTickerQuery === "SENTIMENT_DATA") {
        handleSendMessage("Produce a sentiment indicator analysis detailing capital rotation from high-multiplier tech towards energy.");
      } else if (initialTickerQuery === "ALL_NEWS") {
        handleSendMessage("Summarize the chief events occurring in global financial markets over the last 24 hours.");
      } else {
        handleSendMessage(`Analyze the technical indicators, resistance points, and risks for ${initialTickerQuery}.`);
      }
      if (onClearInitialQuery) onClearInitialQuery();
    }
  }, [initialTickerQuery]);

  // Send message trigger
  const handleSendMessage = async (rawText?: string) => {
    const textToSend = rawText || inputText;
    if (!textToSend.trim()) return;

    if (!rawText) setInputText("");

    // 1. Create a User Message object
    const userMsgId = "msg_u_" + Date.now();
    const newUserMsg: ChatMessage = {
      id: userMsgId,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    };

    // 2. Create an AI pending loading message
    const aiMsgId = "msg_ai_" + Date.now();
    const newAiMsg: ChatMessage = {
      id: aiMsgId,
      sender: "ai",
      text: "",
      timestamp: "--:-- PM",
      isLoading: true
    };

    // 3. Append to history session
    let updatedHistory = chatHistory.map((sess) => {
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
      // Send to server-side Express API endpoint which proxies to NVIDIA NIM.
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
                  // extract tags
                  const extract = (tag: string) => {
                    const match = buf.match(new RegExp(`<${tag}>([\\s\\S]*?)(?:<\\/${tag}>|$)`, 'i'));
                    return match ? match[1].trim() : undefined;
                  };
                  
                  const hasTextTag = buf.includes('<text>');
                  const text = hasTextTag ? (extract('text') || '') : buf.trim();
                  
                  return {
                    ...m,
                    text: text,
                    summary: extract('summary'),
                    technicalView: extract('technicalView'),
                    riskFactors: extract('riskFactors'),
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
        
        // Parse SSE lines
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || ""; // Keep the incomplete line in the buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) throw new Error(data.error);
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                completeText += content;
              }
            } catch (e) {
              // ignore parse errors for partial JSON chunks or [DONE]
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

  return (
    <div className="flex flex-1 -mx-8 -my-8" id="ai-insights-container">
      {/* 1. Inside Chat History column (Left sidebar inside workspace) */}
      <div className="w-72 bg-background border-r-2 border-border flex flex-col justify-between select-none shrink-0" id="chat-history-sidebar">
        
        {/* Header toolbar with "+" toggle */}
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

        {/* Previous threads list scrollable */}
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
                <div className="flex items-center gap-1.5">
                  <MessagesSquare className={`w-3.5 h-3.5 ${isActive ? "text-[#FFD600]" : "text-foreground/40"}`} />
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

        {/* System core indicators footer */}
        <div className="p-4 bg-card border border-border text-foregroundenter" id="history-footer">
          <span className="text-[9px] text-[#FFD600] font-black uppercase block tracking-widest leading-none">SECURE CONTAINER CONNECTED</span>
        </div>
      </div>

      {/* 2. Main Chat Processing terminal */}
      <div className="flex-1 flex flex-col justify-between bg-card relative overflow-hidden" id="chat-processing-terminal">
        
        {/* Suggestion Chips Bar */}
        <div className="p-4 bg-background border-b border-border flex items-center gap-2 overflow-x-auto select-none" id="suggestion-chips-bar">
          <span className="text-[9px] text-foreground font-black uppercase tracking-wider shrink-0 mr-1.5">AUTO DISPATCHER:</span>
          {helperSuggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(suggestion)}
              className="px-3 py-2 bg-card border border-border text-foreground text-[10px] tracking-wider font-black uppercase hover:bg-accent hover:shadow-lg shadow-black/5 dark:shadow-black/20 active:translate-y-0.5 transition-all rounded-xl shrink-0 cursor-pointer whitespace-nowrap"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {/* Chat message bubbles list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-muted" id="chat-bubbles-container">
          
          {activeSession.messages.map((msg) => {
            const isAI = msg.sender === "ai";
            return (
              <div 
                key={msg.id} 
                className={`flex gap-4 max-w-3xl ${
                  isAI ? "mr-auto text-left" : "ml-auto flex-row-reverse text-right"
                }`}
                id={`chat-bubble-${msg.id}`}
              >
                {/* User or AI avatar */}
                <div 
                  className={`w-9 h-9 border border-border flex items-center justify-center shrink-0 shadow-lg shadow-black/5 dark:shadow-black/20 ${
                    isAI 
                      ? "bg-primary text-primary-fg" 
                      : "bg-primary text-primary-fg"
                  }`}
                >
                  {isAI ? (
                    <Sparkles className="w-4 h-4 fill-current text-[#FFD600]" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                </div>

                {/* Bubble card body */}
                <div className="space-y-4 max-w-full">
                  
                  {/* User content */}
                  {!isAI && (
                    <div className="bg-muted text-foreground text-xs px-4.5 py-3 border border-border rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 inline-block font-sans text-left leading-relaxed font-bold">
                      {msg.text}
                    </div>
                  )}

                  {/* AI Structured Content matching Screen 2 */}
                  {isAI && (
                    <div className="bg-card border border-border rounded-xl p-5 shadow-lg shadow-black/5 dark:shadow-black/20 space-y-5 text-left max-w-full relative overflow-hidden" id="ai-structured-box">
                      
                      {/* Left vertical raw border */}
                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary" />

                      {/* Header analysis section */}
                      <div className="flex items-center gap-2 text-foreground border-b border-border/10 pb-2">
                        <Sparkles className="w-4 h-4 text-[#0047FF] fill-current" />
                        <span className="font-black text-[10px] uppercase tracking-wider font-sans">
                          NEURAL PIPELINE ANALYSIS OUTPUT
                        </span>
                      </div>

                      {/* Loader spinner */}
                      {msg.isLoading ? (
                        <div className="flex items-center gap-2 py-4 text-xs text-foreground font-semibold">
                          <RefreshCw className="w-4 h-4 animate-spin text-[#0047FF]" />
                          <span>Streaming live intelligence response payload...</span>
                        </div>
                      ) : (
                        <>
                          <p className="text-foreground text-xs font-semibold leading-relaxed font-sans">
                            {msg.text}
                          </p>

                          {/* Parallel Sub-boxes: SUMMARY & TECHNICAL VIEW */}
                          {(msg.summary || msg.technicalView) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="ai-boxes-grid">
                              {/* Box A: Summary */}
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

                              {/* Box B: Technical View */}
                              {msg.technicalView && (
                                <div className="bg-card border border-border p-4 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20" id="tech-view-section">
                                  <div className="flex items-center gap-1.5 text-foreground mb-2">
                                    <Activity className="w-3.5 h-3.5 text-[#0047FF]" />
                                    <span className="font-black text-[10px] uppercase tracking-wider">Technical Signal view</span>
                                  </div>
                                  <p className="text-foreground/85 text-[11px] font-semibold leading-relaxed">
                                    {msg.technicalView}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Box C: Risk factors danger section */}
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

                          {/* Actions foot bar */}
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

        {/* Bottom Input Processing Panel */}
        <div className="p-5 bg-background border-t border-border" id="input-processing-panel">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-3 max-w-4xl mx-auto w-full relative"
          >
            {/* Attachment paperclip tag */}
            <button 
              type="button" 
              className="p-3 bg-card hover:bg-card border border-border hover:text-primary-fg border border-border rounded-xl shrink-0 cursor-pointer transition-all shadow-lg shadow-black/5 dark:shadow-black/20 flex items-center justify-center h-12 w-12"
              title="Spreadsheets locked"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Main Text Input area */}
            <input
              type="text"
              placeholder="Input ticker tag or ask a quantitative market query..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 bg-card border border-border px-4 py-3 h-12 rounded-xl text-sm text-foreground placeholder-black/30 font-semibold focus:outline-none focus:bg-muted focus:shadow-lg shadow-black/5 dark:shadow-black/20 transition-all"
              id="ai-insights-chat-input"
            />

            {/* Send plane icon button */}
            <button
              type="submit"
              className="h-12 w-12 bg-primary hover:bg-card border border-border border border-border text-primary-fg hover:text-accent-fg rounded-xl flex items-center justify-center shadow-lg shadow-black/5 dark:shadow-black/20 transition-all cursor-pointer shrink-0"
              title="Transmit query"
              id="btn-transmit-chat"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          
          <div className="text-foregroundenter text-[8.5px] text-foreground/50 mt-2.5 font-bold tracking-wider uppercase">
            Powered by NVIDIA NIM inference • Strict sandboxed proxy routing.
          </div>
        </div>

      </div>
    </div>
  );
}
