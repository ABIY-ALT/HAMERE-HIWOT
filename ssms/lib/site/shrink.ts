// ─────────────────────────────────────────────────────────────────────────────
// Makes a photo smaller in the browser before it is uploaded (client only):
// a large copy and a thumbnail, both JPEG. A phone photo of 4–5 MB becomes
// about 200–400 KB, so the website stays fast on mobile data and the free
// storage lasts. Drawing it again also drops the camera's hidden details
// (EXIF), such as the GPS location where it was taken.
// ─────────────────────────────────────────────────────────────────────────────

import { PHOTO_MAX_SIDE, THUMB_MAX_SIDE } from './media';

export interface ShrunkPhoto {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // Turns the picture upright by its EXIF orientation (phones store it sideways)
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // fall back to an <img> below
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(source: ImageBitmap | HTMLImageElement, maxSide: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const w0 = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h0 = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const width = Math.max(1, Math.round(w0 * scale));
  const height = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot prepare photos');
  // White behind see-through PNGs (JPEG has no transparency)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve({ blob, width, height }) : reject(new Error('Could not prepare the photo'))), 'image/jpeg', quality)
  );
}

/** The large copy and the thumbnail of one photo. Throws for a file the browser cannot read (e.g. HEIC outside Safari). */
export async function shrinkPhoto(file: File): Promise<ShrunkPhoto> {
  const source = await decode(file);
  try {
    const full = await draw(source, PHOTO_MAX_SIDE, 0.82);
    const thumb = await draw(source, THUMB_MAX_SIDE, 0.75);
    return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
  } finally {
    if ('close' in source) source.close();
  }
}
