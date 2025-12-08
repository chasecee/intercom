import { useState, useCallback, useEffect, useRef } from "react";
import type { Device } from "../utils";

export function usePTT(
  devices: Device[],
  currentDeviceId: string | null,
  selectedTargets: string[],
  ensureConnection: ((targetDeviceId: string) => Promise<RTCPeerConnection | undefined>) | null,
  audioTrack: MediaStreamTrack | null
) {
  const [isPttPressed, setIsPttPressed] = useState(false);
  const [isPttLocked, setIsPttLocked] = useState(false);
  const audioTrackRef = useRef(audioTrack);
  
  useEffect(() => {
    audioTrackRef.current = audioTrack;
  }, [audioTrack]);

  const resolveTargetDeviceIds = useCallback((): string[] => {
    if (selectedTargets.length === 1 && selectedTargets[0] === "ALL") {
      return devices
        .map((d) => d.deviceId)
        .filter((id) => id !== currentDeviceId);
    }
    return selectedTargets.filter((id) => id !== currentDeviceId);
  }, [selectedTargets, devices, currentDeviceId]);

  const handlePttDown = useCallback(async () => {
    setIsPttPressed(true);
    if (audioTrackRef.current) {
      audioTrackRef.current.enabled = true;
    }

    const targetIds = resolveTargetDeviceIds();
    if (ensureConnection) {
      for (const targetId of targetIds) {
        try {
          await ensureConnection(targetId);
        } catch (err) {
          console.error(`Failed to establish connection to ${targetId}:`, err);
        }
      }
    }
  }, [resolveTargetDeviceIds, ensureConnection]);

  const handlePttUp = useCallback(() => {
    if (!isPttLocked) {
      setIsPttPressed(false);
      if (audioTrackRef.current) {
        audioTrackRef.current.enabled = false;
      }
    }
  }, [isPttLocked]);

  const handlePttToggle = useCallback(async () => {
    if (isPttPressed) {
      setIsPttPressed(false);
      if (audioTrackRef.current) {
        audioTrackRef.current.enabled = false;
      }
    } else {
      setIsPttPressed(true);
      if (audioTrackRef.current) {
        audioTrackRef.current.enabled = true;
      }
      const targetIds = resolveTargetDeviceIds();
      if (ensureConnection) {
        for (const targetId of targetIds) {
          try {
            await ensureConnection(targetId);
          } catch (err) {
            console.error(`Failed to establish connection to ${targetId}:`, err);
          }
        }
      }
    }
  }, [isPttPressed, resolveTargetDeviceIds, ensureConnection]);

  const togglePttLock = () => {
    setIsPttLocked((prev) => {
      const newLocked = !prev;
      if (!newLocked && isPttPressed) {
        setIsPttPressed(false);
        if (audioTrackRef.current) {
          audioTrackRef.current.enabled = false;
        }
      }
      return newLocked;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (isPttLocked) {
          handlePttToggle();
        } else if (!isPttPressed) {
          handlePttDown();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isPttLocked && isPttPressed) {
        e.preventDefault();
        handlePttUp();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isPttPressed, isPttLocked, handlePttDown, handlePttToggle, handlePttUp]);

  return {
    isPttPressed,
    isPttLocked,
    handlePttDown,
    handlePttUp,
    handlePttToggle,
    togglePttLock,
  };
}

