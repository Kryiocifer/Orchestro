import { X, Sparkles, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/utils";

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  body: string;
}

const parseInline = (text: string) => {
  return text
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="italic text-white/90">$1</em>')
    .replace(/`([^`]+)`/g, '<code class="bg-white/10 rounded-[4px] px-1.5 py-0.5 font-mono text-[12px] text-white/90 ring-1 ring-white/10">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-spotify-green hover:underline">$1</a>');
};

export default function ChangelogModal({ isOpen, onClose, title, body }: ChangelogModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
    } else {
      const t = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!isOpen && !mounted) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[350] flex items-center justify-center p-4 sm:p-6",
        "bg-black/60 backdrop-blur-md transition-opacity duration-300",
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "relative w-full max-w-2xl overflow-hidden rounded-[24px] bg-[#0a0a0a] shadow-[0_0_80px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.05] flex flex-col max-h-[85vh]",
          "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isOpen ? "scale-100 translate-y-0 opacity-100" : "scale-[0.97] translate-y-4 opacity-0"
        )}
      >
        {/* Ambient Glows */}
        <div className="absolute -top-[20%] -left-[10%] w-[70%] h-[50%] bg-[radial-gradient(ellipse_at_center,rgba(29,185,84,0.15),transparent_70%)] pointer-events-none blur-3xl" />
        <div className="absolute top-[0%] right-[0%] w-[50%] h-[40%] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.05),transparent_70%)] pointer-events-none blur-2xl" />

        <div className="relative z-10 flex flex-col items-center text-center px-10 pt-12 pb-8 border-b border-white/[0.02]">
          <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-white/[0.03] text-spotify-green ring-1 ring-white/[0.08] mb-5 shadow-xl backdrop-blur-xl">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="text-[28px] font-extrabold tracking-tight text-white mb-3">
            What's New in Orchestro
          </h2>
          <span className="inline-flex items-center rounded-full bg-white/[0.06] px-3.5 py-1 text-[11px] font-bold uppercase tracking-widest text-white/60 ring-1 ring-white/[0.05]">
            {title}
          </span>

          <button
            onClick={onClose}
            className="absolute top-6 right-6 flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.03] text-white/40 transition hover:bg-white/[0.08] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative z-10 flex-1 overflow-y-auto px-10 py-8 sidebar-scroll">
          <div className="max-w-xl mx-auto space-y-5 text-[15px] leading-[1.6] text-white/60">
            {body.split('\n').map((line, i) => {
              const trimmed = line.trim();
              
              // Headings
              if (trimmed.startsWith('#')) {
                const level = trimmed.match(/^#+/)?.[0].length || 1;
                const text = trimmed.replace(/^#+\s*/, '');
                if (level <= 2) {
                  return (
                    <h3 key={i} className="text-lg font-bold text-white mt-8 mb-4 tracking-tight">
                      {text}
                    </h3>
                  );
                }
                return (
                  <h4 key={i} className="text-base font-semibold text-white/90 mt-6 mb-3">
                    {text}
                  </h4>
                );
              }

              // List items
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                const content = trimmed.replace(/^[-*]\s*/, '');
                return (
                  <div key={i} className="flex items-start gap-3 mt-2 group">
                    <div className="mt-[7px] flex h-1.5 w-1.5 shrink-0 rounded-full bg-spotify-green/50 transition-colors group-hover:bg-spotify-green" />
                    <span 
                      className="text-white/70"
                      dangerouslySetInnerHTML={{ __html: parseInline(content) }}
                    />
                  </div>
                );
              }

              // Empty lines
              if (trimmed === '') return <div key={i} className="h-2" />;

              // Blockquotes
              if (trimmed.startsWith('>')) {
                return (
                  <blockquote key={i} className="border-l-2 border-spotify-green/30 pl-4 py-1 my-4 italic text-white/50">
                    <span dangerouslySetInnerHTML={{ __html: parseInline(trimmed.replace(/^>\s*/, '')) }} />
                  </blockquote>
                );
              }

              // Normal paragraph
              return (
                <p 
                  key={i} 
                  className="mt-2 text-white/70"
                  dangerouslySetInnerHTML={{ __html: parseInline(line) }} 
                />
              );
            })}
          </div>
        </div>
        
        <div className="relative z-10 p-6 bg-[#0a0a0a]/80 backdrop-blur-xl border-t border-white/[0.04] flex justify-center">
          <button
            onClick={onClose}
            className="flex items-center gap-2 rounded-full bg-white px-8 py-3 text-sm font-bold text-black transition-transform hover:scale-105 active:scale-95"
          >
            Continue
            <ChevronRight className="h-4 w-4 opacity-50" />
          </button>
        </div>
      </div>
    </div>
  );
}
