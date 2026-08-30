import { useState, useEffect } from "react";
import { Folder, ArrowLeft, Check, X } from "lucide-react";
import { readDir } from "@tauri-apps/plugin-fs";
import { audioDir, dirname } from "@tauri-apps/api/path";

interface AndroidFolderBrowserProps {
  title: string;
  onSelect: (path: string) => void;
  onCancel: () => void;
}

export default function AndroidFolderBrowser({ title, onSelect, onCancel }: AndroidFolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string>("");
  const [folders, setFolders] = useState<{ name: string; path: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Initialize with public storage root
  useEffect(() => {
    async function init() {
      try {
        const aud = await audioDir(); // e.g. /storage/emulated/0/Music
        const root = await dirname(aud); // e.g. /storage/emulated/0
        setCurrentPath(root);
      } catch (err) {
        console.error("Failed to get audio dir", err);
        setCurrentPath("/storage/emulated/0");
      }
    }
    init();
  }, []);

  // Load directories when path changes
  useEffect(() => {
    if (!currentPath) return;
    async function load() {
      setLoading(true);
      try {
        const entries = await readDir(currentPath);
        const dirs = entries
          .filter((e) => e.isDirectory)
          .map((e) => ({ name: e.name || "Unknown", path: currentPath + "/" + e.name }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setFolders(dirs);
      } catch (err) {
        console.error("Failed to read dir", err);
        // If permission denied, keep the list empty
        setFolders([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [currentPath]);

  const handleGoBack = async () => {
    try {
      if (currentPath === "/" || currentPath === "/storage/emulated/0") return;
      const parent = await dirname(currentPath);
      setCurrentPath(parent);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#1a1a1a] text-white">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#282828] p-4 pt-safe-top">
        <div className="flex items-center gap-3">
          <button onClick={handleGoBack} className="p-2 transition hover:bg-white/10 rounded-full">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="text-xs text-spotify-lightgray truncate max-w-[200px] sm:max-w-xs">{currentPath}</p>
          </div>
        </div>
        <button onClick={onCancel} className="p-2 transition hover:bg-white/10 rounded-full text-spotify-lightgray hover:text-white">
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Directory List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <p className="text-center text-spotify-lightgray py-10">Loading...</p>
        ) : folders.length === 0 ? (
          <p className="text-center text-spotify-lightgray py-10">Empty directory</p>
        ) : (
          folders.map((f) => (
            <button
              key={f.path}
              onClick={() => setCurrentPath(f.path)}
              className="flex w-full items-center gap-4 rounded-lg bg-white/5 p-3 text-left transition hover:bg-white/10 active:bg-white/20"
            >
              <Folder className="h-6 w-6 text-spotify-green shrink-0" />
              <span className="truncate flex-1 font-medium text-white">{f.name}</span>
            </button>
          ))
        )}
      </div>

      {/* Footer / Confirm */}
      <div className="shrink-0 border-t border-white/10 bg-[#282828] p-4 pb-safe-bottom">
        <button
          onClick={() => onSelect(currentPath)}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-spotify-green py-3.5 font-bold text-black transition hover:scale-[1.02] active:scale-95"
        >
          <Check className="h-5 w-5" />
          Select This Folder
        </button>
      </div>
    </div>
  );
}
