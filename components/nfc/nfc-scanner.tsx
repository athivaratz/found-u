"use client";

import { useState } from "react";
import { Radio, Loader2, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { isWebNfcSupported, readNfcTag, getNfcErrorMessage } from "@/lib/nfc";

interface NfcScannerProps {
  onScan: (result: { tagId?: string; tagUid?: string; url?: string }) => void;
  onManualSubmit?: (tagId: string) => void;
  disabled?: boolean;
  className?: string;
  scanLabel?: string;
}

export default function NfcScanner({
  onScan,
  onManualSubmit,
  disabled,
  className,
  scanLabel = "สแกน NFC Tag",
}: NfcScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [manualId, setManualId] = useState("");
  const [showManual, setShowManual] = useState(false);

  const handleScan = async () => {
    if (!isWebNfcSupported()) {
      setError(getNfcErrorMessage(new Error("web_nfc_not_supported")));
      setShowManual(true);
      return;
    }

    setScanning(true);
    setError("");
    try {
      const result = await readNfcTag();
      onScan(result);
    } catch (err) {
      setError(getNfcErrorMessage(err));
    } finally {
      setScanning(false);
    }
  };

  const handleManual = (e: React.FormEvent) => {
    e.preventDefault();
    const id = manualId.trim().toUpperCase();
    if (!id) return;
    if (onManualSubmit) {
      onManualSubmit(id);
    } else {
      onScan({ tagId: id });
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <button
        type="button"
        onClick={handleScan}
        disabled={disabled || scanning}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-4 px-6 rounded-2xl font-medium transition-colors",
          "bg-[#06C755] text-white hover:bg-[#05b34d] disabled:opacity-50"
        )}
      >
        {scanning ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            กำลังสแกน... แตะแท็กที่โทรศัพท์
          </>
        ) : (
          <>
            <Radio className="w-5 h-5" />
            {scanLabel}
          </>
        )}
      </button>

      {!isWebNfcSupported() && (
        <p className="text-sm text-amber-600 dark:text-amber-400 text-center">
          Web NFC ใช้ได้บน Chrome/Android — iOS ให้สแกน QR หรือกรอกรหัส Tag
        </p>
      )}

      {error && <p className="text-sm text-red-500 text-center">{error}</p>}

      <button
        type="button"
        onClick={() => setShowManual((v) => !v)}
        className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <Keyboard className="w-4 h-4" />
        {showManual ? "ซ่อนการกรอกรหัส" : "กรอกรหัส Tag แทน"}
      </button>

      {showManual && (
        <form onSubmit={handleManual} className="flex gap-2">
          <input
            type="text"
            value={manualId}
            onChange={(e) => setManualId(e.target.value.toUpperCase())}
            placeholder="รหัส Tag เช่น ABC123XYZ789"
            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
            maxLength={16}
          />
          <button
            type="submit"
            className="px-4 py-3 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium"
          >
            ตกลง
          </button>
        </form>
      )}
    </div>
  );
}
