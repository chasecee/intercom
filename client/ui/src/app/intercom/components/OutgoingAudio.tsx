"use client";

import { Waveform } from "./Waveform";

export function OutgoingAudio({
  stream,
  isPttPressed,
  onPttDown,
  onPttUp,
}: {
  stream: MediaStream | null;
  isPttPressed: boolean;
  onPttDown: () => void;
  onPttUp: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Outgoing Audio</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">
            {isPttPressed ? "Transmitting" : "Muted"}
          </span>
          <div
            className={`h-2 w-2 rounded-full ${
              isPttPressed ? "bg-green-500 animate-pulse" : "bg-zinc-600"
            }`}
          />
        </div>
      </div>
      {stream && <Waveform stream={stream} height={80} />}
      <button
        onMouseDown={onPttDown}
        onMouseUp={onPttUp}
        onTouchStart={(e) => {
          e.preventDefault();
          onPttDown();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          onPttUp();
        }}
        className={`w-full rounded-lg px-6 py-4 font-medium transition-all ${
          isPttPressed
            ? "bg-green-600 text-white shadow-lg shadow-green-600/50"
            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
        }`}
      >
        {isPttPressed ? "Transmitting..." : "Push to Talk (Space)"}
      </button>
    </div>
  );
}

