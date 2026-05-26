// cj-invite-seat — Invitation d'un membre dans CockpitJourney.
// =====================================================================
// Système d'invitation dédié à CockpitJourney (zéro impact sur les autres
// apps Atlas, contrairement à la fonction partagée `invite-user`).
//
// Source de vérité : `licence_seats` (modèle Atlas universel — équivaut au
// couple user_orgs/org_members du template : appartenance autoritative +
// roster par email). Le seat est écrit UNIQUEMENT ici (service-role) APRÈS
// validation du rôle admin de l'appelant → pas d'auto-escalade côté client.
//
// FIX "lien qui expire immédiatement" : on n'envoie PAS l'action_link GoTrue
// (que les scanners email — SafeLinks/Proofpoint/Gmail — prefetchent et
// consomment avant le clic). On construit un lien anti-prefetch
//   {appUrl}/auth/accept-invite?token_hash=…&type=…
// dont la consommation se fait client-side via supabase.auth.verifyOtp().
// Les scanners ne pouvant pas exécuter le JS, le token reste valide.

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

// Rôles attribuables via invitation (jamais super_admin).
const ASSIGNABLE = new Set(['app_admin', 'editor', 'viewer']);
const ROLE_LABELS: Record<string, string> = {
  app_super_admin: 'Super-admin',
  app_admin: 'Admin',
  editor: 'Éditeur',
  viewer: 'Lecteur',
};

