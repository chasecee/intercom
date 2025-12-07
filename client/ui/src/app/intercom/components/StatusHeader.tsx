"use client";

import { useMemo } from "react";

type PeerStatus = "idle" | "connecting" | "live" | "error";

export function StatusHeader({
  status,
  detail,
  room,
  onToggleInfo,
}: {
  status: PeerStatus;
  detail: string | null;
  room: string;
  onToggleInfo: () => void;
}) {
  const statusColor = useMemo(() => {
    if (status === "live") return "bg-green-500";
    if (status === "error") return "bg-red-500";
    return "bg-amber-500";
  }, [status]);

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">
          Intercom
        </p>
        <h1 className="text-3xl font-semibold">Door audio link</h1>
        <p className="text-sm text-zinc-400">Room: {room}</p>
      </div>
      <button
        onClick={onToggleInfo}
        className="flex items-center gap-3 transition-opacity hover:opacity-80"
      >
        <span className={`h-3 w-3 rounded-full ${statusColor}`} />
        <div className="text-right">
          <p className="text-sm font-medium capitalize">{status}</p>
          {detail ? <p className="text-xs text-zinc-400">{detail}</p> : null}
        </div>
      </button>
    </div>
  );
}

