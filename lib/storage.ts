import imageCompression from 'browser-image-compression';

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

/**
 * อัปโหลดรูป
 */
export async function uploadImage(file: File, path: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', path);

  const response = await fetch('/api/storage/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to upload image through server API');
  }

  const data = await response.json();
  return data.publicUrl as string;
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
  
  const extension = 'jpg'; // บังคับใช้ jpg หลังบีบอัด
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
export async function deleteImage(url: string): Promise<void> {
  try {
    await fetch('/api/storage/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  } catch (error) {
    console.error('Error deleting image:', error);
  }
}

/**
 * ลบรูปจาก path
 */
export async function deleteImageByPath(path: string): Promise<void> {
  try {
    await fetch('/api/storage/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
  } catch (error) {
    console.error('Error deleting image:', error);
  }
}
