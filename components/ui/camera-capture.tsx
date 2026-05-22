"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface CameraCaptureLabels {
  start: string;
  capture: string;
  retake: string;
  unavailable: string;
  idle: string;
}

interface CameraCaptureProps {
  previewUrl?: string | null;
  onCapture: (dataUrl: string, file: File) => void;
  onClear?: () => void;
  labels?: Partial<CameraCaptureLabels>;
  className?: string;
}

const DEFAULT_LABELS: CameraCaptureLabels = {
  start: "Start camera",
  capture: "Capture photo",
  retake: "Retake",
  unavailable: "Camera is not available",
  idle: "Camera is off",
};

export default function CameraCapture({
  previewUrl,
  onCapture,
  onClear,
  labels,
  className,
}: CameraCaptureProps) {
  const mergedLabels = { ...DEFAULT_LABELS, ...labels };
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    setStream(null);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (previewUrl) {
      stopCamera();
    }
  }, [previewUrl]);

  const startCamera = async () => {
    setIsStarting(true);
    setError(null);

    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      setStream(media);

      if (videoRef.current) {
        videoRef.current.srcObject = media;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error("Failed to start camera", err);
      setError(mergedLabels.unavailable);
    } finally {
      setIsStarting(false);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `capture-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        onCapture(dataUrl, file);
        stopCamera();
      },
      "image/jpeg",
      0.92
    );
  };

  if (previewUrl) {
    return (
      <div className={cn("space-y-3", className)}>
        <div className="relative rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-700">
          <img src={previewUrl} alt="Captured" className="w-full h-56 object-cover" />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClear}
            className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium"
          >
            {mergedLabels.retake}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-700">
        {stream ? (
          <video ref={videoRef} className="w-full h-56 object-cover" playsInline muted />
        ) : (
          <div className="w-full h-56 flex flex-col items-center justify-center text-gray-500 dark:text-gray-300 gap-2">
            <VideoOff className="w-6 h-6" />
            <span className="text-sm">{error || mergedLabels.idle}</span>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        {!stream ? (
          <button
            type="button"
            onClick={startCamera}
            disabled={isStarting}
            className="flex-1 py-3 rounded-xl bg-[#06C755] text-white font-medium flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Camera className="w-4 h-4" />
            {mergedLabels.start}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={capturePhoto}
              className="flex-1 py-3 rounded-xl bg-[#06C755] text-white font-medium flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" />
              {mergedLabels.capture}
            </button>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setError(null);
              }}
              className="px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
