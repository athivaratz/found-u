const MAX_LOGO_BYTES = 5 * 1024 * 1024;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const WEBP_MAGIC = [0x52, 0x49, 0x46, 0x46];

function matchesMagic(buffer: Uint8Array, magic: number[]): boolean {
  return magic.every((byte, index) => buffer[index] === byte);
}

export function detectImageMime(buffer: Uint8Array): string | null {
  if (matchesMagic(buffer, PNG_MAGIC)) return "image/png";
  if (matchesMagic(buffer, JPEG_MAGIC)) return "image/jpeg";
  if (
    matchesMagic(buffer, WEBP_MAGIC) &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export async function validateLogoFile(file: File): Promise<{ mime: string; ext: string }> {
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("โลโก้ต้องมีขนาดไม่เกิน 5MB");
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const mime = detectImageMime(buffer);
  if (!mime) {
    throw new Error("รูปโลโก้ต้องเป็น JPEG, PNG หรือ WebP");
  }

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return { mime, ext };
}

export function isAllowedBrandingLogoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const supabaseBase = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
    if (!supabaseBase) return false;
    const supabaseHost = new URL(supabaseBase).host;
    if (parsed.host !== supabaseHost) return false;
    return parsed.pathname.includes("/storage/v1/object/public/school-branding/");
  } catch {
    return false;
  }
}
