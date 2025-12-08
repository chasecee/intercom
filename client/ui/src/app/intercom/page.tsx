"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  startTransition,
} from "react";
import { io, type Socket } from "socket.io-client";
import { DeviceNameModal } from "./components/DeviceNameModal";
import { DeviceToolbar } from "./components/DeviceToolbar";
import { IncomingAudioHandler } from "./components/IncomingAudioHandler";

const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL;

if (!SIGNALING_URL) {
  throw new Error("NEXT_PUBLIC_SIGNALING_URL is required");
}

const SIGNALING_URL_STRING: string = SIGNALING_URL;

const sanitizeDeviceName = (name: string): string | null => {
  if (typeof name !== "string") return null;
  const sanitized = name
    .trim()
    .slice(0, 50)
    .replace(/[<>\"'&]/g, "");
  return sanitized || null;
};

type Device = {
  deviceId: string;
  displayName: string;
};

export default function IntercomPage() {
  const [isPttPressed, setIsPttPressed] = useState(false);
  const [isPttLocked, setIsPttLocked] = useState(false);
  const [isRemoteMuted, setIsRemoteMuted] = useState(false);
  const [incomingStreams, setIncomingStreams] = useState<
    Map<string, MediaStream>
  >(new Map());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [showDeviceNameModal, setShowDeviceNameModal] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [selectedTargets, setSelectedTargets] = useState<string[]>(["ALL"]);
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const activeConnectionsRef = useRef<Map<string, RTCPeerConnection>>(
    new Map()
  );
  const connectionStateRef = useRef<
    Map<string, { makingOffer: boolean; settingRemoteAnswerPending: boolean }>
  >(new Map());
  const connectionTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const ensureConnectionRef = useRef<
    ((targetDeviceId: string) => Promise<RTCPeerConnection | undefined>) | null
  >(null);
  const cleanupPeerConnectionRef = useRef<
    ((targetDeviceId: string) => void) | null
  >(null);
  const currentDeviceIdRef = useRef<string | null>(null);
  const localAudioContextRef = useRef<AudioContext | null>(null);
  const localFilterRef = useRef<BiquadFilterNode | null>(null);
  const localDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(
    null
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = localStorage.getItem("deviceName");
    startTransition(() => {
      if (stored) {
        const sanitized = sanitizeDeviceName(stored);
        if (sanitized && sanitized !== stored) {
          localStorage.setItem("deviceName", sanitized);
        }
        if (sanitized) {
          setDeviceName(sanitized);
        } else {
          localStorage.removeItem("deviceName");
          setShowDeviceNameModal(true);
        }
      } else {
        setShowDeviceNameModal(true);
      }
      setIsHydrated(true);
    });
  }, []);

  const handleDeviceNameSave = (name: string) => {
    const sanitized = sanitizeDeviceName(name);
    if (!sanitized) return;
    setDeviceName(sanitized);
    setShowDeviceNameModal(false);
    if (socketRef.current?.connected) {
      socketRef.current.emit("register-device", { displayName: sanitized });
    }
  };

  useEffect(() => {
    let stopped = false;

    const socket = io(SIGNALING_URL_STRING, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
    });
    socketRef.current = socket;

    const cleanUp = () => {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      connectionTimeoutsRef.current.forEach((timeout) => {
        clearTimeout(timeout);
      });
      connectionTimeoutsRef.current.clear();
      activeConnectionsRef.current.forEach((pc) => {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
      });
      activeConnectionsRef.current.clear();
      connectionStateRef.current.clear();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
      if (localAudioContextRef.current) {
        localAudioContextRef.current.close();
        localAudioContextRef.current = null;
      }
    };

    const createPeerConnection = (
      targetDeviceId: string
    ): RTCPeerConnection => {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        iceCandidatePoolSize: 0,
      });

      connectionStateRef.current.set(targetDeviceId, {
        makingOffer: false,
        settingRemoteAnswerPending: false,
      });

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      pc.onicecandidate = (event) => {
        if (
          event.candidate &&
          socketRef.current &&
          currentDeviceIdRef.current
        ) {
          const callId = `${currentDeviceIdRef.current}-${targetDeviceId}`;
          socketRef.current.emit("signal", {
            callId,
            fromDeviceId: currentDeviceIdRef.current,
            targetDeviceId,
            data: event.candidate,
          });
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (!stream) return;
        const audioTracks = stream.getAudioTracks();
        const hasLiveAudioTrack = audioTracks.some(
          (track) => track.readyState === "live"
        );
        if (!hasLiveAudioTrack) return;
        setIncomingStreams((prev) => {
          const next = new Map(prev);
          next.set(targetDeviceId, stream);
          return next;
        });
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "failed" || state === "disconnected") {
          cleanupPeerConnection(targetDeviceId);
        }
      };

      return pc;
    };

    const cleanupPeerConnection = (targetDeviceId: string) => {
      const timeout = connectionTimeoutsRef.current.get(targetDeviceId);
      if (timeout) {
        clearTimeout(timeout);
        connectionTimeoutsRef.current.delete(targetDeviceId);
      }
      const pc = activeConnectionsRef.current.get(targetDeviceId);
      if (pc) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
        activeConnectionsRef.current.delete(targetDeviceId);
      }
      connectionStateRef.current.delete(targetDeviceId);
      setIncomingStreams((prev) => {
        const next = new Map(prev);
        next.delete(targetDeviceId);
        return next;
      });
    };

    const ensureConnection = async (targetDeviceId: string) => {
      const existingPc = activeConnectionsRef.current.get(targetDeviceId);
      if (existingPc) {
        const state = existingPc.connectionState;
        if (state === "connected" || state === "connecting") {
          return existingPc;
        }
        cleanupPeerConnection(targetDeviceId);
      }

      const pc = createPeerConnection(targetDeviceId);
      activeConnectionsRef.current.set(targetDeviceId, pc);

      if (!currentDeviceIdRef.current) return pc;

      const state = connectionStateRef.current.get(targetDeviceId)!;
      if (state.makingOffer) {
        return pc;
      }

      const existingTimeout = connectionTimeoutsRef.current.get(targetDeviceId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      const timeoutId = setTimeout(() => {
        const currentPc = activeConnectionsRef.current.get(targetDeviceId);
        if (currentPc === pc && currentPc.connectionState !== "connected") {
          cleanupPeerConnection(targetDeviceId);
        }
        connectionTimeoutsRef.current.delete(targetDeviceId);
      }, 30000);
      connectionTimeoutsRef.current.set(targetDeviceId, timeoutId);

      try {
        state.makingOffer = true;

        const offer = await pc.createOffer();
        if (pc.signalingState !== "stable") {
          const timeout = connectionTimeoutsRef.current.get(targetDeviceId);
          if (timeout === timeoutId) {
            clearTimeout(timeout);
            connectionTimeoutsRef.current.delete(targetDeviceId);
          }
          state.makingOffer = false;
          return pc;
        }
        await pc.setLocalDescription(offer);

        if (pc.localDescription && socketRef.current) {
          const callId = `${currentDeviceIdRef.current}-${targetDeviceId}`;
          socketRef.current.emit("signal", {
            callId,
            fromDeviceId: currentDeviceIdRef.current,
            targetDeviceId,
            data: pc.localDescription,
          });
        }
        state.makingOffer = false;

        const originalHandler = pc.onconnectionstatechange;
        pc.onconnectionstatechange = (event) => {
          const connectionState = pc.connectionState;
          const timeout = connectionTimeoutsRef.current.get(targetDeviceId);
          if (
            timeout &&
            (connectionState === "connected" ||
              connectionState === "failed" ||
              connectionState === "disconnected")
          ) {
            clearTimeout(timeout);
            connectionTimeoutsRef.current.delete(targetDeviceId);
          }
          if (originalHandler) {
            originalHandler.call(pc, event);
          }
        };
      } catch (err) {
        const timeout = connectionTimeoutsRef.current.get(targetDeviceId);
        if (timeout === timeoutId) {
          clearTimeout(timeout);
          connectionTimeoutsRef.current.delete(targetDeviceId);
        }
        console.error("Negotiation error:", err);
        state.makingOffer = false;
      }

      return pc;
    };

    ensureConnectionRef.current = ensureConnection;
    cleanupPeerConnectionRef.current = cleanupPeerConnection;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: true,
            autoGainControl: false,
            sampleRate: 48000,
            channelCount: 1,
          },
          video: false,
        });
        if (stopped) return;

        const audioContext = new AudioContext({ sampleRate: 48000 });
        const source = audioContext.createMediaStreamSource(stream);
        const filter = audioContext.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 50;
        filter.Q.value = 1;
        const destination = audioContext.createMediaStreamDestination();

        source.connect(filter);
        filter.connect(destination);

        localAudioContextRef.current = audioContext;
        localFilterRef.current = filter;
        localDestinationRef.current = destination;

        const filteredStream = destination.stream;
        localStreamRef.current = filteredStream;
        setLocalStream(filteredStream);

        const audioTrack = filteredStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrackRef.current = audioTrack;
          audioTrack.enabled = false;
        }
      } catch (error) {
        console.error("Microphone access error:", error);
      }
    })();

    socket.on("connect", () => {
      if (stopped) return;
      const deviceId = socket.id || null;
      currentDeviceIdRef.current = deviceId;
      setCurrentDeviceId(deviceId);
      const storedName = localStorage.getItem("deviceName");
      if (storedName) {
        const sanitized = sanitizeDeviceName(storedName);
        if (sanitized && sanitized !== storedName) {
          localStorage.setItem("deviceName", sanitized);
        }
        if (sanitized) {
          socket.emit("register-device", { displayName: sanitized });
        }
      }
    });

    socket.on("device-list", (deviceList: Device[]) => {
      if (stopped) return;
      setDevices(deviceList);
      const activeDeviceIds = new Set(deviceList.map((d) => d.deviceId));
      activeConnectionsRef.current.forEach((pc, deviceId) => {
        if (
          !activeDeviceIds.has(deviceId) &&
          cleanupPeerConnectionRef.current
        ) {
          cleanupPeerConnectionRef.current(deviceId);
        }
      });
    });

    socket.on("connect_error", (err) => {
      console.error("Signaling connection error:", err.message);
    });

    socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") {
        socket.connect();
      }
    });

    socket.on("reconnect", () => {
      const storedName = localStorage.getItem("deviceName");
      if (storedName) {
        const sanitized = sanitizeDeviceName(storedName);
        if (sanitized && sanitized !== storedName) {
          localStorage.setItem("deviceName", sanitized);
        }
        if (sanitized) {
          socket.emit("register-device", { displayName: sanitized });
        }
      }
    });

    socket.on(
      "signal",
      async (payload: {
        callId?: string;
        fromDeviceId?: string;
        targetDeviceId?: string;
        data?: RTCSessionDescriptionInit | RTCIceCandidate;
      }) => {
        if (!payload || !currentDeviceIdRef.current) return;

        const { callId, fromDeviceId, targetDeviceId, data } = payload;

        if (!targetDeviceId || targetDeviceId !== currentDeviceIdRef.current)
          return;
        if (!fromDeviceId || !data) return;

        let pc = activeConnectionsRef.current.get(fromDeviceId);
        if (!pc) {
          pc = createPeerConnection(fromDeviceId);
          activeConnectionsRef.current.set(fromDeviceId, pc);
        } else {
          const connectionState = pc.connectionState;
          if (
            connectionState === "failed" ||
            connectionState === "disconnected"
          ) {
            cleanupPeerConnection(fromDeviceId);
            pc = createPeerConnection(fromDeviceId);
            activeConnectionsRef.current.set(fromDeviceId, pc);
          }
        }

        const state = connectionStateRef.current.get(fromDeviceId) || {
          makingOffer: false,
          settingRemoteAnswerPending: false,
        };
        connectionStateRef.current.set(fromDeviceId, state);

        try {
          if ("type" in data) {
            const description = data as RTCSessionDescriptionInit;

            if (description.type === "offer") {
              const readyForOffer =
                !state.makingOffer &&
                (pc.signalingState === "stable" ||
                  state.settingRemoteAnswerPending);

              if (!readyForOffer) {
                if (state.makingOffer) {
                  await pc.setLocalDescription({ type: "rollback" });
                }
                state.makingOffer = false;
              }

              state.settingRemoteAnswerPending = false;
              await pc.setRemoteDescription(description);

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              if (
                pc.localDescription &&
                socketRef.current &&
                callId &&
                currentDeviceIdRef.current
              ) {
                socketRef.current.emit("signal", {
                  callId,
                  fromDeviceId: currentDeviceIdRef.current,
                  targetDeviceId: fromDeviceId,
                  data: pc.localDescription,
                });
              }
            } else if (description.type === "answer") {
              state.settingRemoteAnswerPending = true;
              await pc.setRemoteDescription(description);
              state.settingRemoteAnswerPending = false;
            }
          } else if ("candidate" in data) {
            try {
              await pc.addIceCandidate(data as RTCIceCandidate);
            } catch (err) {
              if (err instanceof Error && err.name !== "OperationError") {
                console.error("ICE candidate error:", err);
              }
            }
          }
        } catch (err) {
          console.error("Signal handling error:", err);
          state.makingOffer = false;
          state.settingRemoteAnswerPending = false;
        }
      }
    );

    return () => {
      stopped = true;
      cleanUp();
    };
  }, [deviceName]);

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
    if (ensureConnectionRef.current) {
      for (const targetId of targetIds) {
        await ensureConnectionRef.current(targetId);
      }
    }
  }, [resolveTargetDeviceIds]);

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
      if (ensureConnectionRef.current) {
        for (const targetId of targetIds) {
          await ensureConnectionRef.current(targetId);
        }
      }
    }
  }, [isPttPressed, resolveTargetDeviceIds]);

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

  const toggleRemoteMute = () => {
    setIsRemoteMuted((prev) => !prev);
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

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-black text-white">
        <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
          <div className="text-zinc-400">Loading...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-black text-white">
      {showDeviceNameModal && <DeviceNameModal onSave={handleDeviceNameSave} />}
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
          const sanitized = sanitizeDeviceName(name);
          if (!sanitized) return;
          setDeviceName(sanitized);
          localStorage.setItem("deviceName", sanitized);
          if (socketRef.current?.connected) {
            socketRef.current.emit("update-device-name", {
              displayName: sanitized,
            });
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
            src="https://38e8rd9bu3vqg9xa6yedqt0qtt0jiwz1.ui.nabu.casa/lovelace-tablet/"
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
  );
}
