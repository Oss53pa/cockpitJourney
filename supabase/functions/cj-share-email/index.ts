// cj-share-email — Envoi par e-mail d'un lien de partage participant.
// =====================================================================
// Fonction AUTHENTIFIÉE (verify_jwt par défaut) : l'appelant doit être le
// propriétaire du lien (cj_shares.auth_user_id = auth.uid()). On envoie le
// lien /p/:token par e-mail via Resend, et on mémorise l'adresse sur le
// share (invitee_email). Aucune escalade : un utilisateur ne peut envoyer
// que SES propres liens.

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'server misconfigured' });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Identité de l'appelant.
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

  const shareId = String(body.shareId ?? '');
  const appUrl = String(body.appUrl ?? '').replace(/\/$/, '');
  const emailIn = body.email ? String(body.email).trim().toLowerCase() : '';
  if (!shareId || !appUrl) return json(400, { error: 'champs requis : shareId, appUrl' });

  const { data: share } = await sb
    .from('cj_shares')
    .select('id, token, auth_user_id, resource_type, permission, label, invitee_email, revoked_at')
    .eq('id', shareId)
    .maybeSingle();
  if (!share) return json(404, { error: 'lien introuvable' });
  if ((share as { auth_user_id: string }).auth_user_id !== caller.id) {
    return json(403, { error: 'vous n’êtes pas propriétaire de ce lien' });
  }
  if ((share as { revoked_at: string | null }).revoked_at) {
    return json(400, { error: 'lien révoqué' });
  }

  const to = emailIn || String((share as { invitee_email: string | null }).invitee_email ?? '');
  if (!to) return json(400, { error: 'aucune adresse e-mail' });

  const s = share as {
    token: string;
    resource_type: string;
    permission: string;
    label: string | null;
  };
  const link = `${appUrl}/p/${s.token}`;
  const scopeLabel = s.resource_type === 'project' ? 'un projet' : 'une tâche';
  const permLabel = s.permission === 'contribute' ? 'contribuer' : 'consulter';

  if (!RESEND_API_KEY) {
    // Pas de clé Resend : on renvoie le lien pour un envoi manuel.
    await sb.from('cj_shares').update({ invitee_email: to }).eq('id', shareId);
    return json(200, { success: true, emailSent: false, link, note: 'RESEND_API_KEY absent.' });
  }

  const html = shareHtml({ link, scopeLabel, permLabel, label: s.label });
  let status = 0;
  // deno-lint-ignore no-explicit-any
  let resBody: any = {};
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [to],
        subject: '[CockpitJourney] Un espace a été partagé avec vous',
        html,
        reply_to: 'support@atlas-studio.org',
        tags: [{ name: 'app', value: 'cockpit-journey' }, { name: 'type', value: 'share' }],
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

  await sb.from('cj_shares').update({ invitee_email: to }).eq('id', shareId);
  return json(200, { success: true, emailSent: true, emailId: resBody?.id, link });
});

function shareHtml({
  link,
  scopeLabel,
  permLabel,
  label,
}: {
  link: string;
  scopeLabel: string;
  permLabel: string;
  label: string | null;
}): string {
  const esc = (x: string) => x.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);
  const intro = label ? `Bonjour ${esc(label)},` : 'Bonjour,';
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
    `<h1 style='font-size:22px;font-weight:600;margin:24px 0 8px;'>${intro}</h1>`,
    `<p style='font-size:15px;line-height:1.6;color:#3F443A;margin:0 0 6px;'>Vous avez été invité(e) à <strong>${permLabel}</strong> sur ${scopeLabel} dans CockpitJourney.</p>`,
    `<p style='font-size:15px;line-height:1.6;color:#3F443A;margin:0 0 24px;'>Aucun compte n'est nécessaire — ouvrez simplement le lien ci-dessous.</p>`,
    `<div style='text-align:center;margin:8px 0 24px;'><a href='${link}' style='display:inline-block;padding:14px 34px;background:#6E8B58;color:#FFFFFF;text-decoration:none;border-radius:12px;font-weight:600;font-size:15px;'>Ouvrir l'espace partagé</a></div>`,
    `<p style='font-size:12px;line-height:1.6;color:#7A8071;margin:0;'>Si le bouton ne fonctionne pas, copiez ce lien :<br><a href='${link}' style='color:#52693F;word-break:break-all;'>${link}</a></p>`,
    `</div>`,
    `<div style='padding:16px 32px;border-top:1px solid #DCD9CB;font-size:11px;color:#B5AB8E;'>Ce lien reste valide jusqu'à sa révocation par la personne qui vous a invité(e).</div>`,
    `</div>`,
    `<p style='text-align:center;font-size:11px;color:#B5AB8E;margin:16px 0 0;'>CockpitJourney · Atlas Studio · support@atlas-studio.org</p>`,
    `</div></body></html>`,
  ].join('');
}
