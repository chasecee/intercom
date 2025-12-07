"use client";

import { OutgoingAudio } from "./OutgoingAudio";

export function AudioControls({
  localStream,
  isPttPressed,
  onPttDown,
  onPttUp,
}: {
  localStream: MediaStream | null;
  isPttPressed: boolean;
  onPttDown: () => void;
  onPttUp: () => void;
}) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
      <OutgoingAudio
        stream={localStream}
        isPttPressed={isPttPressed}
        onPttDown={onPttDown}
        onPttUp={onPttUp}
      />
    </section>
  );
}

