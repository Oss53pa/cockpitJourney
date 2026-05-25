// cj-auth-pat v1 — Echange un Personal Access Token contre un JWT Supabase temporaire
// =====================================================================================
// Body POST : { pat: "cj_xxxxxxxxxxxx" }
// Response : { access_token, refresh_token, expires_in, user_id, email, scopes }
//
// Flux interne :
//   1. Hash le PAT (SHA-256)
//   2. Lookup dans cj_personal_access_tokens
//   3. Verifie : pas revoke + pas expire
//   4. Update last_used_at
//   5. Genere un magic link pour l'user
//   6. Echange le magic link contre une session JWT (verifyOtp)
//   7. Retourne le JWT a l'appelant

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Methode non supportee", 405);

  try {
    const { pat } = await req.json();
    if (!pat || typeof pat !== "string") return errorResponse("PAT requis", 400);
    if (!pat.startsWith("cj_")) return errorResponse("Format PAT invalide", 400);

    const tokenHash = await sha256Hex(pat);

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Lookup
    const { data: tokenRow, error: lookupErr } = await supabaseAdmin
      .from("cj_personal_access_tokens")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (lookupErr) return errorResponse(`DB error: ${lookupErr.message}`, 500);
    if (!tokenRow) return errorResponse("PAT invalide", 401);
    if (tokenRow.revoked_at) return errorResponse("PAT revoque", 401);
    if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() < Date.now()) {
      return errorResponse("PAT expire", 401);
    }

    // 2) Recuperer l'email du user
    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(tokenRow.user_id);
    if (userErr || !userData?.user) return errorResponse("User introuvable", 404);
    const email = userData.user.email;
    if (!email) return errorResponse("User sans email", 500);

    // 3) Update last_used_at (best-effort)
    await supabaseAdmin
      .from("cj_personal_access_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", tokenRow.id);

    // 4) Generer un magic link
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      return errorResponse(`Magic link generation failed: ${linkErr?.message || "unknown"}`, 500);
    }

    // 5) Echanger le hashed_token contre une session JWT via un client anon
    const supabaseAnon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: sessionData, error: otpErr } = await supabaseAnon.auth.verifyOtp({
      type: "magiclink",
      token_hash: linkData.properties.hashed_token,
    });
    if (otpErr || !sessionData?.session) {
      return errorResponse(`Session exchange failed: ${otpErr?.message || "unknown"}`, 500);
    }

    return jsonResponse({
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_in: sessionData.session.expires_in,
      user_id: tokenRow.user_id,
      email,
      scopes: tokenRow.scopes,
      token_name: tokenRow.name,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("cj-auth-pat error:", msg);
    return errorResponse(msg, 500);
  }
});
