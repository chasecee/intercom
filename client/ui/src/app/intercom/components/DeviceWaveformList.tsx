"use client";

import { Waveform } from "./Waveform";
import { useRef, useEffect } from "react";

type Device = {
  deviceId: string;
  displayName: string;
};

export function DeviceWaveformList({
  devices,
  incomingStreams,
  isRemoteMuted,
  onToggleRemoteMute,
}: {
  devices: Device[];
  incomingStreams: Map<string, MediaStream>;
  isRemoteMuted: boolean;
  onToggleRemoteMute: () => void;
}) {
  const audioRefsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    const currentDeviceIds = new Set(incomingStreams.keys());
    
    incomingStreams.forEach((stream, deviceId) => {
      let audioElement = audioRefsRef.current.get(deviceId);
      if (!audioElement) {
        audioElement = document.createElement("audio");
        audioElement.autoplay = true;
        audioElement.preload = "none";
        audioRefsRef.current.set(deviceId, audioElement);
      }
      audioElement.srcObject = stream;
      audioElement.muted = isRemoteMuted;
      audioElement.play().catch(() => {});
    });

    audioRefsRef.current.forEach((audio, deviceId) => {
      if (!currentDeviceIds.has(deviceId)) {
        audio.pause();
        audio.srcObject = null;
        audioRefsRef.current.delete(deviceId);
      }
    });

    return () => {
      audioRefsRef.current.forEach((audio) => {
        audio.pause();
        audio.srcObject = null;
      });
      audioRefsRef.current.clear();
    };
  }, [incomingStreams, isRemoteMuted]);

  const entries = Array.from(incomingStreams.entries());
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 border-t border-zinc-800 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Incoming Audio</h2>
        <button
          onClick={onToggleRemoteMute}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            isRemoteMuted
              ? "bg-red-600/20 text-red-400 hover:bg-red-600/30"
              : "bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30"
          }`}
        >
          {isRemoteMuted ? "Unmute" : "Mute"}
        </button>
      </div>
      <div className="space-y-4">
        {entries.map(([deviceId, stream]) => {
          const device = devices.find((d) => d.deviceId === deviceId);
          const displayName = device?.displayName || deviceId;
          return (
            <div key={deviceId} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{displayName}</span>
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              </div>
              <Waveform stream={stream} height={60} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

