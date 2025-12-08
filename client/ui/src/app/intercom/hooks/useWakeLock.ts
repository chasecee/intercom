import { useEffect, useRef } from "react";

declare global {
  interface Window {
    fully?: {
      keepScreenOn: (enabled: boolean) => void;
      screenOff: () => void;
      screenOn: () => void;
    };
  }
}

export function useWakeLock(
  isActive: boolean,
  hasIncomingAudio: boolean
) {
  const systemWakeLockRef = useRef<WakeLockSentinel | null>(null);
  const screenWakeLockRef = useRef<WakeLockSentinel | null>(null);
  const fullyKioskActiveRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    const isFullyKiosk = typeof window !== "undefined" && "fully" in window && window.fully;

    if (isFullyKiosk) {
      const needsWakeLock = isActive || hasIncomingAudio;
      
      if (needsWakeLock && !fullyKioskActiveRef.current) {
        try {
          window.fully!.keepScreenOn(true);
          fullyKioskActiveRef.current = true;
        } catch (err) {
          console.error("Failed to enable Fully Kiosk wake lock:", err);
        }
      } else if (!needsWakeLock && fullyKioskActiveRef.current) {
        try {
          window.fully!.keepScreenOn(false);
          fullyKioskActiveRef.current = false;
        } catch (err) {
          console.error("Failed to disable Fully Kiosk wake lock:", err);
        }
      }

      return () => {
        if (fullyKioskActiveRef.current) {
          try {
            window.fully!.keepScreenOn(false);
            fullyKioskActiveRef.current = false;
          } catch (err) {
            console.error("Failed to cleanup Fully Kiosk wake lock:", err);
          }
        }
      };
    }

    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return;
    }

    const acquireSystemWakeLock = async () => {
      if (!isMounted) return;
      try {
        const wakeLock = navigator.wakeLock as unknown as {
          request?: (type: "system") => Promise<WakeLockSentinel>;
        };
        if ("system" in navigator.wakeLock && wakeLock.request) {
          systemWakeLockRef.current = await wakeLock.request("system");
        }
      } catch (err) {
        console.warn("System wake lock not available:", err);
      }
    };

    const releaseSystemWakeLock = async () => {
      if (systemWakeLockRef.current) {
        try {
          await systemWakeLockRef.current.release();
        } catch (err) {
          console.warn("Failed to release system wake lock:", err);
        }
        systemWakeLockRef.current = null;
      }
    };

    const acquireScreenWakeLock = async () => {
      if (!isMounted || screenWakeLockRef.current) return;
      try {
        screenWakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch (err) {
        console.warn("Screen wake lock not available:", err);
      }
    };

    const releaseScreenWakeLock = async () => {
      if (screenWakeLockRef.current) {
        try {
          await screenWakeLockRef.current.release();
        } catch (err) {
          console.warn("Failed to release screen wake lock:", err);
        }
        screenWakeLockRef.current = null;
      }
    };

    const needsSystemWakeLock = isActive || hasIncomingAudio;

    if (needsSystemWakeLock) {
      acquireSystemWakeLock();
    } else {
      releaseSystemWakeLock();
    }

    if (isActive) {
      acquireScreenWakeLock();
    } else {
      releaseScreenWakeLock();
    }

    const handleVisibilityChange = () => {
      if (!isMounted) return;
      if (document.visibilityState === "visible") {
        if (needsSystemWakeLock && !systemWakeLockRef.current) {
          acquireSystemWakeLock();
        }
        if (isActive && !screenWakeLockRef.current) {
          acquireScreenWakeLock();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseSystemWakeLock();
      releaseScreenWakeLock();
    };
  }, [isActive, hasIncomingAudio]);
}

