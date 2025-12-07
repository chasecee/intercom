"use client";

type Device = {
  deviceId: string;
  displayName: string;
};

export function TargetSelector({
  devices,
  currentDeviceId,
  selectedTargets,
  onSelectionChange,
}: {
  devices: Device[];
  currentDeviceId: string | null;
  selectedTargets: string[];
  onSelectionChange: (targets: string[]) => void;
}) {
  const availableDevices = devices.filter(
    (d) => d.deviceId !== currentDeviceId
  );
  const isAllSelected = selectedTargets.length === 1 && selectedTargets[0] === "ALL";

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

  return (
    <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
      <h2 className="text-lg font-medium">Transmit To</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <button
          onClick={handleAllClick}
          className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
            isAllSelected
              ? "border-green-600 bg-green-600/20 text-green-400"
              : "border-zinc-700 bg-zinc-900/50 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800/50"
          }`}
        >
          All
        </button>
        {availableDevices.map((device) => {
          const isSelected =
            !isAllSelected && selectedTargets.includes(device.deviceId);
          return (
            <button
              key={device.deviceId}
              onClick={() => handleDeviceToggle(device.deviceId)}
              className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
                isSelected
                  ? "border-green-600 bg-green-600/20 text-green-400"
                  : "border-zinc-700 bg-zinc-900/50 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800/50"
              }`}
            >
              {device.displayName}
            </button>
          );
        })}
      </div>
      {availableDevices.length === 0 && (
        <p className="text-sm text-zinc-500">No other devices connected</p>
      )}
    </div>
  );
}

