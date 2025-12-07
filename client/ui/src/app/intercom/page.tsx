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

type PeerStatus = "idle" | "connecting" | "live" | "error";

const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL;

if (!SIGNALING_URL) {
  throw new Error("NEXT_PUBLIC_SIGNALING_URL is required");
}

const SIGNALING_URL_STRING: string = SIGNALING_URL;

type Device = {
  deviceId: string;
  displayName: string;
};

export default function IntercomPage() {
  const [status, setStatus] = useState<PeerStatus>("idle");
  const [detail, setDetail] = useState<string | null>(null);
  const [mediaGranted, setMediaGranted] = useState(false);
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
  const socketRef = useRef<Socket | null>(null);
  const activeConnectionsRef = useRef<Map<string, RTCPeerConnection>>(
    new Map()
  );
  const connectionStateRef = useRef<
    Map<string, { makingOffer: boolean; settingRemoteAnswerPending: boolean }>
  >(new Map());
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
        setDeviceName(stored);
      } else {
        setShowDeviceNameModal(true);
      }
      setIsHydrated(true);
    });
  }, []);

  const handleDeviceNameSave = (name: string) => {
    setDeviceName(name);
    setShowDeviceNameModal(false);
    if (socketRef.current?.connected) {
      socketRef.current.emit("register-device", { displayName: name });
    }
  };

  useEffect(() => {
    let stopped = false;

    const socket = io(SIGNALING_URL_STRING, { transports: ["websocket"] });
    socketRef.current = socket;

    const cleanUp = () => {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
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
        setIncomingStreams((prev) => {
          const next = new Map(prev);
          next.set(targetDeviceId, stream);
          return next;
        });
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "connected") {
          setStatus("live");
          setDetail("Audio link active");
        } else if (state === "failed" || state === "disconnected") {
          cleanupPeerConnection(targetDeviceId);
        }
      };

      return pc;
    };

    const cleanupPeerConnection = (targetDeviceId: string) => {
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
      if (activeConnectionsRef.current.has(targetDeviceId)) {
        return activeConnectionsRef.current.get(targetDeviceId)!;
      }

      const pc = createPeerConnection(targetDeviceId);
      activeConnectionsRef.current.set(targetDeviceId, pc);

      if (!currentDeviceIdRef.current) return pc;

      try {
        const state = connectionStateRef.current.get(targetDeviceId)!;
        state.makingOffer = true;
        setStatus("connecting");
        setDetail("Negotiating peer connection");

        const offer = await pc.createOffer();
        if (pc.signalingState !== "stable") {
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
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Negotiation failed";
        console.error("Negotiation error:", err);
        setStatus("error");
        setDetail(`Negotiation failed: ${message}`);
        const state = connectionStateRef.current.get(targetDeviceId);
        if (state) {
          state.makingOffer = false;
        }
      }

      return pc;
    };

    ensureConnectionRef.current = ensureConnection;
    cleanupPeerConnectionRef.current = cleanupPeerConnection;

    (async () => {
      try {
        setStatus("connecting");
        setDetail("Requesting microphone access");
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
        setMediaGranted(true);

        const audioTrack = filteredStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrackRef.current = audioTrack;
          audioTrack.enabled = false;
        }
      } catch (error) {
        let message = "Microphone permission failed";
        if (error instanceof Error) {
          message = error.message;
          if (
            error.name === "NotAllowedError" ||
            error.name === "PermissionDeniedError"
          ) {
            const isInIframe = window.self !== window.top;
            if (isInIframe) {
              const parentOrigin = document.referrer
                ? new URL(document.referrer).origin
                : "parent page";
              const isHttp = parentOrigin.startsWith("http://");
              message = `Microphone blocked. Parent origin: ${parentOrigin}. ${
                isHttp
                  ? "HTTP sites may block microphone access. Try: 1) Reset permissions for the parent site, 2) Open this page directly to grant permission first, or 3) Use HTTPS for Home Assistant."
                  : "Check browser site settings for microphone permission."
              }`;
            } else {
              message =
                "Microphone permission denied. Please allow microphone access in your browser settings.";
            }
          } else if (error.name === "NotFoundError") {
            message =
              "No microphone found. Please connect a microphone and try again.";
          } else if (error.name === "NotReadableError") {
            message = "Microphone is in use by another application.";
          } else if (error.name === "SecurityError") {
            const isInIframe = window.self !== window.top;
            if (isInIframe) {
              message =
                "Security error: Microphone access blocked. Check iframe sandbox attributes and Permissions-Policy headers.";
            } else {
              message =
                "Security error: Microphone access not allowed in this context.";
            }
          }
        }
        setStatus("error");
        setDetail(message);
        console.error("Microphone access error:", error);
      }
    })();

    socket.on("connect", () => {
      if (stopped) return;
      const deviceId = socket.id || null;
      currentDeviceIdRef.current = deviceId;
      setCurrentDeviceId(deviceId);
      setDetail("Signaling online");
      const storedName = localStorage.getItem("deviceName");
      if (storedName) {
        socket.emit("register-device", { displayName: storedName });
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
      setStatus("error");
      setDetail(`Signaling failed: ${err.message}`);
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
        }

        const state = connectionStateRef.current.get(fromDeviceId) || {
          makingOffer: false,
          settingRemoteAnswerPending: false,
        };
        connectionStateRef.current.set(fromDeviceId, state);

        try {
          if ("type" in data) {
            const description = data as RTCSessionDescriptionInit;
            const readyForOffer =
              !state.makingOffer &&
              (pc.signalingState === "stable" ||
                state.settingRemoteAnswerPending);
            const offerCollision =
              description.type === "offer" && !readyForOffer;

            if (offerCollision) {
              await pc.setLocalDescription({ type: "rollback" });
            }

            state.settingRemoteAnswerPending = description.type === "answer";
            await pc.setRemoteDescription(description);
            state.settingRemoteAnswerPending = false;

            if (description.type === "offer") {
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
            }
          } else if ("candidate" in data) {
            await pc.addIceCandidate(data as RTCIceCandidate);
          }
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Signaling handling failed";
          console.error("Signal handling error:", err);
          setStatus("error");
          setDetail(`Signaling failed: ${message}`);
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
          setDeviceName(name);
          localStorage.setItem("deviceName", name);
          if (socketRef.current?.connected) {
            socketRef.current.emit("update-device-name", {
              displayName: name,
            });
          }
        }}
        onExpandedChange={setIsToolbarExpanded}
      />
      <div
        className="fixed left-0 right-0 bottom-0 overflow-hidden"
        style={{ top: isToolbarExpanded ? "420px" : "80px" }}
      >
        <iframe
          src="http://192.168.4.251:8123/lovelace-tablet/"
          className="w-full h-full border-0"
          title="Home Assistant Tablet Dashboard"
        />
      </div>
    </div>
  );
}
