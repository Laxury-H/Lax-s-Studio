import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { SettingsContext } from "../SettingsContext";

export const EXCHANGES = [
  // CEX
  { id: "binance", name: "Binance", type: "cex" },
  { id: "bybit", name: "Bybit", type: "cex" },
  { id: "okx", name: "OKX", type: "cex" },
  { id: "bitget", name: "Bitget", type: "cex" },
  { id: "coinbase", name: "Coinbase", type: "cex" },
  { id: "gate", name: "Gate.io", type: "cex" },
  { id: "htx", name: "HTX", type: "cex" },
  { id: "kucoin", name: "KuCoin", type: "cex" },
  { id: "mexc", name: "MEXC", type: "cex" },
  { id: "kraken", name: "Kraken", type: "cex" },
  { id: "cryptocom", name: "Crypto.com", type: "cex" },
  { id: "upbit", name: "Upbit", type: "cex" },
  { id: "bithumb", name: "Bithumb", type: "cex" },
  { id: "coinone", name: "Coinone", type: "cex" },
  { id: "lbank", name: "LBank", type: "cex" },
  { id: "bingx", name: "BingX", type: "cex" },
  { id: "bitfinex", name: "Bitfinex", type: "cex" },
  { id: "coinex", name: "CoinEx", type: "cex" },
  { id: "whitebit", name: "WhiteBIT", type: "cex" },
  { id: "poloniex", name: "Poloniex", type: "cex" },
  { id: "phemex", name: "Phemex", type: "cex" },
  
  // DEX
  { id: "uniswap", name: "Uniswap", type: "dex" },
  { id: "pancakeswap", name: "PancakeSwap", type: "dex" },
  { id: "raydium", name: "Raydium", type: "dex" },
  { id: "jupiter", name: "Jupiter", type: "dex" },
  { id: "dydx", name: "dYdX", type: "dex" },
  { id: "sushiswap", name: "SushiSwap", type: "dex" }
];

export default function ExchangeSelector() {
  const context = React.useContext(SettingsContext);
  if (!context) return null;
  const { selectedExchange, setSelectedExchange, connectedExchanges } = context;
  
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = EXCHANGES.find(e => e.id === selectedExchange) || EXCHANGES[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredExchanges = EXCHANGES.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-card/80 border border-border rounded-lg hover:bg-muted transition-colors"
      >
        <div className="flex flex-col items-start">
          <span className="text-[9px] font-black uppercase text-muted-fg leading-none tracking-widest mb-0.5">Exchange</span>
          <span className="text-xs font-bold text-foreground leading-none">{selected.name}</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-fg transition-transform \${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 w-56 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden flex flex-col max-h-[400px]">
          <div className="p-2 border-b border-border bg-muted/30">
            <input 
              type="text" 
              placeholder="Search exchange..." 
              className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
              onClick={e => e.stopPropagation()}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="overflow-y-auto p-1 flex-1">
            {connectedExchanges.length > 0 && search === "" && (
              <>
                <div className="px-2 pt-2 pb-1 text-[10px] font-black uppercase text-muted-fg tracking-widest">Connected</div>
                {EXCHANGES.filter(e => connectedExchanges.includes(e.id)).map(ex => (
                  <button
                    key={ex.id}
                    onClick={() => { setSelectedExchange(ex.id); setIsOpen(false); }}
                    className={`w-full text-left px-2 py-1.5 text-xs rounded-md flex items-center justify-between \${selectedExchange === ex.id ? 'bg-primary/10 text-primary font-bold' : 'text-foreground hover:bg-muted'}`}
                  >
                    <span>{ex.name} <span className="text-[9px] text-muted-fg ml-1 uppercase">{ex.type}</span></span>
                    {selectedExchange === ex.id && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
                <div className="px-2 pt-3 pb-1 text-[10px] font-black uppercase text-muted-fg tracking-widest border-t border-border mt-1">Available</div>
              </>
            )}
            
            {filteredExchanges.filter(e => search !== "" || !connectedExchanges.includes(e.id)).map(ex => (
              <button
                key={ex.id}
                onClick={() => { setSelectedExchange(ex.id); setIsOpen(false); }}
                className={`w-full text-left px-2 py-1.5 text-xs rounded-md flex items-center justify-between \${selectedExchange === ex.id ? 'bg-primary/10 text-primary font-bold' : 'text-foreground/70 hover:text-foreground hover:bg-muted'}`}
              >
                <span>{ex.name} <span className="text-[9px] text-muted-fg ml-1 uppercase">{ex.type}</span></span>
                {selectedExchange === ex.id && <Check className="w-3.5 h-3.5" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
