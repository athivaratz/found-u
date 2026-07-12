"use client";

import { useEffect, useCallback } from "react";
import { X, Mic } from "lucide-react";
import { m, AnimatePresence } from "framer-motion";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { thaiCopy } from "@/lib/copy/thai-student";
import { cn } from "@/lib/utils";

type VoiceSphereOverlayProps = {
  open: boolean;
  onClose: () => void;
  onTranscript: (text: string) => void;
};

export function VoiceSphereOverlay({ open, onClose, onTranscript }: VoiceSphereOverlayProps) {
  const handleFinalTranscript = useCallback(
    (text: string) => {
      if (text.trim()) onTranscript(text.trim());
    },
    [onTranscript]
  );

  const { isListening, transcript, isSupported, start, stop, error } = useVoiceInput({
    onFinalTranscript: handleFinalTranscript,
  });

  useEffect(() => {
    if (open && isSupported) {
      void start();
    } else {
      stop();
    }
    return () => stop();
  }, [open, isSupported, start, stop]);

  return (
    <AnimatePresence>
      {open ? (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal="true"
          aria-label="โหมดเสียง"
        >
          <m.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md rounded-2xl bg-bg-primary border border-border-light p-5 shadow-md"
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold text-text-primary">พูดถามได้เลย</h2>
                <p className="text-sm text-text-secondary mt-0.5">
                  {isSupported
                    ? isListening
                      ? thaiCopy.voice.listening
                      : thaiCopy.voice.tapToSpeak
                    : thaiCopy.voice.notSupported}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/30"
                aria-label={thaiCopy.voice.close}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isSupported ? (
              <>
                <div className="flex flex-col items-center py-4">
                  <div
                    className={cn(
                      "agent-avatar w-20 h-20 mb-4",
                      isListening && "ring-2 ring-line-green/40 ring-offset-2 ring-offset-bg-primary"
                    )}
                    aria-hidden
                  >
                    <Mic className="w-9 h-9" strokeWidth={2} />
                  </div>
                  {transcript ? (
                    <p className="text-center text-text-primary text-base leading-relaxed px-2">
                      {transcript}
                    </p>
                  ) : (
                    <p className="text-sm text-text-tertiary text-center">
                      พูดชื่อสิ่งของ สถานที่ หรือรหัสติดตาม
                    </p>
                  )}
                  {error ? (
                    <p className="mt-3 text-sm text-status-error text-center">{error}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3 rounded-full bg-bg-tertiary text-text-primary font-medium hover:bg-border-light transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/30"
                >
                  ปิด
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 rounded-full bg-line-green text-white font-medium hover:bg-line-green-hover transition-colors"
              >
                ปิด
              </button>
            )}
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
