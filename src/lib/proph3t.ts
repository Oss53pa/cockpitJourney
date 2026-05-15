// PROPH3T client — provider-agnostic, OpenAI-compatible chat completions.
// Default: Groq (free tier, llama-3.3-70b-versatile, no credit card needed).
// Falls back to mocked output if no API key is configured.

export type ProphProvider = 'groq' | 'openrouter' | 'ollama-cloud';

export interface ProphConfig {
  provider: ProphProvider;
  apiKey: string;
  model: string;
}

export const PROVIDERS: Record<
  ProphProvider,
  { label: string; baseUrl: string; defaultModel: string; doc: string }
> = {
  groq: {
    label: 'Groq (free, recommandé)',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    doc: 'console.groq.com — créer un compte gratuit → API Keys → créer clé `gsk_…`',
  },
  openrouter: {
    label: 'OpenRouter (free models)',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    doc: 'openrouter.ai/keys — créer clé `sk-or-…` (modèles `:free` gratuits)',
  },
  'ollama-cloud': {
    label: 'Ollama auto-hébergé / cloud',
    baseUrl: 'http://localhost:11434/v1/chat/completions',
    defaultModel: 'llama3.2',
    doc: 'Lancer Ollama localement ou pointer vers votre instance cloud (HF Spaces, fly.io, etc.)',
  },
};

const SYSTEM_PROMPT = `Tu es PROPH3T, l'IA d'Atlas Studio embarquée dans CockpitJourney.
Tu es factuel, concis, en français, orienté action.
Tu vouvoies l'utilisateur — un ou une dirigeant·e qui pilote son cockpit. Si son prénom est fourni dans le contexte, utilise-le ; sinon utilise "Vous" sans nom.
Tu ne dépasses pas 250 mots sauf si on te demande explicitement plus.
Tu utilises le markdown léger (titres, listes) quand ça aide la lecture.`;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class ProphClient {
  constructor(private config: ProphConfig) {}

  isConfigured(): boolean {
    return !!this.config.apiKey || this.config.provider === 'ollama-cloud';
  }

  async chat(
    messages: ChatMessage[],
    opts?: { temperature?: number; maxTokens?: number; json?: boolean }
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new ProphNotConfiguredError();
    }
    const provider = PROVIDERS[this.config.provider];
    const body: any = {
      model: this.config.model || provider.defaultModel,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      temperature: opts?.temperature ?? 0.4,
      max_tokens: opts?.maxTokens ?? 600,
    };
    if (opts?.json) body.response_format = { type: 'json_object' };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) headers['Authorization'] = `Bearer ${this.config.apiKey}`;

    const res = await fetch(provider.baseUrl, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${this.config.provider} ${res.status}: ${text || res.statusText}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || '';
  }
}

export class ProphNotConfiguredError extends Error {
  constructor() {
    super("PROPH3T n'est pas configuré. Ouvrez Paramètres → IA → coller votre clé Groq.");
    this.name = 'ProphNotConfiguredError';
  }
}

/* ───────────── Capability prompts ───────────── */

export interface ParsedTask {
  title: string;
  dueDate?: string; // ISO
  priority?: 1 | 2 | 3 | 4;
  tags?: string[];
  projectHint?: string;
  source?: string;
}

export async function parseTaskFromText(
  client: ProphClient,
  raw: string,
  context: { projects: { id: string; name: string }[]; today: string }
): Promise<ParsedTask> {
  const out = await client.chat(
    [
      {
        role: 'user',
        content: `Tu reçois une instruction en langage naturel. Extrait-en les métadonnées d'une tâche.

Aujourd'hui : ${context.today}.
Projets disponibles : ${context.projects.map((p) => p.name).join(', ')}.

Instruction : """${raw}"""

Réponds UNIQUEMENT avec un objet JSON valide :
{
  "title": "titre court et actionnable, sans la date ni le projet",
  "dueDate": "date ISO 8601 si une date est mentionnée (ex 'vendredi 15h'), sinon null",
  "priority": 1 (faible) | 2 (normale) | 3 (haute) | 4 (critique),
  "tags": ["tag1", "tag2"],
  "projectHint": "nom du projet le plus probable parmi la liste, sinon null"
}`,
      },
    ],
    { json: true, temperature: 0.2, maxTokens: 300 }
  );

  try {
    const parsed = JSON.parse(out);
    return {
      title: parsed.title || raw.trim(),
      dueDate: parsed.dueDate || undefined,
      priority: parsed.priority || 2,
      tags: parsed.tags || [],
      projectHint: parsed.projectHint || undefined,
    };
  } catch {
    return { title: raw.trim() };
  }
}