function canAssign(callerRole: string, target: string): boolean {
  if (callerRole === 'app_super_admin') return target !== 'app_super_admin';
  if (callerRole === 'app_admin') return target === 'editor' || target === 'viewer';
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { success: false, error: 'Méthode non autorisée' });

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(200, { success: false, error: 'Configuration incomplète (SUPABASE_URL / SERVICE_ROLE_KEY)' });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── Authentification de l'appelant (défense en profondeur) ──
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { success: false, error: 'Authentification requise' });
  const { data: cd, error: ce } = await supabase.auth.getUser(token);
  const caller = cd?.user;
  if (ce || !caller) return json(401, { success: false, error: 'Jeton invalide ou expiré' });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(200, { success: false, error: 'Body JSON invalide' });
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const fullName = body.full_name ? String(body.full_name) : null;
  const role = String(body.role ?? 'viewer');
  const licenceId = String(body.licence_id ?? '');
  const appUrl = String(body.appUrl ?? '').replace(/\/$/, '');
  const forceRecovery = body.forceRecovery === true;

  if (!email || !licenceId || !appUrl) {
    return json(200, { success: false, error: 'Champs requis : email, licence_id, appUrl' });
  }
  if (!ASSIGNABLE.has(role)) {
    return json(200, { success: false, error: `Rôle non attribuable : ${role}` });
  }

  // ── Autorisation : l'appelant doit être admin/super-admin de CETTE licence ──
  const { data: mySeat, error: msErr } = await supabase
    .from('licence_seats')
    .select('role, tenant_id')
    .eq('user_id', caller.id)
    .eq('licence_id', licenceId)
    .eq('status', 'active')
    .maybeSingle();
  if (msErr) return json(500, { success: false, error: 'Vérification des droits impossible' });
  if (!mySeat || (mySeat.role !== 'app_super_admin' && mySeat.role !== 'app_admin')) {
    return json(403, { success: false, error: 'Droits administrateur requis sur cette licence.' });
  }
  if (!canAssign(mySeat.role as string, role)) {
    return json(403, { success: false, error: `Vous ne pouvez pas attribuer le rôle « ${ROLE_LABELS[role] ?? role} ».` });
  }
  const tenantId = body.tenant_id ? String(body.tenant_id) : (mySeat.tenant_id as string | null);

  // ── Upsert du seat (clé licence_id + email) ──
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from('licence_seats')
    .select('id')
    .eq('licence_id', licenceId)
    .eq('email', email)
    .maybeSingle();
  if (existing) {
    await supabase
      .from('licence_seats')
      .update({ full_name: fullName, role, status: 'active', invitation_sent_at: now, updated_at: now })
      .eq('id', (existing as { id: string }).id);
  } else {
    await supabase.from('licence_seats').insert({
      id: crypto.randomUUID(),
      licence_id: licenceId,
      tenant_id: tenantId,
      email,
      full_name: fullName,
      role,
      status: 'active',
      invitation_sent_at: now,
      login_count: 0,
      created_at: now,
      updated_at: now,
    });
  }

  // ── Génération du lien (invite, fallback recovery si user déjà inscrit) ──
  const redirectTo = `${appUrl}/auth/accept-invite`;
  let magicLink: string | undefined;
  let userId: string | null = null;
  let linkType: 'invite' | 'recovery' = forceRecovery ? 'recovery' : 'invite';

  // deno-lint-ignore no-explicit-any
  const tryRecovery = async (): Promise<{ ok: boolean; link?: string; userId?: string | null; error?: any }> => {
    const { data, error } = await (supabase as any).auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });
    if (error) return { ok: false, error };
    return { ok: true, link: buildSafeLink(redirectTo, data?.properties), userId: data?.user?.id ?? null };
  };

  try {
    if (forceRecovery) {
      const r = await tryRecovery();
      if (!r.ok) return json(200, { success: false, error: 'Génération du lien de renvoi échouée', supabaseError: errInfo(r.error) });
      magicLink = r.link;
      userId = r.userId ?? null;
    } else {
      // deno-lint-ignore no-explicit-any
      const { data, error } = await (supabase as any).auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          data: { full_name: fullName, role, invited_by_app: 'cockpit-journey', invited_at: now },
          redirectTo,
        },
      });
      if (error) {
        const m = (error.message ?? '').toString().toLowerCase();
        const exists = m.includes('already') || m.includes('exists') || m.includes('registered') || error.status === 422 || error.status === 409;
        if (exists) {
          const r = await tryRecovery();
          if (!r.ok) return json(200, { success: false, error: 'Utilisateur déjà inscrit, mais le lien de récupération a échoué', supabaseError: errInfo(r.error) });
          magicLink = r.link;
          userId = r.userId ?? null;
          linkType = 'recovery';
        } else {
          return json(200, { success: false, error: "Génération du lien d'invitation échouée", supabaseError: errInfo(error) });
        }
      } else {
        magicLink = buildSafeLink(redirectTo, data?.properties);
        userId = data?.user?.id ?? null;
      }
    }
  } catch (e) {
    return json(200, { success: false, error: 'Exception lors de la génération du lien', details: String((e as Error)?.message ?? e) });
  }

  if (!magicLink) {
    return json(200, { success: false, error: 'Aucun lien généré (hashed_token manquant dans la réponse Supabase)' });
  }

  // Rattache le seat au user_id résolu (s'il était nul).
  if (userId) {
    await supabase
      .from('licence_seats')
      .update({ user_id: userId })
      .eq('licence_id', licenceId)
      .eq('email', email)
      .is('user_id', null);
  }

  // ── Email via Resend (lien toujours renvoyé pour fallback "copier le lien") ──
  const html = inviteHtml({
    name: fullName ?? email,
    link: magicLink,
    roleLabel: ROLE_LABELS[role] ?? role,
  });
  if (!RESEND_API_KEY) {
    return json(200, { success: true, emailSent: false, magicLink, userId, linkType, note: 'RESEND_API_KEY absent — envoyez le lien manuellement.' });
  }
  let resendStatus = 0;
  // deno-lint-ignore no-explicit-any
  let resendBody: any = {};
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [fullName ? `${fullName} <${email}>` : email],
        subject: '[CockpitJourney] Invitation — activez votre compte',
        html,
        reply_to: 'support@atlas-studio.org',
        tags: [{ name: 'app', value: 'cockpit-journey' }, { name: 'type', value: linkType }],
      }),
    });
    resendStatus = r.status;
    resendBody = await r.json().catch(() => ({}));
  } catch (e) {
    return json(200, { success: false, error: 'Erreur réseau Resend', details: String((e as Error)?.message ?? e), magicLink, userId, linkType });
  }
  if (resendStatus < 200 || resendStatus >= 300) {
    return json(200, { success: false, error: "Resend a rejeté l'envoi", resendStatus, resendBody, magicLink, userId, linkType });
  }

  return json(200, { success: true, emailSent: true, emailId: resendBody?.id, magicLink, userId, linkType });
});

