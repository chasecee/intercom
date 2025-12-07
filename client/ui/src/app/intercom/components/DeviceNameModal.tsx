"use client";

import { useState, useEffect } from "react";

export function DeviceNameModal({
  onSave,
}: {
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("deviceName");
    if (stored) {
      setName(stored);
    }
  }, []);

  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed) {
      localStorage.setItem("deviceName", trimmed);
      onSave(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-6">
        <h2 className="mb-4 text-xl font-semibold">Name this device</h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Kitchen / Studio / Nursery"
          className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500 focus:border-zinc-600 focus:outline-none"
          autoFocus
        />
        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="w-full rounded-lg bg-green-600 px-4 py-2 font-medium text-white transition-colors hover:bg-green-700 disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          Save
        </button>
      </div>
    </div>
  );
}

