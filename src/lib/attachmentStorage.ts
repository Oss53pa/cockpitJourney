// Task attachments — Supabase Storage helpers (private bucket `cj-attachments`).
//
// Mirrors budgetStorage: objects live under `<auth.uid()>/tasks/<taskId>/…`,
// the leading auth-uid folder is what the bucket RLS keys on. Private bucket →
// reads happen through short-lived signed URLs.

import { supabase } from './supabase';
import { getCurrentAuthUserId } from './repo';
import type { Attachment } from '../stores/appStore';

const BUCKET = 'cj-attachments';

function safeFilename(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned || 'fichier';
}

/** Map a File to one of the app's attachment kinds (drives the card icon). */
export function attachmentKind(file: File): Attachment['kind'] {
  const t = file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (t.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(ext))
    return 'img';
  if (t === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (t === 'text/csv' || ext === 'csv') return 'csv';
  return 'doc';
}

/** Human-readable file size. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Upload a real file for a task; returns the metadata to persist. */
export async function uploadTaskFile(
  taskId: string,
  file: File
): Promise<{ path: string; name: string; size: string; kind: Attachment['kind'] }> {
  const authUserId = getCurrentAuthUserId();
  if (!authUserId) throw new Error('Utilisateur non authentifié.');
  const path = `${authUserId}/tasks/${taskId}/${Date.now()}-${safeFilename(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  return { path, name: file.name, size: formatSize(file.size), kind: attachmentKind(file) };
}

/** Short-lived (1h) signed URL to open/download a stored object. */
export async function signedAttachmentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Remove the stored object (best-effort — resolves even if already gone). */
export async function removeAttachmentFile(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}
