// Downscale + re-encode an image in the browser before upload, so stored files
// are small and load fast. Returns a JPEG Blob (falls back to the original on
// any failure). EXIF orientation is honoured so phone photos aren't rotated.
export async function resizeImage(file: File, maxEdge: number, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const src = await loadBitmap(file);
    const isBitmap = typeof ImageBitmap !== "undefined" && src instanceof ImageBitmap;
    const w0 = isBitmap ? (src as ImageBitmap).width : (src as HTMLImageElement).naturalWidth;
    const h0 = isBitmap ? (src as ImageBitmap).height : (src as HTMLImageElement).naturalHeight;
    const scale = Math.min(1, maxEdge / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(src as CanvasImageSource, 0, 0, w, h);
    if ("close" in src && typeof (src as ImageBitmap).close === "function") (src as ImageBitmap).close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Resize and wrap as a File so it can go straight to api.upload / FormData. */
export async function resizeToFile(file: File, maxEdge: number, quality = 0.85, name = "upload.jpg"): Promise<File> {
  const blob = await resizeImage(file, maxEdge, quality);
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
