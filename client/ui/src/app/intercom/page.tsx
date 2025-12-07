"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

type PeerStatus = "idle" | "connecting" | "live" | "error";

const ROOM = process.env.NEXT_PUBLIC_INTERCOM_ROOM || "door";
const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL;

if (!SIGNALING_URL) {
  throw new Error("NEXT_PUBLIC_SIGNALING_URL is required");
}

export default function IntercomPage() {
  const [status, setStatus] = useState<PeerStatus>("idle");
  const [detail, setDetail] = useState<string | null>(null);
  const [mediaGranted, setMediaGranted] = useState(false);
  const [iceState, setIceState] = useState<string>("new");
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const makingOfferRef = useRef(false);
  const settingRemoteAnswerPendingRef = useRef(false);
  const joinedRef = useRef(false);

  useEffect(() => {
    let stopped = false;

    const socket = io(SIGNALING_URL, { transports: ["websocket"] });
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
    };

    const handleNegotiationNeeded = async () => {
      if (!joinedRef.current) return;
      if (!pcRef.current || !socketRef.current) return;
      try {
        makingOfferRef.current = true;
        setStatus("connecting");
        setDetail("Negotiating peer connection");
        const offer = await pcRef.current.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        });
        if (pcRef.current.signalingState !== "stable") return;
        
        const modifiedOffer = {
          ...offer,
          sdp: offer.sdp
            ?.replace(/a=rtpmap:(\d+) opus\/48000\/2/g, "a=rtpmap:$1 opus/48000/1")
            .replace(/a=fmtp:(\d+) (.+)/g, (match, pt, params) => {
              if (params.includes("opus")) {
                const cleanParams = params
                  .replace(/maxaveragebitrate=\d+/, "")
                  .replace(/usedtx=\d+/, "")
                  .replace(/stereo=\d+/, "")
                  .replace(/sprop-stereo=\d+/, "")
                  .replace(/;+/g, ";")
                  .replace(/^;|;$/g, "");
                return `a=fmtp:${pt} ${cleanParams};maxaveragebitrate=32000;usedtx=0;stereo=0;sprop-stereo=0`;
              }
              return match;
            }),
        };
        
        await pcRef.current.setLocalDescription(modifiedOffer);
        if (pcRef.current.localDescription) {
          socketRef.current.emit("signal", {
            room: ROOM,
            data: pcRef.current.localDescription,
          });
        }
      } catch {
        setStatus("error");
        setDetail("Negotiation failed");
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
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 48000,
            channelCount: 1,
          },
          video: false,
        });
        if (stopped) return;
        localStreamRef.current = stream;
        setMediaGranted(true);
        
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          const sender = pc.addTrack(audioTrack, stream);
          
          const configureLowLatency = async () => {
            try {
              if ("setCodecPreferences" in RTCRtpTransceiver.prototype) {
                const transceivers = pc.getTransceivers();
                const transceiver = transceivers.find((t) => t.sender === sender);
                if (transceiver) {
                  const codecs = RTCRtpReceiver.getCapabilities("audio")?.codecs;
                  const opusCodec = codecs?.find((c) => c.mimeType === "audio/opus");
                  if (opusCodec) {
                    opusCodec.clockRate = 48000;
                    opusCodec.channels = 1;
                    if (opusCodec.sdpFmtpLine) {
                      opusCodec.sdpFmtpLine = opusCodec.sdpFmtpLine
                        .replace(/maxplaybackrate=\d+/, "maxplaybackrate=48000")
                        .replace(/stereo=\d+/, "stereo=0")
                        .replace(/sprop-stereo=\d+/, "sprop-stereo=0");
                      if (!opusCodec.sdpFmtpLine.includes("maxaveragebitrate")) {
                        opusCodec.sdpFmtpLine += ";maxaveragebitrate=32000";
                      }
                      if (!opusCodec.sdpFmtpLine.includes("usedtx")) {
                        opusCodec.sdpFmtpLine += ";usedtx=0";
                      }
                    }
                    transceiver.setCodecPreferences([opusCodec]);
                  }
                }
              }
              
              const params = sender.getParameters();
              if (params.codecs) {
                const opusCodec = params.codecs.find(
                  (codec) => codec.mimeType === "audio/opus"
                );
                if (opusCodec && opusCodec.sdpFmtpLine) {
                  opusCodec.sdpFmtpLine = opusCodec.sdpFmtpLine
                    .replace(/maxplaybackrate=\d+/, "maxplaybackrate=48000")
                    .replace(/stereo=\d+/, "stereo=0")
                    .replace(/sprop-stereo=\d+/, "sprop-stereo=0");
                  if (!opusCodec.sdpFmtpLine.includes("maxaveragebitrate")) {
                    opusCodec.sdpFmtpLine += ";maxaveragebitrate=32000";
                  }
                  if (!opusCodec.sdpFmtpLine.includes("usedtx")) {
                    opusCodec.sdpFmtpLine += ";usedtx=0";
                  }
                  await sender.setParameters(params);
                }
              }
            } catch (err) {
              console.warn("Failed to configure low-latency codec:", err);
            }
          };
          
          if (pc.connectionState === "new") {
            await configureLowLatency();
          } else {
            pc.addEventListener("connectionstatechange", () => {
              if (pc.connectionState === "connected") {
                void configureLowLatency();
              }
            }, { once: true });
          }
        }
        
        pc.addEventListener("negotiationneeded", handleNegotiationNeeded);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Microphone permission failed";
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
            const answer = await pcCurrent.createAnswer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: false,
            });
            
            const modifiedAnswer = {
              ...answer,
              sdp: answer.sdp
                ?.replace(/a=rtpmap:(\d+) opus\/48000\/2/g, "a=rtpmap:$1 opus/48000/1")
                .replace(/a=fmtp:(\d+) (.+)/g, (match, pt, params) => {
                  if (params.includes("opus")) {
                    const cleanParams = params
                      .replace(/maxaveragebitrate=\d+/, "")
                      .replace(/usedtx=\d+/, "")
                      .replace(/stereo=\d+/, "")
                      .replace(/sprop-stereo=\d+/, "")
                      .replace(/;+/g, ";")
                      .replace(/^;|;$/g, "");
                    return `a=fmtp:${pt} ${cleanParams};maxaveragebitrate=32000;usedtx=0;stereo=0;sprop-stereo=0`;
                  }
                  return match;
                }),
            };
            
            await pcCurrent.setLocalDescription(modifiedAnswer);
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
      } catch {
        setStatus("error");
        setDetail("Signaling handling failed");
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
      if (remoteAudioRef.current) {
        const audio = remoteAudioRef.current;
        audio.srcObject = stream;
        audio.playbackRate = 1.0;
        if ("setSinkId" in audio && typeof audio.setSinkId === "function") {
          audio.setSinkId("").catch(() => {});
        }
      }
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

  const statusColor = useMemo(() => {
    if (status === "live") return "bg-green-500";
    if (status === "error") return "bg-red-500";
    return "bg-amber-500";
  }, [status]);

  return (
    <div className="min-h-screen bg-black text-white">
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">
              Intercom
            </p>
            <h1 className="text-3xl font-semibold">Door audio link</h1>
            <p className="text-sm text-zinc-400">Room: {ROOM}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${statusColor}`} />
            <div className="text-right">
              <p className="text-sm font-medium capitalize">{status}</p>
              {detail ? <p className="text-xs text-zinc-400">{detail}</p> : null}
            </div>
          </div>
        </div>

        <section className="grid gap-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-300">Microphone</div>
            <div
              className={`rounded-full px-3 py-1 text-xs ${
                mediaGranted
                  ? "bg-emerald-600/20 text-emerald-200"
                  : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {mediaGranted ? "granted" : "pending"}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-300">Signaling</div>
            <div className="text-xs text-zinc-400">{SIGNALING_URL}</div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-300">ICE state</div>
            <div className="text-xs text-zinc-400">{iceState}</div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
          <p className="text-sm text-zinc-300">
            Audio link stays open; leave this tab foregrounded on the tablet.
          </p>
          <audio
            ref={remoteAudioRef}
            autoPlay
            playsInline
            className="hidden"
            preload="none"
          />
        </section>
      </main>
    </div>
  );
}

