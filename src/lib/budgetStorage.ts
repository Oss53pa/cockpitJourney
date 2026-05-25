// Budget attachments — Supabase Storage helpers.
//
// Files live in the PRIVATE bucket `cj-budget`. Its RLS policy only lets a
// user touch objects whose FIRST path folder equals their `auth.uid()`, so
// every object path MUST be prefixed with the auth user id. We mirror the
// per-project / per-entity layout below so a user can browse their own
// files coherently and so RLS stays satisfied.

import { supabase } from './supabase';
import { getCurrentAuthUserId } from './repo';
import type { BudgetAttachment } from '../types';

const BUCKET = 'cj-budget';

const uid = (prefix = 'att') => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

/**
 * Sanitize a user-supplied filename so it's safe to embed in a storage key:
 * keep letters/digits/dot/dash/underscore, collapse everything else to `-`.
 */
function safeFilename(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned || 'fichier';
}

/**
 * Upload a file to `cj-budget` for a given project entity (line or expense)
 * and return the {@link BudgetAttachment} metadata to persist on the entity.
 *
 * Path: `<authUserId>/<projectId>/<kind>-<entityId>/<timestamp>-<safeName>`
 * — the leading auth-uid folder is what the bucket RLS keys on.
 *
 * Throws if the user is unauthenticated or the upload fails.
 */
export async function uploadBudgetFile(opts: {
  projectId: string;
  kind: 'line' | 'expense';
  entityId: string;
  file: File;
}): Promise<BudgetAttachment> {
  const authUserId = getCurrentAuthUserId();
  if (!authUserId) {
    throw new Error('Utilisateur non authentifié.');
  }
  const { projectId, kind, entityId, file } = opts;
  const safeName = safeFilename(file.name);
  const path = `${authUserId}/${projectId}/${kind}-${entityId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;

  return {
    id: uid(),
    name: file.name,
    path,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
}

/**
 * Mint a short-lived (1h) signed URL for a stored object, or `null` if the
 * object can't be signed (deleted, RLS denied…).
 */
export async function signedBudgetUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Remove a stored object. Resolves even if it was already gone. */
export async function removeBudgetFile(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}
