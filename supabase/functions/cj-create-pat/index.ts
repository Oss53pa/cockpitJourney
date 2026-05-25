// cj-create-pat v1 — Cree un nouveau Personal Access Token
// =================================================================
// Body POST : { name: string, scopes?: string[], expires_in_days?: number }
// Response : { id, token, prefix, name, scopes, expires_at, created_at }
//
// Le token n'est retourne QU'UNE SEULE FOIS dans cette reponse.
// Stocker le hash en base, montrer le token original au user qui doit le copier.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

function generateToken(): string {
  // 'cj_' + 40 caracteres alphanumeriques (240 bits d'entropie)
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(40));
  let token = "cj_";
  for (const b of bytes) token += chars[b % chars.length];
  return token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Methode non supportee", 405);

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return errorResponse("Token requis", 401);

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verifier l'auth de l'user qui demande la creation du PAT
    const userToken = authHeader.slice(7);
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(userToken);
    if (authErr || !user) return errorResponse("Auth invalide", 401);

    const { name, scopes, expires_in_days } = await req.json();
    if (!name || typeof name !== "string" || name.length < 1 || name.length > 100) {
      return errorResponse("name requis (1-100 caracteres)", 400);
    }

    const validScopes = ["read", "write", "admin"];
    const finalScopes = Array.isArray(scopes)
      ? scopes.filter((s) => validScopes.includes(s))
      : ["read", "write"];
    if (finalScopes.length === 0) return errorResponse("Au moins 1 scope valide requis", 400);

    // Generer le token + son hash
    const token = generateToken();
    const tokenHash = await sha256Hex(token);
    const tokenPrefix = token.slice(0, 11); // 'cj_' + 8 chars

    let expiresAt: string | null = null;
    if (expires_in_days && Number(expires_in_days) > 0) {
      expiresAt = new Date(Date.now() + Number(expires_in_days) * 86400000).toISOString();
    }

    // Insert
    const { data: row, error: insErr } = await supabaseAdmin
      .from("cj_personal_access_tokens")
      .insert({
        user_id: user.id,
        name,
        token_hash: tokenHash,
        token_prefix: tokenPrefix,
        scopes: finalScopes,
        expires_at: expiresAt,
      })
      .select("id, name, token_prefix, scopes, expires_at, created_at")
      .single();
    if (insErr) return errorResponse(`DB error: ${insErr.message}`, 500);

    // Retourne le token EN CLAIR (UNE SEULE FOIS)
    return jsonResponse({
      id: row.id,
      token,                       // <- a copier maintenant, non recuperable apres
      prefix: tokenPrefix,
      name: row.name,
      scopes: row.scopes,
      expires_at: row.expires_at,
      created_at: row.created_at,
      warning: "Ce token ne sera plus jamais affiche. Copiez-le maintenant et stockez-le dans un endroit sur.",
    });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : String(e), 500);
  }
});
