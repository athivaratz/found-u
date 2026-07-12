"use client";

import { Loader2 } from "lucide-react";

interface LoadingModalProps {
  isOpen: boolean;
  message?: string;
}

export function LoadingModal({ isOpen, message = "กำลังโหลด..." }: LoadingModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="overlay-modal fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loading-modal-title"
      aria-busy="true"
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 flex flex-col items-center shadow-xl max-w-sm w-full mx-4">
        <Loader2 className="w-10 h-10 text-[#06C755] animate-spin mb-4" aria-hidden />
        <p id="loading-modal-title" className="text-lg font-medium text-gray-900 dark:text-white">
          {message}
        </p>
      </div>
    </div>
  );
}
