import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/utils";

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  body: string;
}

function parseInline(text: string): React.ReactNode[] {
  // Simple tokenizer for bold, code, and links.
  const parts: React.ReactNode[] = [];
  let current = text;
  let key = 0;

  while (current) {
    const boldMatch = current.match(/\*\*(.+?)\*\*/);
    const codeMatch = current.match(/`(.+?)`/);
    const linkMatch = current.match(/\[([^\]]+)\]\(([^)]+)\)/);

    let match: RegExpMatchArray | null = null;
    let type = "";
    if (boldMatch && (!match || boldMatch.index! < match.index!)) {
      match = boldMatch; type = "bold";
    }
    if (codeMatch && (!match || codeMatch.index! < match.index!)) {
      match = codeMatch; type = "code";
    }
    if (linkMatch && (!match || linkMatch.index! < match.index!)) {
      match = linkMatch; type = "link";
    }

    if (!match) {
      parts.push(<span key={key++}>{current}</span>);
      break;
    }

    if (match.index! > 0) {
      parts.push(<span key={key++}>{current.slice(0, match.index!)}</span>);
    }

    if (type === "bold") {
      parts.push(<strong key={key++} className="font-bold text-white">{match[1]}</strong>);
    } else if (type === "code") {
      parts.push(<code key={key++} className="bg-white/10 text-spotify-lightgray px-1 py-0.5 rounded text-xs font-mono">{match[1]}</code>);
    } else if (type === "link") {
      parts.push(
        <a key={key++} href={match[2]} target="_blank" rel="noreferrer" className="text-spotify-green hover:underline">
          {match[1]}
        </a>
      );
    }

    current = current.slice(match.index! + match[0].length);
  }
  return parts;
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

    // Headers
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const content = parseInline(headerMatch[2]);
      if (level === 1 || level === 2) {
        elements.push(<h2 key={i} className="mt-5 mb-2 text-sm font-bold text-white">{content}</h2>);
      } else {
        elements.push(<h3 key={i} className="mt-4 mb-2 text-xs font-semibold uppercase tracking-widest text-spotify-lightgray/70">{content}</h3>);
      }
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      elements.push(
        <blockquote key={i} className="border-l-2 border-white/20 pl-3 italic text-spotify-lightgray/80 my-2">
          {parseInline(trimmed.slice(2))}
        </blockquote>
      );
      i++;
      continue;
    }

    // Bullet list
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const items: React.ReactNode[][] = [];
      while (
        i < lines.length &&
        (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))
      ) {
        items.push(parseInline(lines[i].trim().slice(2)));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="mt-1 mb-3 space-y-1.5">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-sm text-spotify-lightgray">
              <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-spotify-lightgray/40" />
              <span className="flex-1">{item}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Paragraph
    elements.push(
      <p key={i} className="mt-1 mb-2 text-sm leading-relaxed text-spotify-lightgray">
        {parseInline(trimmed)}
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
