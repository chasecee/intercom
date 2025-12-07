"use client";

import { useRef, useEffect } from "react";
import { Waveform } from "./Waveform";

export function IncomingAudio({
  stream,
  isMuted,
  onToggleMute,
}: {
  stream: MediaStream | null;
  isMuted: boolean;
  onToggleMute: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!stream || !audioRef.current) return;

    const audio = audioRef.current;
    audio.srcObject = stream;
    audio.playbackRate = 1.0;
    audio.muted = isMuted;
    if ("setSinkId" in audio && typeof audio.setSinkId === "function") {
      audio.setSinkId("").catch(() => {});
    }
  }, [stream, isMuted]);

  return (
    <div className="space-y-4 border-t border-zinc-800 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Incoming Audio</h2>
        <button
          onClick={onToggleMute}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            isMuted
              ? "bg-red-600/20 text-red-400 hover:bg-red-600/30"
              : "bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30"
          }`}
        >
          {isMuted ? "Unmute" : "Mute"}
        </button>
      </div>
      {stream && <Waveform stream={stream} height={80} />}
      <audio
        ref={audioRef}
        autoPlay
        playsInline
        className="hidden"
        preload="none"
      />
    </div>
  );
}

