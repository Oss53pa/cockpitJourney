// Public, read-only intake-form loader. Returns a sanitized form definition
// for an anonymous visitor. Deploy with verify_jwt disabled:
//   supabase functions deploy form-public --no-verify-jwt
// Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (provided by Supabase).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'missing id' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data, error } = await supabase.from('cj_forms').select('data').eq('id', id).maybeSingle();
  if (error || !data) return json({ error: 'not found' }, 404);

  const form = (data as { data: Record<string, unknown> }).data;
  if (!form || form.enabled === false) return json({ error: 'inactive' }, 404);

  // Expose only what the public page needs — never the owner / project ids.
  return json({
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
  });
});
