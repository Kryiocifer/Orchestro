import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/utils";

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  body: string;
}

function renderMarkdown(body: string) {
  const lines = body.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      i++;
      continue;
    }

    // h2
    if (trimmed.startsWith("## ")) {
      elements.push(
        <h3 key={i} className="mt-5 mb-2 text-xs font-semibold uppercase tracking-widest text-spotify-lightgray/50">
          {trimmed.slice(3)}
        </h3>
      );
      i++;
      continue;
    }

    // h1
    if (trimmed.startsWith("# ")) {
      elements.push(
        <h2 key={i} className="mt-5 mb-2 text-sm font-bold text-white">
          {trimmed.slice(2)}
        </h2>
      );
      i++;
      continue;
    }

    // bullet list — collect consecutive items
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const items: string[] = [];
      while (
        i < lines.length &&
        (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))
      ) {
        items.push(lines[i].trim().slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="mt-1 space-y-1.5">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-sm text-spotify-lightgray">
              <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-spotify-lightgray/40" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // paragraph
    elements.push(
      <p key={i} className="mt-1 text-sm leading-relaxed text-spotify-lightgray">
        {trimmed}
      </p>
    );
    i++;
  }

  return elements;
}

export default function ChangelogModal({ isOpen, onClose, title, body }: ChangelogModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
    } else {
      const t = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!isOpen && !mounted) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[350] flex items-center justify-center p-4",
        "bg-black/50 transition-opacity duration-150",
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "w-full max-w-lg overflow-hidden rounded-xl bg-[#181818] border border-white/5 shadow-2xl flex flex-col max-h-[80vh]",
          "transition-all duration-200",
          isOpen ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-white/5 px-6 py-5">
          <div>
            <h2 className="text-base font-bold text-white">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-spotify-lightgray transition hover:bg-white/10 hover:text-white mt-0.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto sidebar-scroll px-6 py-5">
          {renderMarkdown(body)}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end border-t border-white/5 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-full bg-white px-5 py-2 text-xs font-bold text-black transition hover:bg-white/90 active:scale-95"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
