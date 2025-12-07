"use client";

import { OutgoingAudio } from "./OutgoingAudio";
import { IncomingAudio } from "./IncomingAudio";

export function AudioControls({
  localStream,
  remoteStream,
  isPttPressed,
  isRemoteMuted,
  onPttDown,
  onPttUp,
  onToggleRemoteMute,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isPttPressed: boolean;
  isRemoteMuted: boolean;
  onPttDown: () => void;
  onPttUp: () => void;
  onToggleRemoteMute: () => void;
}) {
  return (
    <section className="grid gap-6 rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
      <OutgoingAudio
        stream={localStream}
        isPttPressed={isPttPressed}
        onPttDown={onPttDown}
        onPttUp={onPttUp}
      />
      <IncomingAudio
        stream={remoteStream}
        isMuted={isRemoteMuted}
        onToggleMute={onToggleRemoteMute}
      />
    </section>
  );
}

