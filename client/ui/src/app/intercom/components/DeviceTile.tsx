"use client";

import { Waveform } from "./Waveform";

type Device = {
  deviceId: string;
  displayName: string;
};

export function DeviceTile({
  device,
  isCurrentDevice,
  isSelected,
  isTransmitting,
  stream,
  onSelect,
  onPttDown,
  onPttUp,
  onPttClick,
  isPttLocked,
}: {
  device: Device;
  isCurrentDevice: boolean;
  isSelected: boolean;
  isTransmitting: boolean;
  stream: MediaStream | null;
  onSelect?: () => void;
  onPttDown?: () => void;
  onPttUp?: () => void;
  onPttClick?: () => void;
  isPttLocked?: boolean;
}) {
  const hasStream = stream !== null;

  return (
    <button
      onClick={isCurrentDevice ? (isPttLocked ? onPttClick : undefined) : onSelect}
      onMouseDown={isCurrentDevice && !isPttLocked ? onPttDown : undefined}
      onMouseUp={isCurrentDevice && !isPttLocked ? onPttUp : undefined}
      onTouchStart={(e) => {
        e.preventDefault();
        if (isCurrentDevice) {
          if (isPttLocked) {
            onPttClick?.();
          } else {
            onPttDown?.();
          }
        } else {
          onSelect?.();
        }
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        if (isCurrentDevice && !isPttLocked) {
          onPttUp?.();
        }
      }}
      className={`relative flex h-20 flex-1 flex-col items-center justify-center border-2 transition-all select-none ${
        isCurrentDevice ? "rounded-l-lg border-r-0" : "rounded-lg"
      } ${
        isCurrentDevice
          ? isTransmitting
            ? "border-red-600 bg-red-600/20"
            : "border-purple-600 bg-purple-600/20"
          : isSelected
            ? "border-green-600 bg-green-600/20"
            : "border-zinc-700 bg-zinc-900/50"
      } ${isTransmitting ? "ring-2 ring-red-500" : ""} ${
        isCurrentDevice
          ? isTransmitting
            ? "hover:bg-red-600/30"
            : "hover:bg-purple-600/30"
          : "hover:bg-zinc-800/50"
      }`}
    >
      {hasStream && (
        <div className="absolute inset-0 overflow-hidden rounded-lg opacity-30">
          <Waveform stream={stream} height={80} />
        </div>
      )}
      <div className="relative z-10 flex flex-col items-center gap-1">
        <span
          className={`text-xs font-medium ${
            isCurrentDevice
              ? isTransmitting
                ? "text-red-400"
                : "text-purple-400"
              : isSelected
                ? "text-green-400"
                : "text-zinc-300"
          }`}
        >
          {device.displayName}
        </span>
        {isCurrentDevice ? (
          <span className="text-[9px] leading-tight text-zinc-400">Push to Talk</span>
        ) : isTransmitting ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 text-green-500"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : null}
      </div>
    </button>
  );
}

