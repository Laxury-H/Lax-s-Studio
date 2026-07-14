import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, Key, ShieldCheck, Check } from "lucide-react";

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function ApiSettingsModal({ isOpen, onClose, onSaved }: ApiSettingsModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [useTestnet, setUseTestnet] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey || !apiSecret) {
      setError("Please fill in both API Key and Secret");
      return;
    }

    setLoading(true);
    setError("");
    
    try {
      const res = await fetch("/api/settings/binance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, apiSecret, useTestnet })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onSaved();
      }, 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#111111] border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-border bg-[#151515]">
          <h2 className="text-lg font-black uppercase text-foreground flex items-center gap-2">
            <Key className="w-5 h-5 text-[#FFD600]" />
            Binance API Settings
          </h2>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted text-muted-fg hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div className="bg-success/10 border border-success/20 rounded-xl p-3 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
            <p className="text-xs text-muted-fg leading-relaxed">
              Your API keys are encrypted locally before being saved to the secure SQLite database. 
              We never share your keys with third parties.
            </p>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-lg font-semibold">
              {error}
            </div>
          )}
          
          {success && (
            <div className="bg-success/10 border border-success/20 text-success text-sm p-3 rounded-lg font-semibold flex items-center gap-2">
              <Check className="w-4 h-4" />
              Settings saved successfully!
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-muted-fg uppercase mb-1.5">Environment</label>
              <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setUseTestnet(true)}
                  className={`flex-1 text-xs font-bold uppercase py-2 rounded-md transition-all ${
                    useTestnet ? "bg-[#FFD600] text-black shadow-sm" : "text-muted-fg hover:text-foreground"
                  }`}
                >
                  Testnet (Demo)
                </button>
                <button
                  type="button"
                  onClick={() => setUseTestnet(false)}
                  className={`flex-1 text-xs font-bold uppercase py-2 rounded-md transition-all ${
                    !useTestnet ? "bg-[#FFD600] text-black shadow-sm" : "text-muted-fg hover:text-foreground"
                  }`}
                >
                  Mainnet (Live)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-fg uppercase mb-1.5">API Key</label>
              <input 
                type="text" 
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-[#FFD600] focus:ring-1 focus:ring-[#FFD600] transition-all placeholder:text-muted-fg/50"
                placeholder="Paste your Binance API Key here"
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-muted-fg uppercase mb-1.5">Secret Key</label>
              <input 
                type="password" 
                value={apiSecret}
                onChange={e => setApiSecret(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-[#FFD600] focus:ring-1 focus:ring-[#FFD600] transition-all placeholder:text-muted-fg/50"
                placeholder="Paste your Binance Secret Key here"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-border flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-bold text-muted-fg hover:text-foreground hover:bg-muted transition-colors"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={loading || success}
              className="px-6 py-2 rounded-lg bg-[#FFD600] text-black text-sm font-black uppercase hover:bg-[#FFD600]/90 transition-colors disabled:opacity-50"
            >
              {loading ? "SAVING..." : "SAVE KEYS"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
