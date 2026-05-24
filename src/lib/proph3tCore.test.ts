import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// proph3tCore imports { supabase } from './supabase'. We mock it so the JWT
// retrieval is deterministic and no real network/auth is touched.
const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: getSessionMock } },
}));

const CORE_URL = 'https://core.example.co';

describe('proph3tCore', () => {
  beforeEach(() => {
    vi.resetModules();
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'jwt-abc' } } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is configured when VITE_ATLAS_SUPABASE_* are present', async () => {
    vi.stubEnv('VITE_ATLAS_SUPABASE_URL', CORE_URL);
    vi.stubEnv('VITE_ATLAS_SUPABASE_ANON_KEY', 'anon-key-123');
    const mod = await import('./proph3tCore');
    expect(mod.PROPH3T_CORE_CONFIGURED).toBe(true);
    expect(mod.DEFAULT_SENSITIVITY).toBe('internal');
  });

  it('falls back to VITE_SUPABASE_* when the ATLAS vars are absent', async () => {
    vi.stubEnv('VITE_ATLAS_SUPABASE_URL', '');
    vi.stubEnv('VITE_ATLAS_SUPABASE_ANON_KEY', '');
    vi.stubEnv('VITE_SUPABASE_URL', CORE_URL);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fallback-key');
    const mod = await import('./proph3tCore');
    expect(mod.PROPH3T_CORE_CONFIGURED).toBe(true);
  });

  it('askProph3t POSTs to proph3t-ask with the cockpit-journey product, internal default, and the user JWT', async () => {
    vi.stubEnv('VITE_ATLAS_SUPABASE_URL', CORE_URL);
    vi.stubEnv('VITE_ATLAS_SUPABASE_ANON_KEY', 'anon-key-123');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ conversation_id: 'c1', answer: 'ok', citations: [], confidence: 0.9 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { askProph3t } = await import('./proph3tCore');
    const res = await askProph3t({ message: 'Quelles priorités ?' });

    expect(res.answer).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${CORE_URL}/functions/v1/proph3t-ask`);
    const body = JSON.parse(init.body as string);
    expect(body.product).toBe('cockpit-journey');
    expect(body.sensitivity).toBe('internal');
    expect(body.message).toBe('Quelles priorités ?');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer jwt-abc');
    expect(headers.apikey).toBe('anon-key-123');
  });

  it('forwards the confidential sensitivity verbatim (core gates the providers)', async () => {
    vi.stubEnv('VITE_ATLAS_SUPABASE_URL', CORE_URL);
    vi.stubEnv('VITE_ATLAS_SUPABASE_ANON_KEY', 'anon-key-123');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ conversation_id: 'c', answer: '', citations: [], confidence: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { askProph3t } = await import('./proph3tCore');
    await askProph3t({ message: 'Analyse ce contrat', sensitivity: 'confidential' });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.sensitivity).toBe('confidential');
  });

  it('throws cleanly on a core refusal — never silently downgrades to a free tier', async () => {
    vi.stubEnv('VITE_ATLAS_SUPABASE_URL', CORE_URL);
    vi.stubEnv('VITE_ATLAS_SUPABASE_ANON_KEY', 'anon-key-123');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'no zero-retention provider available',
    });
    vi.stubGlobal('fetch', fetchMock);

    const { askProph3t } = await import('./proph3tCore');
    await expect(askProph3t({ message: 'x', sensitivity: 'confidential' })).rejects.toThrow(
      /proph3t-ask 403/
    );
    // Exactly one call — no retry against another (free) endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('getProph3t builds a federation client scoped to cockpit-journey', async () => {
    vi.stubEnv('VITE_ATLAS_SUPABASE_URL', CORE_URL);
    vi.stubEnv('VITE_ATLAS_SUPABASE_ANON_KEY', 'anon-key-123');
    const { getProph3t } = await import('./proph3tCore');
    const client = await getProph3t('soc-1');
    expect(client.appId).toBe('cockpit-journey');
  });

  it('askProph3t refuses to run when the core is not configured', async () => {
    vi.stubEnv('VITE_ATLAS_SUPABASE_URL', '');
    vi.stubEnv('VITE_ATLAS_SUPABASE_ANON_KEY', '');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { askProph3t, PROPH3T_CORE_CONFIGURED } = await import('./proph3tCore');
    expect(PROPH3T_CORE_CONFIGURED).toBe(false);
    await expect(askProph3t({ message: 'x' })).rejects.toThrow(/non configuré/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
