/**
 * IntegrationsSettingsPage.tsx — page /settings/integrations
 *
 * Lets the user generate / revoke Personal Access Tokens (PATs) so
 * external integrations (Claude Cowork, Claude Code, third-party
 * MCP clients, scripts) can authenticate against CockpitJourney's
 * REST surface without sharing the user's Supabase JWT.
 *
 * Architecture:
 *   - Table:   public.cj_personal_access_tokens (RLS: own-rows only)
 *   - Create:  Edge Function cj-create-pat (verify_jwt) — generates
 *              a 32-byte random token, returns it in clear *once*,
 *              persists only the SHA-256 hash + a display prefix.
 *   - Verify:  Edge Function cj-auth-pat (no jwt) — external clients
 *              POST {token, scope} to validate on each request.
 *
 * Design: matches CockpitJourney's sage/cream palette via Tailwind
 * atlas-* tokens — no inline styles, no hardcoded colors. Mirrors the
 * pattern used by TeamSettingsPage but stays on-brand.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plug,
  Plus,
  Copy,
  Check,
  ArrowLeft,
  KeyRound,
  Trash2,
  Sparkles,
  AlertCircle,
  X,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface PAT {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

const SCOPES: { id: string; label: string; description: string }[] = [
  { id: 'read', label: 'Lecture', description: 'Lire projets, tâches, OKR, rapports' },
  { id: 'write', label: 'Écriture', description: 'Créer / modifier projets, tâches, OKR' },
  { id: 'admin', label: 'Admin', description: "Inviter des membres, gérer l'équipe" },
];

type TokenStatus = 'active' | 'expired' | 'revoked';

function statusOf(t: PAT): TokenStatus {
  if (t.revoked_at) return 'revoked';
  if (t.expires_at && new Date(t.expires_at).getTime() < Date.now()) return 'expired';
  return 'active';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function IntegrationsSettingsPage() {
  const [tokens, setTokens] = useState<PAT[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '',
    scopes: ['read', 'write'] as string[],
    expires_in_days: 0,
  });
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<{ token: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadTokens() {
    setLoading(true);
    setError(null);
    const { data, error: dbErr } = await supabase
      .from('cj_personal_access_tokens')
      .select('*')
      .order('created_at', { ascending: false });
    if (dbErr) setError(dbErr.message);
    else setTokens((data ?? []) as PAT[]);
    setLoading(false);
  }

  useEffect(() => {
    void loadTokens();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || form.scopes.length === 0) return;
    setCreating(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expirée — reconnectez-vous.');

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cj-create-pat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify({
          name: form.name,
          scopes: form.scopes,
          expires_in_days: form.expires_in_days || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);

      setNewToken({ token: data.token, name: data.name });
      setShowCreate(false);
      setForm({ name: '', scopes: ['read', 'write'], expires_in_days: 0 });
      await loadTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(token: PAT) {
    if (
      !confirm(
        `Révoquer le token "${token.name}" ?\n\nLes intégrations qui l'utilisent cesseront immédiatement de fonctionner.`
      )
    )
      return;
    const { error: upErr } = await supabase
      .from('cj_personal_access_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', token.id);
    if (upErr) setError(upErr.message);
    else await loadTokens();
  }

  async function handleDelete(token: PAT) {
    if (!confirm(`Supprimer définitivement "${token.name}" ?\n\nCette action est irréversible.`)) return;
    const { error: delErr } = await supabase.from('cj_personal_access_tokens').delete().eq('id', token.id);
    if (delErr) setError(delErr.message);
    else await loadTokens();
  }

  function copyToken() {
    if (!newToken) return;
    void navigator.clipboard.writeText(newToken.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen w-full bg-atlas-cream text-atlas-fg-1 bg-aurora">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header — back link + brand wordmark */}
        <div className="flex items-center justify-between mb-10">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-2xs uppercase tracking-[0.2em] text-atlas-fg-3 hover:text-atlas-sage-deep transition font-light"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Retour au cockpit
          </Link>
          <Link to="/" className="font-logo text-2xl text-atlas-fg-1 leading-none">
            Cockpit<span className="text-atlas-sage-deep">Journey</span>
          </Link>
        </div>

        {/* Page title */}
        <header className="mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-atlas-sage/10 border border-atlas-sage/20 mb-5">
            <Plug className="w-3.5 h-3.5 text-atlas-sage-deep" />
            <span className="text-2xs uppercase tracking-[0.2em] text-atlas-sage-deeper font-light">
              Paramètres · Intégrations
            </span>
          </div>
          <h1 className="font-logo text-4xl sm:text-5xl text-atlas-fg-1 leading-tight mb-3">
            Personal <span className="text-atlas-sage-deep">Access Tokens</span>
          </h1>
          <p className="text-base text-atlas-fg-2 font-light leading-relaxed max-w-2xl">
            Connectez Claude Cowork, Claude Code ou n'importe quel client MCP à votre cockpit CockpitJourney.
            Chaque token a ses propres permissions et peut être révoqué à tout moment.
          </p>
        </header>

        {/* Error banner */}
        {error && (
          <div className="mb-6 flex items-start gap-3 p-4 rounded-2xl bg-signal-red-soft border border-signal-red/30">
            <AlertCircle className="w-4 h-4 text-signal-red mt-0.5 shrink-0" />
            <div className="flex-1 text-sm text-signal-red font-light leading-relaxed">{error}</div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-signal-red hover:text-signal-red/70 transition shrink-0"
              aria-label="Fermer l'erreur"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Token-just-created banner */}
        {newToken && (
          <div className="mb-6 p-5 sm:p-6 rounded-2xl bg-atlas-panel border border-atlas-sage-deep/40 shadow-amber-glow animate-fade-in-up">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-atlas-sage/15 grid place-items-center shrink-0">
                <Sparkles className="w-4 h-4 text-atlas-sage-deep" />
              </div>
              <div className="flex-1">
                <div className="text-2xs uppercase tracking-[0.2em] text-atlas-sage-deeper font-light mb-1">
                  Token créé
                </div>
                <div className="text-base font-light text-atlas-fg-1">{newToken.name}</div>
              </div>
              <button
                type="button"
                onClick={() => setNewToken(null)}
                className="text-atlas-fg-3 hover:text-atlas-fg-1 transition shrink-0"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-start gap-2 mb-3 text-2xs text-signal-yellow font-light leading-relaxed">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Copiez ce token maintenant — il ne sera plus jamais affiché.</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <code className="flex-1 px-3 py-2.5 rounded-xl bg-atlas-fg-1 text-atlas-sage-glow font-mono text-xs sm:text-sm break-all leading-relaxed">
                {newToken.token}
              </code>
              <button
                type="button"
                onClick={copyToken}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-atlas-sage-deep text-white font-light tracking-wider hover:bg-atlas-sage-deeper transition text-sm shadow-amber-deep min-w-[110px]"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Copié
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copier
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Create form */}
        {showCreate && (
          <form
            onSubmit={handleCreate}
            className="mb-6 p-6 rounded-2xl bg-atlas-panel border border-atlas-line shadow-panel animate-fade-in-up"
          >
            <h3 className="text-base font-light text-atlas-fg-1 mb-5">Nouveau Personal Access Token</h3>

            <div className="space-y-5">
              <label className="block">
                <span className="block text-2xs uppercase tracking-[0.2em] text-atlas-sage-deeper font-light mb-2">
                  Nom
                </span>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Claude Cowork sur mon Mac"
                  className="w-full px-3 py-2.5 rounded-xl bg-atlas-cream border border-atlas-line focus:border-atlas-sage-deep focus:outline-none focus:ring-2 focus:ring-atlas-sage-deep/20 text-sm font-light text-atlas-fg-1 placeholder:text-atlas-fg-3 transition"
                />
                <span className="block mt-1.5 text-2xs text-atlas-fg-3 font-light">
                  Un nom descriptif vous aidera à reconnaître ce token plus tard.
                </span>
              </label>

              <div>
                <span className="block text-2xs uppercase tracking-[0.2em] text-atlas-sage-deeper font-light mb-2">
                  Permissions
                </span>
                <div className="space-y-2">
                  {SCOPES.map((s) => {
                    const checked = form.scopes.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                          checked
                            ? 'bg-atlas-sage/8 border-atlas-sage-deep/35'
                            : 'bg-atlas-cream border-atlas-line hover:border-atlas-sage-deep/30'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              scopes: e.target.checked
                                ? [...form.scopes, s.id]
                                : form.scopes.filter((x) => x !== s.id),
                            })
                          }
                          className="mt-0.5 w-4 h-4 rounded border-atlas-line text-atlas-sage-deep focus:ring-atlas-sage-deep/30"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-light text-atlas-fg-1">{s.label}</div>
                          <div className="text-2xs text-atlas-fg-3 font-light mt-0.5">{s.description}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <label className="block">
                <span className="block text-2xs uppercase tracking-[0.2em] text-atlas-sage-deeper font-light mb-2">
                  Expiration (jours)
                </span>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={form.expires_in_days}
                  onChange={(e) => setForm({ ...form, expires_in_days: Number(e.target.value) })}
                  className="w-full sm:w-40 px-3 py-2.5 rounded-xl bg-atlas-cream border border-atlas-line focus:border-atlas-sage-deep focus:outline-none focus:ring-2 focus:ring-atlas-sage-deep/20 text-sm font-light text-atlas-fg-1 transition"
                />
                <span className="block mt-1.5 text-2xs text-atlas-fg-3 font-light">
                  0 = pas d'expiration. Pour la sécurité on recommande 90 jours.
                </span>
              </label>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                type="submit"
                disabled={creating || form.scopes.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-atlas-sage-deep text-white font-light tracking-wider hover:bg-atlas-sage-deeper transition shadow-amber-deep text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Création…
                  </>
                ) : (
                  <>
                    <KeyRound className="w-3.5 h-3.5" />
                    Créer le token
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-5 py-2.5 rounded-xl border border-atlas-line bg-atlas-panel hover:border-atlas-sage-deep/40 hover:bg-atlas-sage/5 transition text-sm font-light tracking-wider text-atlas-fg-1"
              >
                Annuler
              </button>
            </div>
          </form>
        )}

        {/* Top action bar (when create form not open) */}
        {!showCreate && !loading && (
          <div className="flex justify-end mb-4">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-atlas-sage-deep text-white font-light tracking-wider hover:bg-atlas-sage-deeper transition shadow-amber-deep text-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Nouveau token
            </button>
          </div>
        )}

        {/* Tokens list */}
        <div className="rounded-2xl bg-atlas-panel border border-atlas-line shadow-panel overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-sm text-atlas-fg-3 font-light">
              <Loader2 className="w-5 h-5 animate-spin text-atlas-sage-deep mx-auto mb-3" />
              Chargement des tokens…
            </div>
          ) : tokens.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-atlas-sage/10 grid place-items-center mx-auto mb-4">
                <KeyRound className="w-5 h-5 text-atlas-sage-deep" />
              </div>
              <div className="text-base font-light text-atlas-fg-1 mb-1">Aucun token pour l'instant</div>
              <p className="text-sm text-atlas-fg-3 font-light max-w-sm mx-auto">
                Créez votre premier Personal Access Token pour permettre à Claude Cowork ou un client MCP de
                lire vos données CockpitJourney.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-atlas-panel-2 border-b border-atlas-line">
                    <th className="text-left text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-light px-5 py-3.5">
                      Nom
                    </th>
                    <th className="text-left text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-light px-5 py-3.5">
                      Token
                    </th>
                    <th className="text-left text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-light px-5 py-3.5">
                      Permissions
                    </th>
                    <th className="text-left text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-light px-5 py-3.5">
                      Statut
                    </th>
                    <th className="text-left text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-light px-5 py-3.5 hidden md:table-cell">
                      Dernière utilisation
                    </th>
                    <th className="text-right text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-light px-5 py-3.5">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t) => {
                    const status = statusOf(t);
                    return (
                      <tr
                        key={t.id}
                        className={`border-b border-atlas-line/50 last:border-0 ${
                          status !== 'active' ? 'opacity-60' : ''
                        }`}
                      >
                        <td className="px-5 py-4 font-light text-atlas-fg-1 align-top">
                          <div>{t.name}</div>
                          <div className="text-2xs text-atlas-fg-3 mt-0.5">
                            Créé le {formatDate(t.created_at)}
                          </div>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <code className="text-xs font-mono text-atlas-fg-3 bg-atlas-panel-2 px-2 py-1 rounded">
                            {t.token_prefix}…
                          </code>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <div className="flex flex-wrap gap-1">
                            {t.scopes.map((s) => (
                              <span
                                key={s}
                                className="inline-block px-2 py-0.5 rounded text-2xs font-mono font-light bg-atlas-sage/15 text-atlas-sage-deeper"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-4 align-top">
                          {status === 'active' && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-light text-signal-green">
                              <span className="w-1.5 h-1.5 rounded-full bg-signal-green" />
                              Actif
                            </span>
                          )}
                          {status === 'expired' && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-light text-signal-yellow">
                              <span className="w-1.5 h-1.5 rounded-full bg-signal-yellow" />
                              Expiré
                            </span>
                          )}
                          {status === 'revoked' && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-light text-signal-red">
                              <span className="w-1.5 h-1.5 rounded-full bg-signal-red" />
                              Révoqué
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 align-top text-2xs text-atlas-fg-3 font-light hidden md:table-cell">
                          {t.last_used_at ? formatDate(t.last_used_at) : 'Jamais utilisé'}
                        </td>
                        <td className="px-5 py-4 align-top">
                          <div className="flex justify-end gap-1.5">
                            {status === 'active' && (
                              <button
                                type="button"
                                onClick={() => handleRevoke(t)}
                                className="px-2.5 py-1.5 rounded-lg border border-signal-red/30 text-signal-red bg-signal-red-soft/40 hover:bg-signal-red-soft text-2xs font-light tracking-wide transition"
                              >
                                Révoquer
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDelete(t)}
                              aria-label={`Supprimer ${t.name}`}
                              className="p-1.5 rounded-lg border border-atlas-line text-atlas-fg-3 bg-atlas-panel hover:border-signal-red/30 hover:text-signal-red transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* MCP setup hint */}
        <div className="mt-8 p-5 sm:p-6 rounded-2xl bg-atlas-panel-2 border border-atlas-line">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-atlas-sage/10 grid place-items-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-atlas-sage-deep" />
            </div>
            <div className="flex-1">
              <div className="text-2xs uppercase tracking-[0.2em] text-atlas-sage-deeper font-light mb-1">
                Comment utiliser
              </div>
              <p className="text-sm text-atlas-fg-2 font-light leading-relaxed">
                Une fois votre token copié, ajoutez-le dans la configuration MCP de Claude Cowork (
                <code className="font-mono text-2xs text-atlas-sage-deeper">~/.claude/mcp.json</code>) :
              </p>
            </div>
          </div>
          <pre className="overflow-x-auto p-4 rounded-xl bg-atlas-fg-1 text-atlas-sage-glow text-xs font-mono leading-relaxed">{`{
  "mcpServers": {
    "cockpit-journey": {
      "command": "npx",
      "args": ["-y", "@atlas-studio/cockpit-journey-mcp"],
      "env": {
        "CJ_PAT": "<votre-token>"
      }
    }
  }
}`}</pre>
        </div>
      </div>
    </div>
  );
}
