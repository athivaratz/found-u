"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagQrPrintProps {
  tagUrl: string;
  tagId: string;
  itemName: string;
  className?: string;
}

export default function TagQrPrint({ tagUrl, tagId, itemName, className }: TagQrPrintProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const absoluteUrl = tagUrl.startsWith("http")
      ? tagUrl
      : `${typeof window !== "undefined" ? window.location.origin : ""}${tagUrl}`;

    QRCode.toCanvas(canvasRef.current, absoluteUrl, {
      width: 200,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch(console.error);
  }, [tagUrl]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={cn("nfc-print-area", className)}>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 text-center print:border-0 print:shadow-none">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">BD2Fondue NFC</p>
        <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-1">{itemName}</h3>
        <p className="text-sm text-gray-500 mb-4">สแกนเมื่อพบของนี้</p>
        <canvas ref={canvasRef} className="mx-auto rounded-lg" />
        <p className="text-xs text-gray-400 mt-3 font-mono">{tagId}</p>
        <p className="text-xs text-gray-500 mt-2 break-all px-4">{tagUrl}</p>
      </div>

      <button
        type="button"
        onClick={handlePrint}
        className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 print:hidden"
      >
        <Printer className="w-5 h-5" />
        พิมพ์ QR Code
      </button>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .nfc-print-area,
          .nfc-print-area * {
            visibility: visible;
          }
          .nfc-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
