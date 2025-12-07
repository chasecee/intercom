"use client";

import { useState, useEffect } from "react";
import { DeviceTile } from "./DeviceTile";
import { DeviceWaveformList } from "./DeviceWaveformList";
import { Waveform } from "./Waveform";

type Device = {
  deviceId: string;
  displayName: string;
};

export function DeviceToolbar({
  devices,
  currentDeviceId,
  currentDeviceName,
  selectedTargets,
  incomingStreams,
  localStream,
  isPttPressed,
  isPttLocked,
  isRemoteMuted,
  onSelectionChange,
  onPttDown,
  onPttUp,
  onPttClick,
  onToggleLock,
  onToggleRemoteMute,
  onDeviceNameChange,
  onExpandedChange,
}: {
  devices: Device[];
  currentDeviceId: string | null;
  currentDeviceName: string | null;
  selectedTargets: string[];
  incomingStreams: Map<string, MediaStream>;
  localStream: MediaStream | null;
  isPttPressed: boolean;
  isPttLocked: boolean;
  isRemoteMuted: boolean;
  onSelectionChange: (targets: string[]) => void;
  onPttDown: () => void;
  onPttUp: () => void;
  onPttClick: () => void;
  onToggleLock: () => void;
  onToggleRemoteMute: () => void;
  onDeviceNameChange: (name: string) => void;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const [showExpanded, setShowExpanded] = useState(false);
  
  const handleExpandedToggle = () => {
    const newExpanded = !showExpanded;
    setShowExpanded(newExpanded);
    onExpandedChange?.(newExpanded);
  };
  const [isEditingDeviceName, setIsEditingDeviceName] = useState(false);
  const [editedDeviceName, setEditedDeviceName] = useState(currentDeviceName || "");
  const isAllSelected = selectedTargets.length === 1 && selectedTargets[0] === "ALL";

  useEffect(() => {
    setEditedDeviceName(currentDeviceName || "");
  }, [currentDeviceName]);

  const handleAllClick = () => {
    onSelectionChange(["ALL"]);
  };

  const handleDeviceToggle = (deviceId: string) => {
    if (isAllSelected) {
      onSelectionChange([deviceId]);
    } else {
      const index = selectedTargets.indexOf(deviceId);
      if (index === -1) {
        onSelectionChange([...selectedTargets, deviceId]);
      } else {
        const newTargets = selectedTargets.filter((id) => id !== deviceId);
        if (newTargets.length === 0) {
          onSelectionChange(["ALL"]);
        } else {
          onSelectionChange(newTargets);
        }
      }
    }
  };

  const currentDevice: Device | null = currentDeviceId
    ? {
        deviceId: currentDeviceId,
        displayName: currentDeviceName || currentDeviceId,
      }
    : null;

  const otherDevices = devices.filter((d) => d.deviceId !== currentDeviceId);

  const handleDeviceNameSave = () => {
    const trimmed = editedDeviceName.trim();
    if (trimmed && trimmed !== currentDeviceName) {
      onDeviceNameChange(trimmed);
    }
    setIsEditingDeviceName(false);
  };

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm">
        <div className="flex items-center gap-2 px-4 py-2">
          {currentDevice && (
            <div className="flex items-center gap-0 flex-1">
              <DeviceTile
                device={currentDevice}
                isCurrentDevice={true}
                isSelected={true}
                isTransmitting={isPttPressed}
                stream={localStream}
                onPttDown={onPttDown}
                onPttUp={onPttUp}
                onPttClick={onPttClick}
                isPttLocked={isPttLocked}
              />
              <button
                onClick={onToggleLock}
                className={`h-20 w-12 flex-shrink-0 rounded-r-lg border-2 border-l-0 transition-colors flex flex-col items-center justify-center gap-1 ${
                  isPttLocked
                    ? "border-amber-600 bg-amber-600/20 text-amber-400"
                    : "border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800/50"
                }`}
                title={isPttLocked ? "Unlock" : "Lock"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  {isPttLocked ? (
                    <>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </>
                  ) : (
                    <>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 9.33-2.5" />
                    </>
                  )}
                </svg>
                <span className="text-[9px] leading-tight">Lock and Talk</span>
              </button>
            </div>
          )}
          <button
            onClick={handleAllClick}
            className={`h-20 flex-1 rounded-lg border-2 px-3 text-xs font-medium transition-all ${
              isAllSelected
                ? "border-green-600 bg-green-600/20 text-green-400"
                : "border-zinc-700 bg-zinc-900/50 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800/50"
            }`}
          >
            All
          </button>
          {otherDevices.map((device) => {
            const isSelected =
              !isAllSelected && selectedTargets.includes(device.deviceId);
            const stream = incomingStreams.get(device.deviceId) || null;
            const isTransmitting = stream !== null;
            return (
              <DeviceTile
                key={device.deviceId}
                device={device}
                isCurrentDevice={false}
                isSelected={isSelected}
                isTransmitting={isTransmitting}
                stream={stream}
                onSelect={() => handleDeviceToggle(device.deviceId)}
              />
            );
          })}
          <button
            onClick={handleExpandedToggle}
            className={`h-20 w-20 flex-shrink-0 rounded-lg border-2 border-zinc-700 bg-zinc-900/50 p-2 transition-colors hover:border-zinc-600 hover:bg-zinc-800/50 ${
              showExpanded ? "border-green-600 bg-green-600/20" : ""
            }`}
            title="More options"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-full w-full text-zinc-400"
            >
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
          </button>
        </div>
      </div>
      {showExpanded && (
        <div className="fixed top-20 left-0 right-0 z-40 h-[400px] overflow-y-auto border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm p-4">
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-zinc-400">Device Name</h2>
              {isEditingDeviceName ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editedDeviceName}
                    onChange={(e) => setEditedDeviceName(e.target.value)}
                    onBlur={handleDeviceNameSave}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleDeviceNameSave();
                      } else if (e.key === "Escape") {
                        setIsEditingDeviceName(false);
                        setEditedDeviceName(currentDeviceName || "");
                      }
                    }}
                    className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white focus:border-zinc-600 focus:outline-none"
                    autoFocus
                  />
                </div>
              ) : (
                <button
                  onClick={() => {
                    setEditedDeviceName(currentDeviceName || "");
                    setIsEditingDeviceName(true);
                  }}
                  className="text-left text-sm font-medium text-zinc-300 hover:text-white"
                >
                  {currentDeviceName || "Unnamed"}
                </button>
              )}
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">Outgoing Audio</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">
                    {isPttPressed ? "Transmitting" : "Muted"}
                  </span>
                  <div
                    className={`h-2 w-2 rounded-full ${
                      isPttPressed ? "bg-green-500 animate-pulse" : "bg-zinc-600"
                    }`}
                  />
                </div>
              </div>
              {localStream && <Waveform stream={localStream} height={80} />}
            </div>
            <DeviceWaveformList
              devices={devices}
              incomingStreams={incomingStreams}
              isRemoteMuted={isRemoteMuted}
              onToggleRemoteMute={onToggleRemoteMute}
            />
          </div>
        </div>
      )}
    </>
  );
}

