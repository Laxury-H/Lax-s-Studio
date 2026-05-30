import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Send, Mail, HelpCircle } from "lucide-react";

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SupportModal({ isOpen, onClose }: SupportModalProps) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Construct the mailto link
    const targetEmail = "laxworkspace@gmail.com";
    const mailtoUrl = `mailto:${targetEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    
    // Simulate slight loading to feel like a real action
    setTimeout(() => {
      window.open(mailtoUrl, "_blank");
      setIsSubmitting(false);
      onClose();
      // Reset form
      setSubject("");
      setMessage("");
    }, 600);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" id="support-modal-overlay">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={onClose}
          />
          
          {/* Modal Content */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative bg-card w-full max-w-md overflow-hidden border border-border rounded-2xl flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.5)] ring-1 ring-border/50" 
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-border flex items-start justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none transform translate-x-1/2 -translate-y-1/2" />
              
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shrink-0 shadow-inner">
                  <HelpCircle className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="font-sans font-black text-xl uppercase tracking-tighter text-foreground leading-none">
                    Support Form
                  </h2>
                  <p className="text-foreground/60 text-[10px] font-bold uppercase tracking-widest mt-1.5">
                    Contact laxworkspace@gmail.com
                  </p>
                </div>
              </div>
              
              <button 
                onClick={onClose}
                className="p-2 hover:bg-muted text-foreground/50 hover:text-foreground rounded-xl transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-foreground/60 tracking-wider">Subject Title</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="w-4 h-4 text-foreground/40" />
                  </div>
                  <input 
                    type="text" 
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-background border border-border text-foreground text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-foreground/30 font-semibold"
                    placeholder="E.g., Feedback, Bug Report, Question"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-foreground/60 tracking-wider">Your Message</label>
                <textarea 
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-background border border-border text-foreground text-sm rounded-xl px-4 py-3 h-32 resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-foreground/30 font-semibold"
                  placeholder="Describe your issue or provide feedback here..."
                />
              </div>

              <button 
                type="submit"
                disabled={isSubmitting || !subject || !message}
                className="w-full bg-foreground text-background hover:bg-primary hover:text-primary-fg disabled:opacity-50 border border-transparent font-black uppercase text-xs tracking-wider py-4 rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 group mt-2"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                    Opening Mail Client...
                  </span>
                ) : (
                  <>
                    <Send className="w-4 h-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                    Send Message to Lax
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
