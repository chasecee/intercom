"use client";

import { useState } from "react";
import { DeviceNameModal } from "./components/DeviceNameModal";
import { DeviceToolbar } from "./components/DeviceToolbar";
import { IncomingAudioHandler } from "./components/IncomingAudioHandler";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useDeviceName } from "./hooks/useDeviceName";
import { useWebRTC } from "./hooks/useWebRTC";
import { usePTT } from "./hooks/usePTT";
import { useWakeLock } from "./hooks/useWakeLock";

export default function IntercomPage() {
  const [isRemoteMuted, setIsRemoteMuted] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState<string[]>(["ALL"]);
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  const {
    deviceName,
    showDeviceNameModal,
    isHydrated,
    handleDeviceNameSave,
    updateDeviceName,
  } = useDeviceName();

  const {
    incomingStreams,
    localStream,
    devices,
    currentDeviceId,
    ensureConnection,
    audioTrack,
    socket,
    registerDevice,
  } = useWebRTC(deviceName);

  const handleDeviceNameSaveWithRegistration = (name: string) => {
    const sanitized = handleDeviceNameSave(name);
    if (sanitized) {
      try {
        registerDevice(sanitized);
      } catch (err) {
        console.error("Failed to register device:", err);
      }
    }
  };

  const {
    isPttPressed,
    isPttLocked,
    handlePttDown,
    handlePttUp,
    handlePttToggle,
    togglePttLock,
  } = usePTT(
    devices,
    currentDeviceId,
    selectedTargets,
    ensureConnection,
    audioTrack
  );

  const hasIncomingAudio = incomingStreams.size > 0;
  useWakeLock(isPttPressed, hasIncomingAudio);

  const toggleRemoteMute = () => {
    setIsRemoteMuted((prev) => !prev);
  };

  if (!isHydrated) {
    return (
      <ErrorBoundary>
        <div className="min-h-screen bg-black text-white">
          <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
            <div className="text-zinc-400">Loading...</div>
          </main>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 9999,
          background: "red",
          color: "white",
          padding: "10px",
          fontSize: "12px",
        }}
      >
        DEBUG: Hydrated={isHydrated ? "YES" : "NO"}, Devices={devices.length},
        DeviceName={deviceName || "null"}, Socket=
        {socket?.connected ? "CONNECTED" : "DISCONNECTED"}, CurrentDeviceId=
        {currentDeviceId || "null"}
      </div>
      <div className="h-screen overflow-hidden bg-black text-white">
        {showDeviceNameModal && (
          <DeviceNameModal onSave={handleDeviceNameSaveWithRegistration} />
        )}
        <IncomingAudioHandler
          incomingStreams={incomingStreams}
          isRemoteMuted={isRemoteMuted}
        />
        <DeviceToolbar
          devices={devices}
          currentDeviceId={currentDeviceId}
          currentDeviceName={deviceName}
          selectedTargets={selectedTargets}
          incomingStreams={incomingStreams}
          localStream={localStream}
          isPttPressed={isPttPressed}
          isPttLocked={isPttLocked}
          isRemoteMuted={isRemoteMuted}
          onSelectionChange={setSelectedTargets}
          onPttDown={handlePttDown}
          onPttUp={handlePttUp}
          onPttClick={handlePttToggle}
          onToggleLock={togglePttLock}
          onToggleRemoteMute={toggleRemoteMute}
          onDeviceNameChange={(name) => {
            const sanitized = updateDeviceName(name);
            if (sanitized && socket?.connected) {
              try {
                socket.emit("update-device-name", {
                  displayName: sanitized,
                });
              } catch (err) {
                console.error("Failed to emit device name update:", err);
              }
            }
          }}
          onExpandedChange={setIsToolbarExpanded}
        />
        <div
          className="fixed left-0 right-0 bottom-0 overflow-hidden bg-black"
          style={{ top: isToolbarExpanded ? "420px" : "80px", zIndex: 10 }}
        >
          {iframeError ? (
            <div className="flex h-full items-center justify-center text-zinc-400">
              <div className="text-center">
                <p className="mb-2">Unable to load Home Assistant dashboard</p>
                <p className="text-sm">
                  Ensure Home Assistant has{" "}
                  <code className="bg-zinc-800 px-1 rounded">
                    use_x_frame_options: false
                  </code>{" "}
                  in configuration.yaml
                </p>
              </div>
            </div>
          ) : (
            <iframe
              src={process.env.NEXT_PUBLIC_HOME_ASSISTANT_URL || ""}
              className="w-full h-full border-0"
              title="Home Assistant Tablet Dashboard"
              onLoad={() => {
                console.log("Home Assistant iframe loaded successfully");
                setIframeError(false);
              }}
              onError={() => {
                console.error("Home Assistant iframe error");
                setIframeError(true);
              }}
              style={{ display: "block", minHeight: "100%" }}
            />
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
