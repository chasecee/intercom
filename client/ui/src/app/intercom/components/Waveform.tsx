"use client";

import { useEffect, useRef, useState } from "react";

export function Waveform({
  stream,
  height = 80,
}: {
  stream: MediaStream | null;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateWidth = () => {
      if (containerRef.current) {
        setWidth(containerRef.current.offsetWidth);
      }
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!stream || !canvasRef.current || width === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;

    try {
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.95;
      source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;
    } catch (err) {
      console.error("Failed to create audio context:", err);
      if (audioContext) {
        audioContext.close().catch(() => {});
      }
      return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const previousData = new Float32Array(bufferLength);

    const sampleRate = audioContext.sampleRate;
    const nyquist = sampleRate / 2;
    const frequencyResolution = nyquist / bufferLength;
    const cutoffFreq = 50;
    const startBin = Math.ceil(cutoffFreq / frequencyResolution);

    const draw = () => {
      if (!analyserRef.current || !ctx || !canvasRef.current) return;

      const currentWidth = canvasRef.current.offsetWidth;
      if (currentWidth !== canvas.width) {
        canvas.width = currentWidth;
        canvas.height = height;
      }

      animationFrameRef.current = requestAnimationFrame(draw);
      analyserRef.current.getByteFrequencyData(dataArray);

      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const visibleBins = bufferLength - startBin;
      const barWidth = (canvas.width / visibleBins) * 2.5;
      const smoothingFactor = 0.7;

      for (let i = startBin; i < bufferLength; i++) {
        const rawValue = dataArray[i] / 255;
        const smoothedValue = previousData[i] * smoothingFactor + rawValue * (1 - smoothingFactor);
        previousData[i] = smoothedValue;

        const barHeight = smoothedValue * canvas.height;
        const x = (i - startBin) * (barWidth + 1);

        const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, "rgb(34, 197, 94)");
        gradient.addColorStop(1, "rgb(16, 185, 129)");

        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
      }
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [stream, width, height]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg"
        style={{ height: `${height}px` }}
      />
    </div>
  );
}

