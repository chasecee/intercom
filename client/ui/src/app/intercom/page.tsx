"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { StatusHeader } from "./components/StatusHeader";
import { ConnectionInfo } from "./components/ConnectionInfo";
import { AudioControls } from "./components/AudioControls";

type PeerStatus = "idle" | "connecting" | "live" | "error";

const ROOM = process.env.NEXT_PUBLIC_INTERCOM_ROOM || "door";
const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL;

if (!SIGNALING_URL) {
  throw new Error("NEXT_PUBLIC_SIGNALING_URL is required");
}

const SIGNALING_URL_STRING: string = SIGNALING_URL;

export default function IntercomPage() {
  const [status, setStatus] = useState<PeerStatus>("idle");
  const [detail, setDetail] = useState<string | null>(null);
  const [mediaGranted, setMediaGranted] = useState(false);
  const [iceState, setIceState] = useState<string>("new");
  const [isPttPressed, setIsPttPressed] = useState(false);
  const [isRemoteMuted, setIsRemoteMuted] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [showConnectionInfo, setShowConnectionInfo] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const makingOfferRef = useRef(false);
  const settingRemoteAnswerPendingRef = useRef(false);
  const joinedRef = useRef(false);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const localAudioContextRef = useRef<AudioContext | null>(null);
  const localFilterRef = useRef<BiquadFilterNode | null>(null);
  const localDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(
    null
  );

  useEffect(() => {
    let stopped = false;

    const socket = io(SIGNALING_URL_STRING, { transports: ["websocket"] });
    socketRef.current = socket;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      iceCandidatePoolSize: 0,
    });
    pcRef.current = pc;

    const cleanUp = () => {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (pcRef.current) {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
        pcRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
      if (localAudioContextRef.current) {
        localAudioContextRef.current.close();
        localAudioContextRef.current = null;
      }
    };

    const handleNegotiationNeeded = async () => {
      if (!joinedRef.current) return;
      if (!pcRef.current || !socketRef.current) return;
      try {
        makingOfferRef.current = true;
        setStatus("connecting");
        setDetail("Negotiating peer connection");
        const offer = await pcRef.current.createOffer();
        if (pcRef.current.signalingState !== "stable") return;
        await pcRef.current.setLocalDescription(offer);
        if (pcRef.current.localDescription) {
          socketRef.current.emit("signal", {
            room: ROOM,
            data: pcRef.current.localDescription,
          });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Negotiation failed";
        console.error("Negotiation error:", err);
        setStatus("error");
        setDetail(`Negotiation failed: ${message}`);
      } finally {
        makingOfferRef.current = false;
      }
    };

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
        setMediaGranted(true);

        const audioTrack = filteredStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrackRef.current = audioTrack;
          audioTrack.enabled = false;
        }

        filteredStream.getTracks().forEach((track) => {
          pc.addTrack(track, filteredStream);
        });

        pc.addEventListener("negotiationneeded", handleNegotiationNeeded);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Microphone permission failed";
        setStatus("error");
        setDetail(message);
      }
    })();

    socket.on("connect", () => {
      if (stopped) return;
      setDetail("Signaling online");
      socket.emit("join", ROOM);
      joinedRef.current = true;
      void handleNegotiationNeeded();
    });

    socket.on("connect_error", (err) => {
      setStatus("error");
      setDetail(`Signaling failed: ${err.message}`);
    });

    socket.on("signal", async (payload) => {
      const pcCurrent = pcRef.current;
      if (!pcCurrent || !payload) return;

      try {
        if ("type" in payload) {
          const description = payload;
          const readyForOffer =
            !makingOfferRef.current &&
            (pcCurrent.signalingState === "stable" ||
              settingRemoteAnswerPendingRef.current);
          const offerCollision = description.type === "offer" && !readyForOffer;

          if (offerCollision) {
            await pcCurrent.setLocalDescription({ type: "rollback" });
          }

          settingRemoteAnswerPendingRef.current = description.type === "answer";
          await pcCurrent.setRemoteDescription(description);
          settingRemoteAnswerPendingRef.current = false;

          if (description.type === "offer") {
            const answer = await pcCurrent.createAnswer();
            await pcCurrent.setLocalDescription(answer);
            if (pcCurrent.localDescription && socketRef.current) {
              socketRef.current.emit("signal", {
                room: ROOM,
                data: pcCurrent.localDescription,
              });
            }
          }
        } else if ("candidate" in payload) {
          await pcCurrent.addIceCandidate(payload);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Signaling handling failed";
        console.error("Signal handling error:", err);
        setStatus("error");
        setDetail(`Signaling failed: ${message}`);
      }
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit("signal", { room: ROOM, data: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;
      setRemoteStream(stream);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      setIceState(state);
      if (state === "connected") {
        setStatus("live");
        setDetail("Audio link active");
      } else if (state === "failed" || state === "disconnected") {
        setStatus("error");
        setDetail("Peer connection failed");
      }
    };

    return () => {
      stopped = true;
      cleanUp();
    };
  }, []);

  const handlePttDown = () => {
    setIsPttPressed(true);
    if (audioTrackRef.current) {
      audioTrackRef.current.enabled = true;
    }
  };

  const handlePttUp = () => {
    setIsPttPressed(false);
    if (audioTrackRef.current) {
      audioTrackRef.current.enabled = false;
    }
  };

  const toggleRemoteMute = () => {
    setIsRemoteMuted((prev) => !prev);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isPttPressed) {
        e.preventDefault();
        handlePttDown();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && isPttPressed) {
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
  }, [isPttPressed]);

  return (
    <div className="min-h-screen bg-black text-white">
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <StatusHeader
          status={status}
          detail={detail}
          room={ROOM}
          onToggleInfo={() => setShowConnectionInfo((prev) => !prev)}
        />
        {showConnectionInfo && (
          <ConnectionInfo
            mediaGranted={mediaGranted}
            signalingUrl={SIGNALING_URL_STRING}
            iceState={iceState}
          />
        )}
        <AudioControls
          localStream={localStreamRef.current}
          remoteStream={remoteStream}
          isPttPressed={isPttPressed}
          isRemoteMuted={isRemoteMuted}
          onPttDown={handlePttDown}
          onPttUp={handlePttUp}
          onToggleRemoteMute={toggleRemoteMute}
        />
      </main>
    </div>
  );
}
