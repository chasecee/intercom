"use client";

import { OutgoingAudio } from "./OutgoingAudio";

export function AudioControls({
  localStream,
  isPttPressed,
  isLocked,
  onPttDown,
  onPttUp,
  onPttClick,
  onToggleLock,
}: {
  localStream: MediaStream | null;
  isPttPressed: boolean;
  isLocked: boolean;
  onPttDown: () => void;
  onPttUp: () => void;
  onPttClick: () => void;
  onToggleLock: () => void;
}) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
      <OutgoingAudio
        stream={localStream}
        isPttPressed={isPttPressed}
        isLocked={isLocked}
        onPttDown={onPttDown}
        onPttUp={onPttUp}
        onPttClick={onPttClick}
        onToggleLock={onToggleLock}
      />
    </section>
  );
}