export async function generateDailyBrief(
  client: ProphClient,
  context: {
    user: string;
    date: string;
    tasks: { title: string; priority: number; project: string; due?: string }[];
    goalsCount: number;
    insights: { kind: string; title: string }[];
  }
): Promise<string> {
  return client.chat(
    [
      {
        role: 'user',
        content: `Génère le Daily Brief de ${context.user} pour le ${context.date}.

Tâches du jour (${context.tasks.length}) :
${context.tasks.map((t, i) => `${i + 1}. [P${t.priority}] ${t.title} — ${t.project}${t.due ? ` · ${t.due}` : ''}`).join('\n')}

Goals actifs : ${context.goalsCount}
Signaux PROPH3T : ${context.insights.map((i) => `${i.kind}: ${i.title}`).join(' · ')}

Format attendu :
- Une phrase d'ouverture personnalisée
- Section "## Top 3 priorités" avec puces
- Section "## Risques" si pertinent
- Section "## Suggestions" 1-2 lignes max
Reste sous 200 mots, ton factuel et bienveillant.`,
      },
    ],
    { temperature: 0.5, maxTokens: 500 }
  );
}

export async function summarizeProject(
  client: ProphClient,
  context: {
    projectName: string;
    tasksTotal: number;
    tasksDone: number;
    tasksOverdue: number;
    tasksCritical: number;
    health: string;
    endDate?: string;
  }
): Promise<string> {
  return client.chat(
    [
      {
        role: 'user',
        content: `Résume l'état du projet "${context.projectName}" en 100 mots maximum.

État :
- ${context.tasksDone}/${context.tasksTotal} tâches livrées
- ${context.tasksCritical} critique(s) en cours
- ${context.tasksOverdue} en retard
- Santé : ${context.health}
${context.endDate ? `- Échéance projet : ${context.endDate}` : ''}

Donne un verdict clair (vert/jaune/rouge), 2 risques principaux, 2 actions recommandées.`,
      },
    ],
    { temperature: 0.4, maxTokens: 350 }
  );
}

/* ───────────── Time-blocking ───────────── */

export type TimeBlockKind = 'brief' | 'focus' | 'task' | 'meeting' | 'break' | 'review' | 'admin';

export interface GeneratedTimeBlock {
  /** "HH:MM" 24h format, local time. */
  startTime: string;
  /** Duration in minutes. */
  durationMinutes: number;
  /** Short label (≤ 50 chars). */
  label: string;
  /** Block category — drives the icon + accent. */
  kind: TimeBlockKind;
  /** Optional task id this block is dedicated to (drawn from the candidate list). */
  taskId?: string;
  /** One-liner rationale from PROPH3T (≤ 80 chars). */
  rationale?: string;
}

/**
 * Ask PROPH3T to plan the user's day. Returns an ordered list of
 * non-overlapping time blocks anchored to their actual rhythm
 * (brief hour, capacity) and prioritized tasks.
 */
