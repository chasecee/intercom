"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import { StatusHeader } from "./components/StatusHeader";
import { ConnectionInfo } from "./components/ConnectionInfo";
import { AudioControls } from "./components/AudioControls";
import { DeviceNameModal } from "./components/DeviceNameModal";
import { TargetSelector } from "./components/TargetSelector";
import { DeviceWaveformList } from "./components/DeviceWaveformList";

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
  const [showConnectionInfo, setShowConnectionInfo] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("deviceName");
  });
  const [showDeviceNameModal, setShowDeviceNameModal] = useState(() => {
    if (typeof window === "undefined") return false;
    return !localStorage.getItem("deviceName");
  });
  const [isEditingDeviceName, setIsEditingDeviceName] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [selectedTargets, setSelectedTargets] = useState<string[]>(["ALL"]);
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

  const handleDeviceNameSave = (name: string) => {
    setDeviceName(name);
    setShowDeviceNameModal(false);
    if (socketRef.current?.connected) {
      socketRef.current.emit("register-device", { displayName: name });
    }
  };

  const handleDeviceNameEdit = () => {
    setIsEditingDeviceName(true);
  };

  const handleDeviceNameChange = (newName: string) => {
    const trimmed = newName.trim();
    if (trimmed && trimmed !== deviceName) {
      setDeviceName(trimmed);
      localStorage.setItem("deviceName", trimmed);
      if (socketRef.current?.connected) {
        socketRef.current.emit("update-device-name", {
          displayName: trimmed,
        });
      }
    }
    setIsEditingDeviceName(false);
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
              message =
                "Microphone access blocked in iframe. Home Assistant must allow microphone permissions on the iframe.";
            } else {
              message =
                "Microphone permission denied. Please allow microphone access in your browser settings.";
            }
          } else if (error.name === "NotFoundError") {
            message =
              "No microphone found. Please connect a microphone and try again.";
          } else if (error.name === "NotReadableError") {
            message = "Microphone is in use by another application.";
          }
        }
        setStatus("error");
        setDetail(message);
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

  return (
    <div className="min-h-screen bg-black text-white">
      {showDeviceNameModal && <DeviceNameModal onSave={handleDeviceNameSave} />}
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <StatusHeader
          status={status}
          detail={detail}
          onToggleInfo={() => setShowConnectionInfo((prev) => !prev)}
        />
        {deviceName && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-400">Device:</span>
            {isEditingDeviceName ? (
              <input
                type="text"
                defaultValue={deviceName}
                onBlur={(e) => handleDeviceNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleDeviceNameChange(e.currentTarget.value);
                  } else if (e.key === "Escape") {
                    setIsEditingDeviceName(false);
                  }
                }}
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-white focus:border-zinc-600 focus:outline-none"
                autoFocus
              />
            ) : (
              <button
                onClick={handleDeviceNameEdit}
                className="text-sm font-medium text-zinc-300 hover:text-white"
              >
                {deviceName}
              </button>
            )}
          </div>
        )}
        {showConnectionInfo && (
          <ConnectionInfo
            mediaGranted={mediaGranted}
            signalingUrl={SIGNALING_URL_STRING}
            iceState="connected"
          />
        )}
        <TargetSelector
          devices={devices}
          currentDeviceId={currentDeviceId}
          selectedTargets={selectedTargets}
          onSelectionChange={setSelectedTargets}
        />
        <AudioControls
          localStream={localStream}
          isPttPressed={isPttPressed}
          isLocked={isPttLocked}
          onPttDown={handlePttDown}
          onPttUp={handlePttUp}
          onPttClick={handlePttToggle}
          onToggleLock={togglePttLock}
        />
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
          <DeviceWaveformList
            devices={devices}
            incomingStreams={incomingStreams}
            isRemoteMuted={isRemoteMuted}
            onToggleRemoteMute={toggleRemoteMute}
          />
        </div>
      </main>
    </div>
  );
}