/** Lien anti-prefetch : {appUrl}/auth/accept-invite?token_hash=…&type=… */
// deno-lint-ignore no-explicit-any
function buildSafeLink(redirectTo: string, properties: any): string | undefined {
  const hashed = properties?.hashed_token;
  const type = properties?.verification_type ?? 'invite';
  if (!hashed) return properties?.action_link; // fallback (vulnérable au prefetch)
  return `${redirectTo}?token_hash=${encodeURIComponent(hashed)}&type=${encodeURIComponent(type)}`;
}

// deno-lint-ignore no-explicit-any
function errInfo(error: any) {
  return { message: error?.message, code: error?.code, status: error?.status };
}

function inviteHtml({ name, link, roleLabel }: { name: string; link: string; roleLabel: string }): string {
  const esc = (s: string) =>
    s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);
  return [
    `<!DOCTYPE html>`,
    `<html lang='fr'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>`,
    `<style>@import url('https://fonts.googleapis.com/css2?family=Grand+Hotel&family=Dosis:wght@400;500;600;700&display=swap');</style></head>`,
    `<body style='margin:0;background:#F4F2E9;font-family:Dosis,-apple-system,Segoe UI,Roboto,sans-serif;color:#1A1D17;'>`,
    `<div style='max-width:560px;margin:0 auto;padding:32px 20px;'>`,
    `<div style='background:#FFFFFF;border:1px solid #DCD9CB;border-radius:16px;overflow:hidden;'>`,
    `<div style='background:#52693F;height:6px;'></div>`,
    `<div style='padding:32px 32px 28px;'>`,
    `<div style='font-family:Grand Hotel,cursive;font-size:34px;color:#52693F;line-height:1;'>CockpitJourney</div>`,
    `<div style='font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#7A8071;font-weight:600;margin-top:2px;'>Atlas Studio</div>`,
    `<h1 style='font-size:22px;font-weight:600;margin:24px 0 8px;'>Bonjour ${esc(name)},</h1>`,
    `<p style='font-size:15px;line-height:1.6;color:#3F443A;margin:0 0 6px;'>Vous etes invite a rejoindre <strong>CockpitJourney</strong> avec le role <strong>${esc(roleLabel)}</strong>.</p>`,
    `<p style='font-size:15px;line-height:1.6;color:#3F443A;margin:0 0 24px;'>Cliquez ci-dessous pour activer votre compte et definir votre mot de passe.</p>`,
    `<div style='text-align:center;margin:8px 0 24px;'><a href='${link}' style='display:inline-block;padding:14px 34px;background:#6E8B58;color:#FFFFFF;text-decoration:none;border-radius:12px;font-weight:600;font-size:15px;'>Activer mon compte</a></div>`,
    `<p style='font-size:12px;line-height:1.6;color:#7A8071;margin:0;'>Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><a href='${link}' style='color:#52693F;word-break:break-all;'>${link}</a></p>`,
    `</div>`,
    `<div style='padding:16px 32px;border-top:1px solid #DCD9CB;font-size:11px;color:#B5AB8E;'>Ce lien est personnel et expire apres un delai limite. Si vous n'attendiez pas cette invitation, ignorez cet email.</div>`,
    `</div>`,
    `<p style='text-align:center;font-size:11px;color:#B5AB8E;margin:16px 0 0;'>CockpitJourney - Atlas Studio - support@atlas-studio.org</p>`,
    `</div></body></html>`,
  ].join('');
}

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}
