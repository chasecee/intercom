"use client";

export function ConnectionInfo({
  mediaGranted,
  signalingUrl,
  iceState,
}: {
  mediaGranted: boolean;
  signalingUrl: string;
  iceState: string;
}) {
  return (
    <section className="grid gap-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-300">Microphone</div>
        <div
          className={`rounded-full px-3 py-1 text-xs ${
            mediaGranted
              ? "bg-emerald-600/20 text-emerald-200"
              : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {mediaGranted ? "granted" : "pending"}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-300">Signaling</div>
        <div className="text-xs text-zinc-400">{signalingUrl}</div>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-300">ICE state</div>
        <div className="text-xs text-zinc-400">{iceState}</div>
      </div>
    </section>
  );
}

