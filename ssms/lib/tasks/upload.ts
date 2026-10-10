'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Uploading task files from the browser. Phone photos are made smaller first
// (longest side 1600 px, JPEG) so they upload quickly on mobile data and stay
// well under the size limit.
// ─────────────────────────────────────────────────────────────────────────────

import { uploadTaskFile } from '@/app/dashboard/tasks/actions';
import { FILE_TYPES, MAX_FILE_BYTES } from './types';

const MAX_SIDE = 1600;

async function shrinkPhoto(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** A reason the file cannot be attached, or '' when it is fine (checked again on the server). */
export function fileProblem(file: File, t: (en: string, am: string) => string): string {
  if (!FILE_TYPES[file.type]) return t(`${file.name}: only photos, PDF, Word and Excel files`, `${file.name}: ፎቶ፣ PDF፣ Word እና Excel ብቻ`);
  // Photos are shrunk before upload, so only other files are limited here
  if (!file.type.startsWith('image/') && file.size > MAX_FILE_BYTES) {
    return t(`${file.name} is larger than 5 MB`, `${file.name} ከ5 MB በላይ ነው`);
  }
  return '';
}

/** Uploads the files one by one; returns the names of those that failed, with why. */
export async function uploadFiles(taskId: string, updateId: string | null, files: File[]): Promise<string[]> {
  const failed: string[] = [];
  for (const original of files) {
    const file = await shrinkPhoto(original);
    const form = new FormData();
    form.set('task_id', taskId);
    if (updateId) form.set('update_id', updateId);
    form.set('file', file);
    try {
      const res = await uploadTaskFile(form);
      if (!res.ok) failed.push(res.error);
    } catch {
      failed.push(`${original.name}: upload failed — check the connection`);
    }
  }
  return failed;
}
