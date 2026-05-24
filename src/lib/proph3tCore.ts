/**
 * proph3tCore.ts — Intégration Atlas Studio « Proph3t core » pour CockpitJourney.
 * ----------------------------------------------------------------------------
 * Adapté du snippet de référence (oss53pa/atlas-studio-website ·
 * docs/snippets/proph3t-integration.ts).
 *
 * ⚠️ Pourquoi `proph3tCore.ts` et non `proph3t.ts` :
 *   `src/lib/proph3t.ts` est DÉJÀ l'agent IA *local* de CockpitJourney
 *   (client OpenAI-compatible Groq/OpenRouter/Ollama, voir `ProphClient`).
 *   C'est précisément le « LLM local » du mode Fédération. Ce module-ci
 *   ajoute le branchement au CŒUR mutualisé Atlas Studio EN COMPLÉMENT,
 *   sans rien retirer (imports Excel, saisie manuelle, agent local intacts).
 *
 * DEUX MODES, complémentaires :
 *   A) Fédération (SDK) → l'agent local garde le LLM ; le core fournit
 *      mémoire inter-apps, RAG SYSCOHADA, 197 outils, audit SHA-256.
 *      → `getProph3t()` puis `.recall()` / `.searchKnowledge()` /
 *        `.runTool()` / `.logAudit()`.
 *   B) Hébergé (ask)    → on délègue tout le tour au core (orchestrateur
 *      ReAct), avec gouvernance par sensibilité des données.
 *      → `askProph3t({ message, sensitivity, societyId })`.
 *
 * Aucun message utilisateur n'est jamais envoyé au core en mode A — seulement
 * les requêtes d'enrichissement (recall/search/tool/audit).
 *
 * Le SDK `@atlas-studio/proph3t-client` n'étant pas encore publié sur npm, sa
 * source est vendorée dans `./proph3t-client` (cf. son index.ts).
 */

import { Proph3tClient } from './proph3t-client';
// supabase = le client Supabase de CETTE app (pour récupérer le JWT user).
import { supabase } from './supabase';

/**
 * Id de CockpitJourney au catalogue Atlas Studio.
 * (Le core normalise les alias, mais "cockpit-journey" est l'id canonique.)
 */
const PRODUCT = 'cockpit-journey';

/**
 * URL + clé du CŒUR Atlas Studio (PAS forcément le Supabase de l'app).
 *
 * Dans CockpitJourney, l'app tourne déjà sur le projet core
 * (`vgtmljfayiysuvrcmunt`), donc on retombe sur `VITE_SUPABASE_*` si les
 * variables dédiées `VITE_ATLAS_SUPABASE_*` ne sont pas définies. Pour une
 * app satellite hébergée sur un autre projet, définissez explicitement les
 * deux `VITE_ATLAS_SUPABASE_*` (jamais commités — voir `.env.example`).
 */
const ATLAS_CORE_URL = (import.meta.env.VITE_ATLAS_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL) as
  | string
  | undefined;
