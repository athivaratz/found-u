import imageCompression from 'browser-image-compression';
import { ApiError, apiFetch, apiRequest } from '@/lib/api-client';
import {
  EDITOR_IMAGE_BYTES,
  MAX_IMAGE_BYTES,
  normalizeImageType,
} from '@/lib/storage/upload-backend';

// ========================================
// Image Compression
// ========================================

export interface CompressionOptions {
  maxSizeMB?: number;        // ขนาดไฟล์สูงสุด (default: 0.5MB)
  maxWidthOrHeight?: number; // ขนาดกว้าง/สูงสูงสุด (default: 1024px)
  useWebWorker?: boolean;    // ใช้ Web Worker (default: true)
  initialQuality?: number;   // คุณภาพ JPEG หลังบีบอัด (0–1)
}

/**
 * บีบอัดรูปภาพก่อนอัปโหลด
 * ใช้ browser-image-compression เพื่อลดขนาดไฟล์
 * ทำงานบน Client-side ไม่เปลือง Server
 */
export async function compressImage(
  file: File, 
  options?: CompressionOptions
): Promise<File> {
  const defaultOptions = {
    maxSizeMB: 0.5,
    maxWidthOrHeight: 1024,
    useWebWorker: true,
    fileType: "image/jpeg" as const,
    initialQuality: options?.initialQuality ?? 0.8,
  };

  try {
    const compressedFile = await imageCompression(file, {
      ...defaultOptions,
      ...options,
    });
    
    console.log(`📸 บีบอัดรูปจาก ${(file.size / 1024).toFixed(0)}KB เหลือ ${(compressedFile.size / 1024).toFixed(0)}KB`);
    
    return compressedFile;
  } catch (error) {
    console.error('Error compressing image:', error);
    // ถ้าบีบอัดไม่ได้ ให้ใช้ไฟล์เดิม
    return file;
  }
}

// ========================================
// Upload Functions
// ========================================

type Presign = {
  uploadUrl: string;
  publicUrl: string;
  path: string;
  contentType: string;
  contentLength: number;
};

type UploadPurpose = 'avatar' | 'found' | 'branding';

function purposeForPath(path: string): UploadPurpose {
  if (path.startsWith('avatars/')) return 'avatar';
  if (path.startsWith('found-items/')) return 'found';
  if (path.startsWith('settings/') || path.startsWith('branding/')) return 'branding';
  throw new Error('unsupported upload path');
}

function imageTypeOf(file: File): string {
  const type = normalizeImageType(file.type);
  if (!type) {
    throw new Error('รองรับเฉพาะไฟล์ jpeg, png, webp และ gif');
  }
  return type;
}

function assertSize(file: File, max: number, label: string): void {
  if (file.size < 1 || file.size > max) {
    throw new Error(label);
  }
}

// The browser sets Content-Length itself. Setting it from script is ignored,
// and the signature still requires the value we declared.
async function putPresigned(data: Presign, file: File): Promise<string> {
  if (file.size !== data.contentLength) {
    throw new Error('Failed to upload image');
  }
  const put = await fetch(data.uploadUrl, {
    method: 'PUT',
    mode: 'cors',
    credentials: 'omit',
    headers: { 'Content-Type': data.contentType },
    body: file,
  });
  if (!put.ok) {
    throw new Error('Failed to upload image');
  }
  return data.publicUrl;
}

async function readPresign(path: string, json: unknown): Promise<Presign> {
  try {
    return await apiFetch<Presign>(path, { method: 'POST', json });
  } catch (error) {
    if (error instanceof ApiError) {
      throw new Error(typeof error.payload.error === 'string' ? error.payload.error : error.code);
    }
    throw error;
  }
}

/**
 * ขอ URL ที่เซ็นแล้ว แล้ว PUT ตรงไปที่ R2
 * path ใช้แค่เลือกประเภท อัปโหลดจริงใช้คีย์ที่เซิร์ฟเวอร์สุ่ม
 */
export async function uploadImage(file: File, path: string): Promise<string> {
  const contentType = imageTypeOf(file);
  assertSize(file, MAX_IMAGE_BYTES, 'ไฟล์ใหญ่เกิน 10MB');
  const data = await readPresign('/api/storage/upload', {
    purpose: purposeForPath(path),
    contentType,
    contentLength: file.size,
  });
  return putPresigned(data, file);
}

/** รูปในตัวแก้ไขบล็อกหรือคู่มือ ไม่ส่งไฟล์ผ่าน PHP */
export async function uploadEditorImage(file: File, kind: 'blog' | 'help'): Promise<string> {
  const contentType = imageTypeOf(file);
  assertSize(file, EDITOR_IMAGE_BYTES, 'ไฟล์ใหญ่เกิน 5MB');
  const data = await readPresign(`/api/admin/${kind}/upload`, {
    contentType,
    contentLength: file.size,
  });
  return putPresigned(data, file);
}

/**
 * อัปโหลดรูปของเจอ พร้อมบีบอัดอัตโนมัติ
 */
export async function uploadFoundItemImage(
  file: File,
  itemId: string,
  compress: boolean = true,
  compressionOptions?: CompressionOptions
): Promise<string> {
  const fileToUpload = compress ? await compressImage(file, compressionOptions) : file;
  
  // itemId is only a hint. PHP names the object under the signed-in account.
  const extension = 'jpg';
  const path = `found-items/${itemId}/${Date.now()}.${extension}`;
  
  return uploadImage(fileToUpload, path);
}

/**
 * อัปโหลดรูป Avatar
 */
export async function uploadAvatar(
  file: File,
  userId: string
): Promise<string> {
  const compressedFile = await compressImage(file, {
    maxSizeMB: 0.2,         // Avatar เล็กลง 200KB
    maxWidthOrHeight: 256,  // 256x256
  });
  
  const path = `avatars/${userId}/${Date.now()}.jpg`;
  return uploadImage(compressedFile, path);
}

// ========================================
// Delete Functions
// ========================================

/**
 * ลบรูป
 */
async function deleteObject(body: { url?: string; path?: string }): Promise<void> {
  try {
    const response = await apiRequest('/api/storage/delete', {
      method: 'POST',
      json: body,
    });
    const data = (await response.json().catch(() => ({}))) as { deleteUrl?: string };
    if (!response.ok || typeof data.deleteUrl !== 'string') {
      console.error('Error deleting image:', response.status);
      return;
    }
    const removed = await fetch(data.deleteUrl, { method: 'DELETE', mode: 'cors', credentials: 'omit' });
    if (!removed.ok) {
      console.error('Error deleting image:', removed.status);
    }
  } catch (error) {
    console.error('Error deleting image:', error);
  }
}

export async function deleteImage(url: string): Promise<void> {
  await deleteObject({ url });
}

/**
 * ลบรูปจาก path
 */
export async function deleteImageByPath(path: string): Promise<void> {
  await deleteObject({ path });
}
