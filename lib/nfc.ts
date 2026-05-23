/** Web NFC helpers — Chrome Android + HTTPS only */

export interface NfcScanResult {
  tagUid?: string;
  url?: string;
  tagId?: string;
}

declare global {
  interface Window {
    NDEFReader?: new () => NdefReader;
  }
}

interface NdefReader {
  scan: (options?: { signal?: AbortSignal }) => Promise<void>;
  write: (message: { records: NdefRecordInit[] }) => Promise<void>;
  makeReadOnly: () => Promise<void>;
  addEventListener: (
    type: "reading" | "readingerror",
    listener: (event: NdefReadingEvent) => void
  ) => void;
  removeEventListener: (
    type: "reading" | "readingerror",
    listener: (event: NdefReadingEvent) => void
  ) => void;
}

interface NdefRecordInit {
  recordType: string;
  data: string | BufferSource;
  mediaType?: string;
  id?: string;
}

interface NdefReadingEvent extends Event {
  serialNumber?: string;
  message: {
    records: Array<{
      recordType: string;
      data: DataView;
      toString?: () => string;
    }>;
  };
}

export function isWebNfcSupported(): boolean {
  return typeof window !== "undefined" && "NDEFReader" in window;
}

export function buildTagUrl(tagId: string, baseUrl?: string): string {
  const base = (baseUrl || (typeof window !== "undefined" ? window.location.origin : "")).replace(
    /\/$/,
    ""
  );
  return `${base}/nfc/t/${tagId.toUpperCase()}`;
}

export function extractTagIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : undefined);
    const match = parsed.pathname.match(/\/nfc\/t\/([A-Za-z0-9]+)/i);
    return match ? match[1].toUpperCase() : null;
  } catch {
    const match = url.match(/\/nfc\/t\/([A-Za-z0-9]+)/i);
    return match ? match[1].toUpperCase() : null;
  }
}

function decodeNdefRecord(record: NdefReadingEvent["message"]["records"][0]): string | null {
  if (record.recordType === "url") {
    const data = record.data;
    const decoder = new TextDecoder();
    const full = decoder.decode(data);
    // URL record: first byte is prefix code, rest is URL suffix
    const prefixCodes: Record<number, string> = {
      0: "",
      1: "http://www.",
      2: "https://www.",
      3: "http://",
      4: "https://",
    };
    const code = data.getUint8(0);
    const suffix = full.slice(1) || decoder.decode(data.buffer.slice(data.byteOffset + 1));
    return (prefixCodes[code] || "") + suffix;
  }
  if (record.recordType === "text") {
    return new TextDecoder().decode(record.data);
  }
  return null;
}

export function readNfcTag(timeoutMs = 15000): Promise<NfcScanResult> {
  return new Promise((resolve, reject) => {
    if (!isWebNfcSupported() || !window.NDEFReader) {
      reject(new Error("web_nfc_not_supported"));
      return;
    }

    const reader = new window.NDEFReader();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error("scan_timeout"));
    }, timeoutMs);

    const onReading = (event: NdefReadingEvent) => {
      clearTimeout(timer);
      reader.removeEventListener("reading", onReading);
      reader.removeEventListener("readingerror", onError);

      let url: string | undefined;
      for (const record of event.message.records) {
        const decoded = decodeNdefRecord(record);
        if (decoded && (decoded.startsWith("http") || decoded.includes("/nfc/t/"))) {
          url = decoded.startsWith("http") ? decoded : undefined;
          if (!url && decoded.includes("/nfc/t/")) {
            url = decoded;
          }
        }
      }

      const tagId = url ? extractTagIdFromUrl(url) || undefined : undefined;
      resolve({
        tagUid: event.serialNumber,
        url,
        tagId,
      });
    };

    const onError = () => {
      clearTimeout(timer);
      reader.removeEventListener("reading", onReading);
      reader.removeEventListener("readingerror", onError);
      reject(new Error("scan_failed"));
    };

    reader.addEventListener("reading", onReading);
    reader.addEventListener("readingerror", onError);

    reader.scan({ signal: controller.signal }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function writeTagUrl(
  url: string,
  options: { makeReadOnly?: boolean } = {}
): Promise<void> {
  if (!isWebNfcSupported() || !window.NDEFReader) {
    throw new Error("web_nfc_not_supported");
  }

  const reader = new window.NDEFReader();
  await reader.write({
    records: [{ recordType: "url", data: url }],
  });

  if (options.makeReadOnly) {
    await reader.makeReadOnly();
  }
}

export function getNfcErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  switch (code) {
    case "web_nfc_not_supported":
      return "อุปกรณ์นี้ไม่รองรับ Web NFC ใช้สแกน QR Code หรือกรอกรหัส Tag แทน (iOS/Safari)";
    case "scan_timeout":
      return "หมดเวลาสแกน กรุณาลองใหม่";
    case "scan_failed":
      return "สแกนไม่สำเร็จ กรุณาลองใหม่";
    default:
      return "เกิดข้อผิดพลาดในการสแกน NFC";
  }
}
