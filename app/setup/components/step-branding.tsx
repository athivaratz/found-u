"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { compressImage } from "@/lib/storage";

export type BrandingDraft = {
  schoolName: string;
  logoPreviewUrl?: string;
  existingLogoUrl?: string;
};

type StepBrandingProps = {
  initial: BrandingDraft;
  onChange: (draft: BrandingDraft) => void;
  error?: string | null;
};

export function StepBranding({ initial, onChange, error }: StepBrandingProps) {
  const [schoolName, setSchoolName] = useState(initial.schoolName);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(initial.logoPreviewUrl);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    onChange({
      schoolName,
      logoPreviewUrl,
      existingLogoUrl: initial.existingLogoUrl,
    });
  }, [schoolName, logoPreviewUrl, initial.existingLogoUrl, onChange]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  async function handleFileChange(file: File | null) {
    if (!file) return;
    const compressed = await compressImage(file, { maxSizeMB: 0.8, maxWidthOrHeight: 512 });
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(compressed);
    objectUrlRef.current = url;
    setLogoPreviewUrl(url);
    setLogoFile(compressed);
  }

  const preview = logoPreviewUrl || initial.existingLogoUrl;

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-text-primary">ข้อมูลโรงเรียน</h2>

      <div>
        <label className="block text-sm font-medium mb-1">ชื่อโรงเรียน</label>
        <input
          type="text"
          value={schoolName}
          onChange={(e) => setSchoolName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-border-light"
          placeholder="โรงเรียนตัวอย่าง"
          autoFocus
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">โลโก้โรงเรียน (ไม่บังคับ)</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void handleFileChange(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-3 rounded-xl border border-dashed border-border-light text-sm text-text-secondary hover:bg-bg-secondary"
        >
          เลือกรูปโลโก้
        </button>
        {preview ? (
          <div className="mt-3 flex items-center gap-3">
            <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-border-light bg-bg-secondary">
              <Image src={preview} alt="โลโก้" fill className="object-contain p-1" unoptimized />
            </div>
            <div className="text-sm text-text-secondary">
              <p className="font-medium text-text-primary">ตัวอย่าง</p>
              <p>{schoolName || "ชื่อโรงเรียน"}</p>
            </div>
          </div>
        ) : null}
        <input type="hidden" name="logoFileReady" value={logoFile ? "1" : "0"} />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {/* Expose file for parent form submission via ref pattern in wizard */}
      <BrandingFileBridge file={logoFile} />
    </div>
  );
}

let brandingFileRef: File | null = null;

function BrandingFileBridge({ file }: { file: File | null }) {
  useEffect(() => {
    brandingFileRef = file;
  }, [file]);
  return null;
}

export function getBrandingLogoFile(): File | null {
  return brandingFileRef;
}