const ATLAS_CORE_ANON = (import.meta.env.VITE_ATLAS_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

/** Vrai si le cœur est joignable (URL + clé présentes). */
export const PROPH3T_CORE_CONFIGURED = !!(ATLAS_CORE_URL && ATLAS_CORE_ANON);

// ============================================================
// MODE A — Fédération : enrichissement via le SDK
// ============================================================

/**
 * Construit un client Proph3t fédéré, scoppé sur l'utilisateur courant.
 * Le JWT de session est passé en `userToken` pour que la RLS s'applique.
 * @param societyId  société/tenant courant (multi-tenant), optionnel.
 */
export async function getProph3t(societyId?: string): Promise<Proph3tClient> {
  if (!PROPH3T_CORE_CONFIGURED) {
    throw new Error(
      'Proph3t core non configuré : définissez VITE_ATLAS_SUPABASE_URL / VITE_ATLAS_SUPABASE_ANON_KEY.'
    );
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return new Proph3tClient({
    product: PRODUCT,
    supabaseUrl: ATLAS_CORE_URL as string,
    apiKey: ATLAS_CORE_ANON as string,
    userToken: session?.access_token, // RLS appliquée ; sans token → endpoints publics seulement
    societyId,
  });
}

/**
 * Trace une action sensible dans l'audit chaîné SHA-256 du core (mode A).
 * Best-effort : ne jette jamais — l'audit ne doit pas casser le flux applicatif.
 * Renvoie `true` si l'entrée a bien été écrite.
 */
export async function logProph3tAudit(params: {
  action: string;
  subjectType?: string;
  subjectId?: string;
  content: Record<string, unknown>;
  societyId?: string;
}): Promise<boolean> {
  if (!PROPH3T_CORE_CONFIGURED) return false;
  try {
    const proph3t = await getProph3t(params.societyId);
    await proph3t.logAudit({
      action: params.action,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      content: params.content,
    });
    return true;
  } catch (err) {
    // Audit best-effort : on log en console mais on ne perturbe pas l'UX.
    console.warn('[proph3tCore] logAudit failed (non-blocking)', err);
    return false;
  }
}

// ============================================================
// MODE B — Hébergé : déléguer tout le tour à proph3t-ask
// ============================================================

export type Sensitivity = 'confidential' | 'internal' | 'public';

/**
 * Sensibilité par DÉFAUT de CockpitJourney = "internal" (données de gestion :
 * tâches, projets, objectifs, reporting — non publiques mais non régulées).
 */
export const DEFAULT_SENSITIVITY: Sensitivity = 'internal';

/**
 * Cartographie indicative de la sensibilité par type de donnée (cf. brief).
 * Sert à choisir le bon `sensitivity` à l'appel d'`askProph3t`.
 *   confidential → le core route Ollama/Claude UNIQUEMENT (aucune rétention).
 *   internal     → tous providers selon dispo.
 *   public       → tous providers selon dispo.
 */
export const SENSITIVITY_BY_DATA: Record<string, Sensitivity> = {
  // confidential — jamais vers un tier gratuit (gemini/groq).
  contrat: 'confidential',
  paie: 'confidential',
  rh: 'confidential',
  // internal — cœur de métier CockpitJourney.
  tache: 'internal',
  projet: 'internal',
  objectif: 'internal',
  reporting: 'internal',
  // public.
  support: 'public',
  doc: 'public',
  brouillon: 'public',
};

export interface AskResult {
  conversation_id: string;
  answer: string;
  citations: unknown[];
  confidence: number;
  disclaimer?: string;
}

/**
 * Pose une question à l'orchestrateur Proph3t hébergé (mode B).
 *
 * `sensitivity` gouverne les providers autorisés CÔTÉ CORE :
 *   - "confidential" → Ollama + Claude uniquement (aucune rétention).
 *     À utiliser pour contrats, paie, données RH, due diligence.
 *   - "internal" (défaut) / "public" → tous providers selon dispo.
 *
 * GARDE-FOU : ce chemin ne retombe JAMAIS sur l'agent local free-tier (Groq).
 * Si le core refuse une demande confidentielle (aucune clé Ollama/Claude), on
 * propage proprement l'erreur — aucune fuite vers un provider à rétention.
 */
export async function askProph3t(params: {
  message: string;
  sensitivity?: Sensitivity;
  conversationId?: string;
  societyId?: string;
}): Promise<AskResult> {
  if (!PROPH3T_CORE_CONFIGURED) {
    throw new Error(
      'Proph3t core non configuré : définissez VITE_ATLAS_SUPABASE_URL / VITE_ATLAS_SUPABASE_ANON_KEY.'
    );
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`${ATLAS_CORE_URL}/functions/v1/proph3t-ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ATLAS_CORE_ANON as string,
      Authorization: `Bearer ${session?.access_token ?? ATLAS_CORE_ANON}`,
    },
    body: JSON.stringify({
      message: params.message,
      product: PRODUCT,
      sensitivity: params.sensitivity ?? DEFAULT_SENSITIVITY,
      conversation_id: params.conversationId,
      society_id: params.societyId,
    }),
  });
  if (!res.ok) throw new Error(`proph3t-ask ${res.status}: ${await res.text()}`);
  return res.json();
}
