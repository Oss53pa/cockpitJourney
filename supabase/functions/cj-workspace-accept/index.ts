// cj-workspace-accept — Accepter une invitation d'espace partagé.
// =====================================================================
// Fonction AUTHENTIFIÉE (verify_jwt). L'appelant (l'invité connecté) consomme
// le token : on lie son compte à l'appartenance (status -> active) et on crée
// SON profil dans le namespace du PROPRIÉTAIRE (pour apparaître dans la liste
// des membres / assignés). Renvoie l'id du propriétaire = id d'espace.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};
function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

const PALETTE = ['#6E8B58', '#8AA6C4', '#C48A8A', '#B0954E', '#7E8AA6', '#5FA38B', '#C49A6C'];

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'C'
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'server misconfigured' });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return json(401, { error: 'auth requise' });
  const { data: cd, error: ce } = await sb.auth.getUser(jwt);
  const caller = cd?.user;
  if (ce || !caller) return json(401, { error: 'jeton invalide' });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'json invalide' });
  }
  const token = String(body.token ?? '').trim();
  if (!token) return json(400, { error: 'token manquant' });

  const { data: mRow } = await sb
    .from('cj_workspace_members')
    .select('id, owner_auth_user_id, member_auth_user_id, member_profile_id, role, status, invitee_email')
    .eq('token', token)
    .maybeSingle();
  if (!mRow) return json(404, { error: 'invitation introuvable' });
  const m = mRow as Record<string, unknown>;
  if (m.status === 'revoked') return json(403, { error: 'invitation révoquée' });
  if (m.member_auth_user_id && m.member_auth_user_id !== caller.id) {
    return json(403, { error: 'cette invitation a déjà été acceptée par un autre compte' });
  }

  const ownerId = String(m.owner_auth_user_id);
  let profileId = (m.member_profile_id as string) ?? null;

  // Crée le profil du membre dans le namespace du propriétaire (une seule fois).
  if (!profileId) {
    profileId = `u_${crypto.randomUUID().slice(0, 8)}`;
    const name =
      (caller.user_metadata?.full_name as string) ||
      (caller.email ? caller.email.split('@')[0] : 'Collaborateur');
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const profile = {
      id: profileId,
      name,
      initials: initialsOf(name),
      email: caller.email ?? String(m.invitee_email ?? ''),
      role: 'Collaborateur',
      color,
    };
    const { error: pErr } = await sb.from('cj_profiles').insert({
      id: profileId,
      auth_user_id: ownerId,
      data: profile,
    });
    if (pErr) return json(500, { error: 'création du profil échouée', details: pErr.message });
  }

  const { error: uErr } = await sb
    .from('cj_workspace_members')
    .update({
      member_auth_user_id: caller.id,
      member_profile_id: profileId,
      status: 'active',
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', m.id as string);
  if (uErr) return json(500, { error: 'activation échouée', details: uErr.message });

  return json(200, { success: true, ownerId, role: m.role, profileId });
});
