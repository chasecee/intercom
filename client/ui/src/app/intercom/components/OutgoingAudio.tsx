"use client";

import { Waveform } from "./Waveform";

export function OutgoingAudio({
  stream,
  isPttPressed,
  isLocked,
  onPttDown,
  onPttUp,
  onPttClick,
  onToggleLock,
}: {
  stream: MediaStream | null;
  isPttPressed: boolean;
  isLocked: boolean;
  onPttDown: () => void;
  onPttUp: () => void;
  onPttClick: () => void;
  onToggleLock: () => void;
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
      <div className="flex gap-2">
        <button
          onClick={isLocked ? onPttClick : undefined}
          onMouseDown={!isLocked ? onPttDown : undefined}
          onMouseUp={!isLocked ? onPttUp : undefined}
          onTouchStart={(e) => {
            e.preventDefault();
            if (isLocked) {
              onPttClick();
            } else {
              onPttDown();
            }
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            if (!isLocked) {
              onPttUp();
            }
          }}
          className={`flex-1 rounded-lg px-6 py-4 font-medium transition-all select-none ${
            isPttPressed
              ? "bg-green-600 text-white shadow-lg shadow-green-600/50"
              : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          }`}
        >
          {isPttPressed ? "Transmitting..." : "Push to Talk (Space)"}
        </button>
        <button
          onClick={onToggleLock}
          className={`rounded-lg px-4 py-4 font-medium transition-colors ${
            isLocked
              ? "bg-amber-600/20 text-amber-400 hover:bg-amber-600/30"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          }`}
          title={isLocked ? "Unlock (toggle mode)" : "Lock (toggle mode)"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            {isLocked ? (
              <>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </>
            ) : (
              <>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 9.33-2.5" />
              </>
            )}
          </svg>
        </button>
      </div>
    </div>
  );
}

