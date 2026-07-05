"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X } from "lucide-react";
import { m, AnimatePresence } from "framer-motion";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { thaiCopy } from "@/lib/copy/thai-student";

type VoiceSphereOverlayProps = {
  open: boolean;
  onClose: () => void;
  onTranscript: (text: string) => void;
};

export function VoiceSphereOverlay({ open, onClose, onTranscript }: VoiceSphereOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [amplitude, setAmplitude] = useState(0);

  const handleFinalTranscript = useCallback(
    (text: string) => {
      if (text.trim()) onTranscript(text.trim());
    },
    [onTranscript]
  );

  const { isListening, transcript, isSupported, start, stop, error } = useVoiceInput({
    onFinalTranscript: handleFinalTranscript,
    onAmplitude: setAmplitude,
  });

  useEffect(() => {
    if (open && isSupported) {
      void start();
    } else {
      stop();
    }
    return () => stop();
  }, [open, isSupported, start, stop]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !open) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame: number;
    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const baseR = Math.min(width, height) * 0.22;
      const r = baseR + amplitude * 40;

      const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      grad.addColorStop(0, "rgba(6, 199, 85, 0.9)");
      grad.addColorStop(0.6, "rgba(16, 185, 129, 0.4)");
      grad.addColorStop(1, "rgba(6, 199, 85, 0)");

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [open, amplitude]);

  return (
    <AnimatePresence>
      {open && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-gradient-to-b from-[#0a0a0a] via-[#111] to-[#0a0a0a] flex flex-col items-center justify-center"
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
            aria-label={thaiCopy.voice.close}
          >
            <X className="w-6 h-6" />
          </button>

          {!isSupported ? (
            <p className="text-white/70 px-6 text-center">{thaiCopy.voice.notSupported}</p>
          ) : (
            <>
              <canvas ref={canvasRef} width={320} height={320} className="w-80 h-80" />
              <p className="mt-6 text-white/50 text-sm">
                {isListening ? thaiCopy.voice.listening : thaiCopy.voice.tapToSpeak}
              </p>
              {transcript ? (
                <p className="mt-4 text-white/90 text-center max-w-md px-6 text-lg">{transcript}</p>
              ) : null}
              {error ? <p className="mt-2 text-status-error text-sm">{error}</p> : null}
            </>
          )}
        </m.div>
      )}
    </AnimatePresence>
  );
}
