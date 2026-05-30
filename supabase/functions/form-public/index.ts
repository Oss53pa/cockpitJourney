// Public, read-only intake-form loader. Returns a sanitized form definition
// for an anonymous visitor. Hardened with origin allowlist + per-IP rate
// limit (lighter than form-submit since this is a read).
// Deploy:
//   supabase functions deploy form-public --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://cockpit-journey.atlas-studio.org',
  'http://localhost:5173',
  'http://localhost:4173',
];
function isAllowedOrigin(o: string | null): boolean {
  if (!o) return false;
  if (ALLOWED_ORIGINS.includes(o)) return true;
  try {
    const u = new URL(o);
    return u.protocol === 'https:' && u.hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}
function corsHeaders(origin: string | null): Record<string, string> {
  const allow = isAllowedOrigin(origin) ? origin! : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

const _rl = new Map<string, number[]>();
const RL_LIMIT = 60;
const RL_WINDOW_MS = 60_000;
function rateLimit(ip: string): boolean {
  const now = Date.now();
  const arr = (_rl.get(ip) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  if (arr.length >= RL_LIMIT) {
    _rl.set(ip, arr);
    return false;
  }
  arr.push(now);
  _rl.set(ip, arr);
  return true;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (!isAllowedOrigin(origin)) return json({ error: 'origin not allowed' }, 403, origin);

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown';
  if (!rateLimit(ip)) return json({ error: 'rate limited' }, 429, origin);

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'missing id' }, 400, origin);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data, error } = await supabase.from('cj_forms').select('data').eq('id', id).maybeSingle();
  if (error || !data) return json({ error: 'not found' }, 404, origin);

  const form = (data as { data: Record<string, unknown> }).data;
  if (!form || form.enabled === false) return json({ error: 'inactive' }, 404, origin);

  return json(
    {
      id: form.id,
      name: form.name,
      description: form.description ?? null,
      fields: (Array.isArray(form.fields) ? form.fields : []).map((f: Record<string, unknown>) => ({
        id: f.id,
        type: f.type,
        label: f.label,
        required: !!f.required,
        placeholder: f.placeholder ?? null,
        options: f.options ?? null,
      })),
    },
    200,
    origin
  );
});
