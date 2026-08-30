import { Library, Download, Settings } from "lucide-react";
import { View } from "../lib/types";
import { cn } from "../lib/utils";

interface BottomNavProps {
  currentView: View;
  setCurrentView: (view: View) => void;
}

export default function BottomNav({ currentView, setCurrentView }: BottomNavProps) {
  // Map currentView to a generic "tab" for highlighting
  const getTab = () => {
    if (currentView === "home" || currentView === "library" || currentView === "playlist") return "library";
    if (currentView === "youtube" || currentView === "import") return "download";
    if (currentView === "settings") return "settings";
    return "library"; // default
  };

  const activeTab = getTab();

  return (
    <div className="flex md:hidden shrink-0 items-center justify-around border-t border-white/10 bg-spotify-darker px-4 safe-pb pt-2 pb-2">
      <button
        onClick={() => setCurrentView("library")}
        className={cn(
          "flex flex-col items-center justify-center gap-1 p-2 transition-colors",
          activeTab === "library" ? "text-white" : "text-spotify-lightgray hover:text-white"
        )}
      >
        <Library className={cn("h-6 w-6", activeTab === "library" && "text-white")} />
        <span className="text-[10px] font-medium">Library</span>
      </button>

      <button
        onClick={() => setCurrentView("youtube")}
        className={cn(
          "flex flex-col items-center justify-center gap-1 p-2 transition-colors",
          activeTab === "download" ? "text-white" : "text-spotify-lightgray hover:text-white"
        )}
      >
        <Download className={cn("h-6 w-6", activeTab === "download" && "text-white")} />
        <span className="text-[10px] font-medium">Download</span>
      </button>

      <button
        onClick={() => setCurrentView("settings")}
        className={cn(
          "flex flex-col items-center justify-center gap-1 p-2 transition-colors",
          activeTab === "settings" ? "text-white" : "text-spotify-lightgray hover:text-white"
        )}
      >
        <Settings className={cn("h-6 w-6", activeTab === "settings" && "text-white")} />
        <span className="text-[10px] font-medium">Settings</span>
      </button>
    </div>
  );
}
