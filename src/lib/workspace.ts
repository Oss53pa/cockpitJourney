// Espace partagé (multi-utilisateurs) — client.
// ===================================================================
// Le propriétaire gère ses membres directement via la table
// cj_workspace_members (RLS owner). L'envoi d'e-mail et l'acceptation
// passent par les edge functions authentifiées cj-workspace-invite /
// cj-workspace-accept (qui valident la propriété / le token côté serveur).

import { supabase } from './supabase';
import { getCurrentAuthUserId } from './repo';

export type WorkspaceRole = 'admin' | 'editor' | 'viewer';

export interface WorkspaceMember {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: 'pending' | 'active' | 'revoked';
  memberLinked: boolean;
  createdAt: string;
  acceptedAt: string | null;
}

// Tous les appels supabase-js ci-dessous attendent le verrou auth
// cross-onglet (navigator.locks) pour rattacher l'access token. Un onglet
// sibling figé (PWA installée, fenêtre en arrière-plan suspendue) qui
// détient ce verrou peut hanger la modale indéfiniment — d'où le timeout.
const AUTH_TIMEOUT_MS = 8_000;
const TIMEOUT_MSG = 'Délai dépassé — fermez les autres onglets CockpitJourney et réessayez.';

function withTimeout<T>(p: PromiseLike<T>, message = TIMEOUT_MSG): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), AUTH_TIMEOUT_MS);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

function rowToMember(r: Record<string, unknown>): WorkspaceMember {
  return {
    id: String(r.id),
    email: String(r.invitee_email),
    role: r.role as WorkspaceRole,
    status: r.status as WorkspaceMember['status'],
    memberLinked: !!r.member_auth_user_id,
    createdAt: String(r.created_at),
    acceptedAt: (r.accepted_at as string) ?? null,
  };
}

/** Membres de MON espace (je suis le propriétaire). */
export async function listMembers(): Promise<WorkspaceMember[]> {
  // L'app connaît déjà l'utilisateur signé in — évite getUser() qui
  // passe par le verrou auth ET un round-trip réseau.
  let uid = getCurrentAuthUserId();
  if (!uid) {
    const { data } = await withTimeout(supabase.auth.getSession());
    uid = data.session?.user?.id ?? null;
  }
  if (!uid) throw new Error('Session expirée.');
  const { data, error } = await withTimeout(
    supabase
      .from('cj_workspace_members')
      .select('*')
      .eq('owner_auth_user_id', uid)
      .order('created_at', { ascending: true })
  );
  if (error) throw error;
  return (data ?? []).map((r) => rowToMember(r as Record<string, unknown>));
}

/** Inviter un collaborateur dans MON espace (e-mail via edge function). */
export async function inviteMember(input: {
  email: string;
  fullName?: string;
  role: WorkspaceRole;
}): Promise<{ emailSent: boolean; link?: string; emailError?: string }> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke('cj-workspace-invite', {
      body: {
        email: input.email,
        full_name: input.fullName,
        role: input.role,
        appUrl: window.location.origin,
      },
    })
  );
  if (error) throw error;
  const d = (data ?? {}) as {
    success?: boolean;
    emailSent?: boolean;
    link?: string;
    error?: string;
    note?: string;
  };
  // Resend rejected the e-mail (no API key, domain not verified, network…)
  // but the workspace_members row is already created server-side, so the
  // link is valid. Surface it instead of throwing — the modal can offer
  // copy-and-paste as a fallback.
  if (d.success === false && d.link) {
    return { emailSent: false, link: d.link, emailError: d.error || d.note };
  }
  if (d.success === false) throw new Error(d.error || 'Échec de l’invitation');
  return { emailSent: !!d.emailSent, link: d.link };
}

export async function changeMemberRole(id: string, role: WorkspaceRole): Promise<void> {
  const { error } = await withTimeout(
    supabase.from('cj_workspace_members').update({ role, updated_at: new Date().toISOString() }).eq('id', id)
  );
  if (error) throw error;
}

export async function revokeMember(id: string): Promise<void> {
  const { error } = await withTimeout(
    supabase
      .from('cj_workspace_members')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', id)
  );
  if (error) throw error;
}

export async function reactivateMember(id: string): Promise<void> {
  const { error } = await withTimeout(
    supabase
      .from('cj_workspace_members')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', id)
  );
  if (error) throw error;
}

/** Accepter une invitation (l'invité connecté consomme le token). */
export async function acceptWorkspaceInvite(token: string): Promise<{ ownerId: string }> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke('cj-workspace-accept', {
      body: { token },
    })
  );
  if (error) throw error;
  const d = (data ?? {}) as { success?: boolean; ownerId?: string; error?: string };
  if (!d.success || !d.ownerId) throw new Error(d.error || 'Acceptation impossible');
  return { ownerId: d.ownerId };
}