export async function generateTimeBlocks(
  client: ProphClient,
  context: {
    user: string;
    date: string;
    briefHour: number;
    dailyCapacityMinutes: number;
    tasks: {
      id: string;
      title: string;
      priority: number;
      project: string;
      estimateMinutes?: number;
      due?: string;
    }[];
  }
): Promise<GeneratedTimeBlock[]> {
  const tasksJson = JSON.stringify(
    context.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      project: t.project,
      estimateMinutes: t.estimateMinutes ?? null,
      due: t.due ?? null,
    })),
    null,
    2
  );

  const out = await client.chat(
    [
      {
        role: 'user',
        content: `Tu planifies la journée de ${context.user} pour le ${context.date}.

CONTRAINTES :
- Daily Brief à ${String(context.briefHour).padStart(2, '0')}:00 (durée 15 min, kind="brief").
- Capacité Deep Work cible : ${context.dailyCapacityMinutes} min sur la journée.
- Insère 1 pause active (~10 min) au moins toutes les 2h.
- Insère un déjeuner ~12:00-13:00 (kind="break").
- Termine par une revue de journée ~17:30-18:00 (kind="review", 15 min).
- Blocs Deep Work : 50-90 min (kind="focus"), avec un taskId pointant sur la tâche traitée.
- Pas de chevauchement, ordre chronologique strict.
- Travaille en heure locale (HH:MM 24h).

TÂCHES CANDIDATES (par priorité décroissante) :
${tasksJson}

Réponds UNIQUEMENT avec un objet JSON valide de la forme :
{
  "blocks": [
    {
      "startTime": "07:00",
      "durationMinutes": 15,
      "label": "Daily Brief PROPH3T",
      "kind": "brief",
      "rationale": "Cadrage de la journée"
    },
    ...
  ]
}

Le champ "taskId" est obligatoire pour kind="focus" ou kind="task", égal à l'id de la tâche traitée.
Aucune autre prose autour du JSON.`,
      },
    ],
    { json: true, temperature: 0.3, maxTokens: 1200 }
  );

  try {
    const parsed = JSON.parse(out);
    const blocks: unknown = parsed?.blocks;
    if (!Array.isArray(blocks)) return [];
    return blocks
      .map((b) => normalizeBlock(b as Record<string, unknown>))
      .filter((b): b is GeneratedTimeBlock => b !== null);
  } catch {
    return [];
  }
}

function normalizeBlock(raw: Record<string, unknown>): GeneratedTimeBlock | null {
  const startTime = typeof raw.startTime === 'string' ? raw.startTime : null;
  const durationMinutes = typeof raw.durationMinutes === 'number' ? raw.durationMinutes : null;
  const label = typeof raw.label === 'string' ? raw.label : null;
  const kindRaw = typeof raw.kind === 'string' ? raw.kind : null;
  const validKinds: TimeBlockKind[] = ['brief', 'focus', 'task', 'meeting', 'break', 'review', 'admin'];
  const kind = validKinds.find((k) => k === kindRaw) ?? 'admin';
  if (!startTime || !durationMinutes || !label) return null;
  // Guard against weird minute values from the LLM (e.g. 1200).
  const safeDuration = Math.max(5, Math.min(240, Math.round(durationMinutes)));
  // "9:00" → "09:00", reject malformed.
  const m = startTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return {
    startTime: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
    durationMinutes: safeDuration,
    label: label.slice(0, 80),
    kind,
    taskId: typeof raw.taskId === 'string' ? raw.taskId : undefined,
    rationale: typeof raw.rationale === 'string' ? raw.rationale.slice(0, 120) : undefined,
  };
}

export async function reformulateDescription(client: ProphClient, original: string): Promise<string> {
  return client.chat(
    [
      {
        role: 'user',
        content: `Reformule la description de tâche suivante en la structurant ainsi :
- **Impact** (en quoi c'est important)
- **Dépendances** (ce qui doit être fait avant/après)
- **Critère de succès** (comment on saura que c'est fini)

Description originale :
"""${original || '(vide)'}"""

Reste sous 120 mots.`,
      },
    ],
    { temperature: 0.3, maxTokens: 250 }
  );
}

export async function suggestContributingTasks(
  client: ProphClient,
  goal: { title: string; targetValue: number; currentValue: number; unit?: string }
): Promise<string[]> {
  const out = await client.chat(
    [
      {
        role: 'user',
        content: `Pour le Goal suivant, propose 5 à 7 tâches concrètes et actionnables qui contribueraient à l'atteindre.

Goal : "${goal.title}"
Cible : ${goal.targetValue}${goal.unit ? ' ' + goal.unit : ''} · Actuel : ${goal.currentValue}${goal.unit ? ' ' + goal.unit : ''}

Réponds UNIQUEMENT avec un objet JSON :
{ "tasks": ["tâche 1", "tâche 2", ...] }

Chaque tâche doit faire moins de 90 caractères, être verbale et mesurable.`,
      },
    ],
    { json: true, temperature: 0.6, maxTokens: 400 }
  );
  try {
    const parsed = JSON.parse(out);
    return Array.isArray(parsed.tasks) ? parsed.tasks : [];
  } catch {
    return [];
  }
}
