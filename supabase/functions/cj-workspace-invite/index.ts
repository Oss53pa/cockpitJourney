// cj-workspace-invite — Inviter un collaborateur dans SON cockpit partagé.
// =====================================================================
// Fonction AUTHENTIFIÉE (verify_jwt). L'appelant devient le PROPRIÉTAIRE de
// l'espace (owner_auth_user_id = lui). On crée/maj une appartenance `pending`
// dans cj_workspace_members et on envoie le lien d'acceptation par e-mail.
// L'accès aux données est porté par cj_workspace_members (RLS), indépendamment
// des licences Atlas.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM =
  Deno.env.get('RESEND_FROM_COCKPITJOURNEY') ??
  Deno.env.get('RESEND_FROM_COCKPIT') ??
  'CockpitJourney <notifications.cockpitjourney@atlas-studio.org>';

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

const ASSIGNABLE = new Set(['admin', 'editor', 'viewer']);

function genToken(len = 36): string {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(len)), (v) => a[v % a.length]).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'server misconfigured' });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { error: 'auth requise' });
  const { data: cd, error: ce } = await sb.auth.getUser(token);
  const caller = cd?.user;
  if (ce || !caller) return json(401, { error: 'jeton invalide' });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'json invalide' });
  }
  const email = String(body.email ?? '').trim().toLowerCase();
  const fullName = body.full_name ? String(body.full_name) : null;
  const role = String(body.role ?? 'editor');
  const appUrl = String(body.appUrl ?? '').replace(/\/$/, '');
  if (!email || !appUrl) return json(400, { error: 'champs requis : email, appUrl' });
  if (!ASSIGNABLE.has(role)) return json(400, { error: `rôle invalide : ${role}` });
  if (email === (caller.email ?? '').toLowerCase())
    return json(400, { error: 'Vous ne pouvez pas vous inviter vous-même.' });

  const now = new Date().toISOString();
  const linkToken = genToken();

  // Upsert (clé owner + email). On régénère un token à chaque (ré)invitation.
  const { data: existing } = await sb
    .from('cj_workspace_members')
    .select('id, status')
    .eq('owner_auth_user_id', caller.id)
    .ilike('invitee_email', email)
    .maybeSingle();

  if (existing) {
    await sb
      .from('cj_workspace_members')
      .update({ role, token: linkToken, status: 'pending', invited_by: caller.id, updated_at: now })
      .eq('id', (existing as { id: string }).id);
  } else {
    await sb.from('cj_workspace_members').insert({
      owner_auth_user_id: caller.id,
      invitee_email: email,
      role,
      status: 'pending',
      token: linkToken,
      invited_by: caller.id,
      created_at: now,
      updated_at: now,
    });
  }

  const link = `${appUrl}/workspace/accept?token=${encodeURIComponent(linkToken)}`;

  if (!RESEND_API_KEY) {
    return json(200, { success: true, emailSent: false, link, note: 'RESEND_API_KEY absent.' });
  }
  const inviterName = caller.user_metadata?.full_name || caller.email || 'Un collaborateur';
  const html = inviteHtml({ inviterName: String(inviterName), name: fullName ?? email, link, role });
  let status = 0;
  // deno-lint-ignore no-explicit-any
  let resBody: any = {};
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [fullName ? `${fullName} <${email}>` : email],
        subject: `${inviterName} vous invite à collaborer sur CockpitJourney`,
        html,
        reply_to: 'support@atlas-studio.org',
        tags: [{ name: 'app', value: 'cockpit-journey' }, { name: 'type', value: 'workspace-invite' }],
      }),
    });
    status = r.status;
    resBody = await r.json().catch(() => ({}));
  } catch (e) {
    return json(200, { success: false, error: 'réseau Resend', details: String((e as Error)?.message ?? e), link });
  }
  if (status < 200 || status >= 300) {
    return json(200, { success: false, error: 'Resend a rejeté l’envoi', status, resBody, link });
  }
  return json(200, { success: true, emailSent: true, emailId: resBody?.id, link });
});

function inviteHtml({
  inviterName,
  name,
  link,
  role,
}: {
  inviterName: string;
  name: string;
  link: string;
  role: string;
}): string {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);
  const roleLabel = role === 'admin' ? 'Administrateur' : role === 'viewer' ? 'Lecteur' : 'Éditeur';
  return [
    `<!DOCTYPE html><html lang='fr'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>`,
    `<style>@import url('https://fonts.googleapis.com/css2?family=Grand+Hotel&family=Dosis:wght@400;500;600;700&display=swap');</style></head>`,
    `<body style='margin:0;background:#F4F2E9;font-family:Dosis,-apple-system,Segoe UI,Roboto,sans-serif;color:#1A1D17;'>`,
    `<div style='max-width:560px;margin:0 auto;padding:32px 20px;'>`,
    `<div style='background:#FFFFFF;border:1px solid #DCD9CB;border-radius:16px;overflow:hidden;'>`,
    `<div style='background:#52693F;height:6px;'></div>`,
    `<div style='padding:32px 32px 28px;'>`,
    `<div style='font-family:Grand Hotel,cursive;font-size:34px;color:#52693F;line-height:1;'>CockpitJourney</div>`,
    `<div style='font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#7A8071;font-weight:600;margin-top:2px;'>Atlas Studio</div>`,
    `<h1 style='font-size:22px;font-weight:600;margin:24px 0 8px;'>Bonjour ${esc(name)},</h1>`,
    `<p style='font-size:15px;line-height:1.6;color:#3F443A;margin:0 0 6px;'><strong>${esc(inviterName)}</strong> vous invite à collaborer sur son cockpit en tant que <strong>${roleLabel}</strong>.</p>`,
    `<p style='font-size:15px;line-height:1.6;color:#3F443A;margin:0 0 24px;'>Connectez-vous (ou créez votre compte) puis cliquez ci-dessous pour rejoindre l'espace partagé.</p>`,
    `<div style='text-align:center;margin:8px 0 24px;'><a href='${link}' style='display:inline-block;padding:14px 34px;background:#6E8B58;color:#FFFFFF;text-decoration:none;border-radius:12px;font-weight:600;font-size:15px;'>Rejoindre le cockpit</a></div>`,
    `<p style='font-size:12px;line-height:1.6;color:#7A8071;margin:0;'>Si le bouton ne fonctionne pas, copiez ce lien :<br><a href='${link}' style='color:#52693F;word-break:break-all;'>${link}</a></p>`,
    `</div>`,
    `<div style='padding:16px 32px;border-top:1px solid #DCD9CB;font-size:11px;color:#B5AB8E;'>L'accès reste valable jusqu'à révocation par la personne qui vous a invité(e).</div>`,
    `</div>`,
    `<p style='text-align:center;font-size:11px;color:#B5AB8E;margin:16px 0 0;'>CockpitJourney · Atlas Studio · support@atlas-studio.org</p>`,
    `</div></body></html>`,
  ].join('');
}
