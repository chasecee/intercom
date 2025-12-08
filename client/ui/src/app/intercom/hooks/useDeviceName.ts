import { useEffect, useState, startTransition } from "react";
import { sanitizeDeviceName } from "../utils";

export function useDeviceName() {
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [showDeviceNameModal, setShowDeviceNameModal] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = localStorage.getItem("deviceName");
      startTransition(() => {
        if (stored) {
          const sanitized = sanitizeDeviceName(stored);
          if (sanitized && sanitized !== stored) {
            try {
              localStorage.setItem("deviceName", sanitized);
            } catch (err) {
              console.error("Failed to update sanitized device name:", err);
            }
          }
          if (sanitized) {
            setDeviceName(sanitized);
          } else {
            try {
              localStorage.removeItem("deviceName");
            } catch (err) {
              console.error("Failed to remove invalid device name:", err);
            }
            setShowDeviceNameModal(true);
          }
        } else {
          setShowDeviceNameModal(true);
        }
        setIsHydrated(true);
      });
    } catch (err) {
      console.error("Failed to read device name from localStorage:", err);
      setShowDeviceNameModal(true);
      setIsHydrated(true);
    }
  }, []);

  const handleDeviceNameSave = (name: string) => {
    const sanitized = sanitizeDeviceName(name);
    if (!sanitized) return null;
    try {
      setDeviceName(sanitized);
      localStorage.setItem("deviceName", sanitized);
      setShowDeviceNameModal(false);
      return sanitized;
    } catch (err) {
      console.error("Failed to save device name:", err);
      return null;
    }
  };

  const updateDeviceName = (name: string) => {
    const sanitized = sanitizeDeviceName(name);
    if (!sanitized) return null;
    try {
      setDeviceName(sanitized);
      localStorage.setItem("deviceName", sanitized);
      return sanitized;
    } catch (err) {
      console.error("Failed to update device name:", err);
      return null;
    }
  };

  return {
    deviceName,
    showDeviceNameModal,
    isHydrated,
    handleDeviceNameSave,
    updateDeviceName,
  };
}

