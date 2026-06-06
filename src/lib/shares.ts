// Liens de partage participant — côté propriétaire.
// ===================================================================
// Création / liste / révocation des liens de partage d'UN projet ou
// d'UNE tâche. Écrit directement dans `cj_shares` via le client Supabase
// authentifié (RLS : auth_user_id = auth.uid()). L'accès du PARTICIPANT,
// lui, passe par l'edge function `cj-share` (voir participantClient.ts).

import { supabase } from './supabase';
import { getCurrentAuthUserId, getCurrentProfileId } from './repo';

export type ShareResourceType = 'project' | 'task';
export type SharePermission = 'view' | 'contribute';

export interface Share {
  id: string;
  token: string;
  resourceType: ShareResourceType;
  resourceId: string;
  permission: SharePermission;
  label: string | null;
  inviteeEmail: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
  createdAt: string;
}

/** URL-safe random token (~32 chars, base62). */
function genToken(len = 32): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

const uid = (prefix = 'sh') => `${prefix}_${genToken(10)}`;

/** Public participant URL for a token. */
export function buildShareUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/p/${token}`;
}

function rowToShare(r: Record<string, unknown>): Share {
  return {
    id: String(r.id),
    token: String(r.token),
    resourceType: r.resource_type as ShareResourceType,
    resourceId: String(r.resource_id),
    permission: r.permission as SharePermission,
    label: (r.label as string) ?? null,
    inviteeEmail: (r.invitee_email as string) ?? null,
    revokedAt: (r.revoked_at as string) ?? null,
    expiresAt: (r.expires_at as string) ?? null,
    lastAccessedAt: (r.last_accessed_at as string) ?? null,
    accessCount: Number(r.access_count) || 0,
    createdAt: String(r.created_at),
  };
}

export async function createShare(input: {
  resourceType: ShareResourceType;
  resourceId: string;
  permission?: SharePermission;
  label?: string;
  email?: string;
}): Promise<{ share: Share; url: string }> {
  const authUserId = getCurrentAuthUserId();
  if (!authUserId) throw new Error('Session expirée — reconnectez-vous.');
  const token = genToken(32);
  const now = new Date().toISOString();
  const row = {
    id: uid(),
    token,
    auth_user_id: authUserId,
    owner_profile_id: getCurrentProfileId(),
    resource_type: input.resourceType,
    resource_id: input.resourceId,
    permission: input.permission ?? 'contribute',
    label: input.label?.trim() || null,
    invitee_email: input.email?.trim().toLowerCase() || null,
    access_count: 0,
    data: {},
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await supabase.from('cj_shares').insert(row).select().maybeSingle();
  if (error) throw error;
  return { share: rowToShare((data as Record<string, unknown>) ?? row), url: buildShareUrl(token) };
}

export async function listShares(resourceType: ShareResourceType, resourceId: string): Promise<Share[]> {
  const { data, error } = await supabase
    .from('cj_shares')
    .select('*')
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToShare(r as Record<string, unknown>));
}

export async function revokeShare(id: string): Promise<void> {
  const { error } = await supabase
    .from('cj_shares')
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export function isShareActive(s: Share): boolean {
  if (s.revokedAt) return false;
  if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) return false;
  return true;
}
