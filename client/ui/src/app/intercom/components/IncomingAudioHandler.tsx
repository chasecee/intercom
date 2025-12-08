"use client";

import { useRef, useEffect } from "react";

export function IncomingAudioHandler({
  incomingStreams,
  isRemoteMuted,
}: {
  incomingStreams: Map<string, MediaStream>;
  isRemoteMuted: boolean;
}) {
  const audioRefsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    const audioRefs = audioRefsRef.current;
    const currentDeviceIds = new Set(incomingStreams.keys());

    incomingStreams.forEach((stream, deviceId) => {
      let audioElement = audioRefs.get(deviceId);
      if (!audioElement) {
        audioElement = document.createElement("audio");
        audioElement.autoplay = true;
        audioElement.preload = "none";
        audioElement.setAttribute("playsinline", "true");
        audioElement.setAttribute("webkit-playsinline", "true");
        audioRefs.set(deviceId, audioElement);
      }
      audioElement.srcObject = stream;
      audioElement.muted = isRemoteMuted;
      audioElement.play().catch((err) => {
        console.error(`Failed to play audio for device ${deviceId}:`, err);
      });
    });

    audioRefs.forEach((audio, deviceId) => {
      if (!currentDeviceIds.has(deviceId)) {
        audio.pause();
        audio.srcObject = null;
        audioRefs.delete(deviceId);
      }
    });

    return () => {
      audioRefs.forEach((audio) => {
        audio.pause();
        audio.srcObject = null;
      });
      audioRefs.clear();
    };
  }, [incomingStreams, isRemoteMuted]);

  // This component doesn't render anything, it just manages audio elements
  return null;
}
