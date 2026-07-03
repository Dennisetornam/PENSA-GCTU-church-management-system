// Shared image validation for R2 uploads (profile photos, finance references).

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Derived R2 key of an image's thumbnail (inserts ".thumb" before the extension). */
export function thumbKeyOf(key: string): string {
  return key.replace(/(\.[^./]+)$/, ".thumb$1");
}

/** Sniff a supported image type from magic bytes. Returns null if unsupported. */
export function detectImage(buf: Uint8Array): { type: string; ext: string } | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return { type: "image/png", ext: "png" };
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  )
    return { type: "image/webp", ext: "webp" };
  return null;
}
