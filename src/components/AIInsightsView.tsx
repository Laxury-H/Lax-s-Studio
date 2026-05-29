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
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: textToSend })
      });
      const data = await response.json();

      setChatHistory(prev => prev.map((sess) => {
        if (sess.id === activeSessionId) {
          return {
            ...sess,
            messages: sess.messages.map((m) => {
              if (m.id === aiMsgId) {
                return {
                  ...m,
                  text: data.text || "Analysis complete.",
                  summary: data.summary,
                  technicalView: data.technicalView,
                  riskFactors: data.riskFactors,
                  timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
                  isLoading: false
                };
              }
              return m;
            })
          };
        }
        return sess;
      }));
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
    <div className="flex h-[calc(100vh-100px)] -mx-8 -my-8" id="ai-insights-container">
      {/* 1. Inside Chat History column (Left sidebar inside workspace) */}
      <div className="w-72 bg-[#F3F3F3] border-r-2 border-black flex flex-col justify-between select-none shrink-0" id="chat-history-sidebar">
        
        {/* Header toolbar with "+" toggle */}
        <div className="p-5 border-b-2 border-black bg-white flex items-center justify-between">
          <h3 className="font-sans font-black text-xs uppercase tracking-wider text-black">SURVEILLANCE WORKSPACE</h3>
          <button 
            onClick={handleStartNewChat}
            className="p-2 border border-black bg-[#0047FF] text-white hover:bg-[#FFD600] hover:text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center cursor-pointer transition-all rounded-xs"
            title="Start new analysis thread"
            id="btn-add-chat"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Previous threads list scrollable */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F3F3F3]" id="threads-list">
          {chatHistory.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <button
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
                className={`w-full text-left p-3.5 border rounded-xs transition-all duration-100 block cursor-pointer group ${
                  isActive
                    ? "bg-[#0047FF] text-white border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                    : "bg-white text-black border-black/10 hover:border-black hover:bg-[#FFD600]"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <MessagesSquare className={`w-3.5 h-3.5 ${isActive ? "text-[#FFD600]" : "text-black/40"}`} />
                  <span className="font-sans font-black text-xs tracking-wide uppercase truncate block max-w-[160px]" id={`thread-title-${session.id}`}>
                    {session.title}
                  </span>
                </div>
                <span className={`text-[8.5px] font-black mt-1.5 block font-mono tracking-wider ${isActive ? "text-white/60" : "text-black/40"}`}>
                  {session.timeLabel}
                </span>
              </button>
            );
          })}
        </div>

        {/* System core indicators footer */}
        <div className="p-4 bg-black text-center" id="history-footer">
          <span className="text-[9px] text-[#FFD600] font-black uppercase block tracking-widest leading-none">SECURE CONTAINER CONNECTED</span>
        </div>
      </div>

      {/* 2. Main Chat Processing terminal */}
      <div className="flex-1 flex flex-col justify-between bg-white relative overflow-hidden" id="chat-processing-terminal">
        
        {/* Suggestion Chips Bar */}
        <div className="p-4 bg-[#F3F3F3] border-b-2 border-black flex items-center gap-2 overflow-x-auto select-none" id="suggestion-chips-bar">
          <span className="text-[9px] text-black font-black uppercase tracking-wider shrink-0 mr-1.5">AUTO DISPATCHER:</span>
          {helperSuggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(suggestion)}
              className="px-3 py-2 bg-white border border-black text-black text-[10px] tracking-wider font-black uppercase hover:bg-[#FFD600] hover:shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition-all rounded-xs shrink-0 cursor-pointer whitespace-nowrap"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {/* Chat message bubbles list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-neutral-50" id="chat-bubbles-container">
          
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
                  className={`w-9 h-9 border border-black flex items-center justify-center shrink-0 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
                    isAI 
                      ? "bg-[#0047FF] text-white" 
                      : "bg-[#FFD600] text-black"
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
                    <div className="bg-black text-white text-xs px-4.5 py-3 border border-black rounded-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] inline-block font-sans text-left leading-relaxed font-bold">
                      {msg.text}
                    </div>
                  )}

                  {/* AI Structured Content matching Screen 2 */}
                  {isAI && (
                    <div className="bg-white border-2 border-black rounded-xs p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-5 text-left max-w-full relative overflow-hidden" id="ai-structured-box">
                      
                      {/* Left vertical raw border */}
                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#0047FF]" />

                      {/* Header analysis section */}
                      <div className="flex items-center gap-2 text-black border-b border-black/10 pb-2">
                        <Sparkles className="w-4 h-4 text-[#0047FF] fill-current" />
                        <span className="font-black text-[10px] uppercase tracking-wider font-sans">
                          NEURAL PIPELINE ANALYSIS OUTPUT
                        </span>
                      </div>

                      {/* Loader spinner */}
                      {msg.isLoading ? (
                        <div className="flex items-center gap-2 py-4 text-xs text-black font-semibold">
                          <RefreshCw className="w-4 h-4 animate-spin text-[#0047FF]" />
                          <span>Streaming live intelligence response payload...</span>
                        </div>
                      ) : (
                        <>
                          <p className="text-black text-xs font-semibold leading-relaxed font-sans">
                            {msg.text}
                          </p>

                          {/* Parallel Sub-boxes: SUMMARY & TECHNICAL VIEW */}
                          {(msg.summary || msg.technicalView) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="ai-boxes-grid">
                              {/* Box A: Summary */}
                              {msg.summary && (
                                <div className="bg-white border border-black p-4 rounded-xs shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)]" id="summary-section">
                                  <div className="flex items-center gap-1.5 text-[#0047FF] mb-2">
                                    <FileText className="w-3.5 h-3.5" />
                                    <span className="font-black text-[10px] uppercase tracking-wider">AI Bullet Summary</span>
                                  </div>
                                  <p className="text-black/85 text-[11px] font-semibold leading-relaxed">
                                    {msg.summary}
                                  </p>
                                </div>
                              )}

                              {/* Box B: Technical View */}
                              {msg.technicalView && (
                                <div className="bg-white border border-black p-4 rounded-xs shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)]" id="tech-view-section">
                                  <div className="flex items-center gap-1.5 text-black mb-2">
                                    <Activity className="w-3.5 h-3.5 text-[#0047FF]" />
                                    <span className="font-black text-[10px] uppercase tracking-wider">Technical Signal view</span>
                                  </div>
                                  <p className="text-black/85 text-[11px] font-semibold leading-relaxed">
                                    {msg.technicalView}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Box C: Risk factors danger section */}
                          {msg.riskFactors && (
                            <div className="bg-[#fff1f2] border-2 border-black p-4 rounded-xs" id="risks-danger-block">
                              <div className="flex items-center gap-1 text-red-700 mb-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span className="font-black text-[10px] uppercase tracking-wider">CRITICAL RISKS SUMMARY</span>
                              </div>
                              <p className="text-red-900 text-[11px] leading-relaxed font-sans font-bold uppercase">
                                {msg.riskFactors}
                              </p>
                            </div>
                          )}

                          {/* Actions foot bar */}
                          <div className="pt-3 border-t border-black/10 flex items-center justify-between text-[10px] text-black/50">
                            <div className="flex items-center gap-3">
                              <button className="hover:text-black transition-colors cursor-pointer" title="Vote useful">
                                <ThumbsUp className="w-3.5 h-3.5" />
                              </button>
                              <button className="hover:text-black transition-colors cursor-pointer" title="Vote not useful">
                                <ThumbsDown className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleCopyText(msg.text + "\n" + (msg.summary || ""))}
                                className="hover:text-[#0047FF] transition-colors cursor-pointer"
                                title="Copy analysis payload"
                              >
                                <Copy className="w-3.5 h-3.5 text-black hover:text-[#0047FF]" />
                              </button>
                              {isCopied && <span className="text-emerald-700 font-black font-sans uppercase">Copied!</span>}
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
        <div className="p-5 bg-[#F3F3F3] border-t-2 border-black" id="input-processing-panel">
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
              className="p-3 bg-white hover:bg-black hover:text-white border border-black rounded-xs shrink-0 cursor-pointer transition-all shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center h-12 w-12"
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
              className="flex-1 bg-white border-2 border-black px-4 py-3 h-12 rounded-xs text-sm text-black placeholder-black/30 font-semibold focus:outline-none focus:bg-neutral-50 focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
              id="ai-insights-chat-input"
            />

            {/* Send plane icon button */}
            <button
              type="submit"
              className="h-12 w-12 bg-[#0047FF] hover:bg-black border-2 border-black text-white hover:text-[#FFD600] rounded-xs flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer shrink-0"
              title="Transmit query"
              id="btn-transmit-chat"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          
          <div className="text-center text-[8.5px] text-black/50 mt-2.5 font-bold tracking-wider uppercase">
            Powered by NVIDIA NIM inference • Strict sandboxed proxy routing.
          </div>
        </div>

      </div>
    </div>
  );
}
