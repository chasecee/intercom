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
      <div className="space-y-3">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="radio"
            checked={isAllSelected}
            onChange={handleAllClick}
            className="h-4 w-4 cursor-pointer accent-green-600"
          />
          <span className="text-sm font-medium">All</span>
        </label>
        {availableDevices.map((device) => {
          const isSelected =
            !isAllSelected && selectedTargets.includes(device.deviceId);
          return (
            <label
              key={device.deviceId}
              className="flex cursor-pointer items-center gap-3"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleDeviceToggle(device.deviceId)}
                className="h-4 w-4 cursor-pointer accent-green-600"
              />
              <span className="text-sm">{device.displayName}</span>
            </label>
          );
        })}
        {availableDevices.length === 0 && (
          <p className="text-sm text-zinc-500">No other devices connected</p>
        )}
      </div>
    </div>
  );
}

