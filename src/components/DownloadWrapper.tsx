import { useState } from "react";
import YouTubeView from "./YouTubeView";
import ImportView from "./ImportView";
import { DownloadJob } from "./DownloadPanel";
import { cn } from "../lib/utils";

interface DownloadWrapperProps {
  downloadFolder: string | null | undefined;
  onPickDownloadFolder: () => void;
  jobs: DownloadJob[];
  setJobs: React.Dispatch<React.SetStateAction<DownloadJob[]>>;
  onYtDownloaded: (videoPath: string, coverPath?: string) => Promise<void>;
  spotifyClientId?: string | null;
  onSaveSpotifyClientId?: (id: string) => Promise<void>;
}

type Tab = "youtube" | "spotify";

export default function DownloadWrapper(props: DownloadWrapperProps) {
  const [activeTab, setActiveTab] = useState<Tab>("youtube");

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gradient-to-b from-[#1a1a1a] to-spotify-black safe-pt">
      <div className="flex shrink-0 items-center justify-center border-b border-white/10 p-4">
        <div className="flex rounded-full bg-white/10 p-1">
          <button
            onClick={() => setActiveTab("youtube")}
            className={cn(
              "rounded-full px-6 py-2 text-sm font-semibold transition-all",
              activeTab === "youtube"
                ? "bg-white text-black shadow"
                : "text-spotify-lightgray hover:text-white"
            )}
          >
            YouTube
          </button>
          <button
            onClick={() => setActiveTab("spotify")}
            className={cn(
              "rounded-full px-6 py-2 text-sm font-semibold transition-all",
              activeTab === "spotify"
                ? "bg-white text-black shadow"
                : "text-spotify-lightgray hover:text-white"
            )}
          >
            Spotify / Import
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-hidden">
        {activeTab === "youtube" ? (
          <YouTubeView
            downloadFolder={props.downloadFolder}
            onPickDownloadFolder={props.onPickDownloadFolder}
            onDownloaded={props.onYtDownloaded}
            jobs={props.jobs}
            setJobs={props.setJobs}
          />
        ) : (
          <ImportView
            downloadFolder={props.downloadFolder}
            onPickDownloadFolder={props.onPickDownloadFolder}
            jobs={props.jobs}
            setJobs={props.setJobs}
            spotifyClientId={props.spotifyClientId}
            onSaveSpotifyClientId={props.onSaveSpotifyClientId}
          />
        )}
      </div>
    </div>
  );
}
