"use client";

import { useRef, useEffect } from "react";

type Device = {
  deviceId: string;
  displayName: string;
};

export function IncomingAudioHandler({
  incomingStreams,
  isRemoteMuted,
}: {
  incomingStreams: Map<string, MediaStream>;
  isRemoteMuted: boolean;
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

  // This component doesn't render anything, it just manages audio elements
  return null;
}

