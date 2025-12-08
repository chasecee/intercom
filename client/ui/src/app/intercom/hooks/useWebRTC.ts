import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import {
  SIGNALING_URL_STRING,
  type Device,
  sanitizeDeviceName,
} from "../utils";

type ConnectionState = {
  makingOffer: boolean;
  settingRemoteAnswerPending: boolean;
};

export function useWebRTC(deviceName: string | null) {
  const [incomingStreams, setIncomingStreams] = useState<
    Map<string, MediaStream>
  >(new Map());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const activeConnectionsRef = useRef<Map<string, RTCPeerConnection>>(
    new Map()
  );
  const connectionStateRef = useRef<Map<string, ConnectionState>>(new Map());
  const connectionTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(
    new Map()
  );
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
        console.error(`Negotiation error for ${targetDeviceId}:`, err);
        state.makingOffer = false;
        cleanupPeerConnection(targetDeviceId);
        throw err;
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

    const registerDevice = (displayName: string) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit("register-device", { displayName });
      }
    };

    socket.on("connect", () => {
      if (stopped) return;
      const deviceId = socket.id || null;
      currentDeviceIdRef.current = deviceId;
      setCurrentDeviceId(deviceId);
      try {
        const storedName = localStorage.getItem("deviceName");
        if (storedName) {
          const sanitized = sanitizeDeviceName(storedName);
          if (sanitized && sanitized !== storedName) {
            try {
              localStorage.setItem("deviceName", sanitized);
            } catch (err) {
              console.error("Failed to update sanitized device name:", err);
            }
          }
          if (sanitized) {
            registerDevice(sanitized);
          }
        }
      } catch (err) {
        console.error("Failed to read device name on connect:", err);
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
      try {
        const storedName = localStorage.getItem("deviceName");
        if (storedName) {
          const sanitized = sanitizeDeviceName(storedName);
          if (sanitized && sanitized !== storedName) {
            try {
              localStorage.setItem("deviceName", sanitized);
            } catch (err) {
              console.error("Failed to update sanitized device name:", err);
            }
          }
          if (sanitized) {
            registerDevice(sanitized);
          }
        }
      } catch (err) {
        console.error("Failed to read device name on reconnect:", err);
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

  useEffect(() => {
    if (deviceName && socketRef.current?.connected) {
      socketRef.current.emit("register-device", { displayName: deviceName });
    }
  }, [deviceName]);

  useEffect(() => {
    if (!socketRef.current) return;

    const keepAliveInterval = setInterval(() => {
      if (socketRef.current?.connected) {
        socketRef.current.emit("ping");
      }
    }, 30000);

    return () => clearInterval(keepAliveInterval);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && socketRef.current) {
        if (!socketRef.current.connected) {
          socketRef.current.connect();
        }
        activeConnectionsRef.current.forEach((pc, deviceId) => {
          if (
            pc.connectionState === "disconnected" ||
            pc.connectionState === "failed"
          ) {
            if (ensureConnectionRef.current) {
              ensureConnectionRef.current(deviceId);
            }
          }
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const registerDevice = useCallback((displayName: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("register-device", { displayName });
    }
  }, []);

  // Intentionally accessing refs.current to expose current values from hook
  // This is safe because these refs are stable and only change in effects
  /* eslint-disable react-hooks/refs */
  return useMemo(
    () => ({
      incomingStreams,
      localStream,
      devices,
      currentDeviceId,
      ensureConnection: ensureConnectionRef.current,
      audioTrack: audioTrackRef.current,
      socket: socketRef.current,
      registerDevice,
    }),
    [
      incomingStreams,
      localStream,
      devices,
      currentDeviceId,
      registerDevice,
    ]
  );
  /* eslint-enable react-hooks/refs */
}

