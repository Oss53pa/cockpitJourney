// Per-user demo seed for CockpitJourney.
//
// Runs ONCE per authenticated user (when their cj_profiles row count is 0).
// All seeded entities have namespaced IDs (`<8-char hash>_<original id>`)
// so two users with the same demo data don't collide on the global PK.
//
// The "self" profile is `<prefix>_u_pame` — that's the persona the user
// embodies when they log in. The other profiles (KJ, AD, MS, EV, AA, BEN)
// are demo teammates owned by the same auth user.

import { supabase } from './supabase';
import { isEmpty, persist, setCurrentProfileId, setCurrentAuthUserId } from './repo';
import {
  users,
  folders,
  projects,
  sections,
  tasks,
  goals,
  comments,
  notifications,
  insights,
} from '../data/mockData';

/* ───────────── Demo data extending the mockData seed ───────────── */

const automations = [
  {
    id: 'a1',
    name: 'Approbation prioritaire — Pamela',
    desc: 'Quand un statut passe à "En revue" ET assigné = Pame, envoyer WhatsApp.',
    enabled: true,
    runs: 247,
    success: 99.2,
    triggerKey: 'status_changed' as const,
    conditions: 2,
    actions: [
      { kind: 'whatsapp' as const, label: 'WhatsApp' },
      { kind: 'push' as const, label: 'Push' },
    ],
  },
  {
    id: 'a2',
    name: 'Escalade retard critique',
    desc: 'Quand échéance dépassée 2j ET priorité Critique → assigner manager + tag.',
    enabled: true,
    runs: 18,
    success: 94.0,
    triggerKey: 'due_overdue' as const,
    conditions: 3,
    actions: [
      { kind: 'tag' as const, label: 'Tag' },
      { kind: 'push' as const, label: 'Notification' },
      { kind: 'email' as const, label: 'Email' },
    ],
  },
  {
    id: 'a3',
    name: 'Onboarding client (template)',
    desc: 'Quand tâche créée depuis template "Onboarding" → 12 sous-tâches cascadées.',
    enabled: true,
    runs: 32,
    success: 100,
    triggerKey: 'task_created' as const,
    conditions: 1,
    actions: [
      { kind: 'subtasks' as const, label: '12 sous-tâches' },
      { kind: 'push' as const, label: 'Notification' },
    ],
  },
  {
    id: 'a4',
    name: 'Sprint hebdo — clôture vendredi 17h',
    desc: 'Récurrence vendredi 17h → générer rapport sprint + envoyer équipe.',
    enabled: false,
    runs: 8,
    success: 100,
    triggerKey: 'recurrence' as const,
    conditions: 0,
    actions: [
      { kind: 'report' as const, label: 'Rapport IA' },
      { kind: 'email' as const, label: 'Email' },
    ],
  },
];

const forms = [
  {
    id: 'f1',
    name: 'Demande de support client',
    description: 'Tickets entrants depuis le site public',
    projectId: 'p_cockpit',
    enabled: true,
    submissions: 47,
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    publicUrl: 'https://cockpitjourney.app/f/support-cj',
    fields: [
      {
        id: 'ff1',
        type: 'short_text' as const,
        label: 'Votre nom complet',
        required: true,
        placeholder: 'Pamela A.',
      },
      {
        id: 'ff2',
        type: 'email' as const,
        label: 'E-mail de contact',
        required: true,
        placeholder: 'pamela@…',
      },
      {
        id: 'ff3',
        type: 'select' as const,
        label: 'Catégorie',
        required: true,
        options: ['Bug', 'Demande de fonctionnalité', 'Question de facturation', 'Autre'],
      },
      {
        id: 'ff4',
        type: 'long_text' as const,
        label: 'Décrivez votre demande',
        required: true,
        placeholder: 'Soyez aussi précis que possible…',
      },
      { id: 'ff5', type: 'file' as const, label: "Capture d'écran (optionnel)" },
    ],
  },
  {
    id: 'f2',
    name: 'Inscription Webinar — Daily Brief',
    description: 'RSVP au webinar mensuel produit',
    projectId: 'p_cockpit',
    enabled: true,
    submissions: 124,
    createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
    publicUrl: 'https://cockpitjourney.app/f/webinar-2026',
    fields: [
      { id: 'fg1', type: 'short_text' as const, label: 'Prénom', required: true },
      { id: 'fg2', type: 'short_text' as const, label: 'Nom', required: true },
      { id: 'fg3', type: 'email' as const, label: 'E-mail professionnel', required: true },
      { id: 'fg4', type: 'short_text' as const, label: 'Entreprise' },
      {
        id: 'fg5',
        type: 'select' as const,
        label: 'Comment avez-vous connu CockpitJourney ?',
        options: ['LinkedIn', 'Bouche-à-oreille', 'Recherche Google', 'Autre'],
      },
      { id: 'fg6', type: 'checkbox' as const, label: 'Je consens à recevoir la newsletter' },
    ],
  },
];

const attachments = [
  {
    id: 'at1',
    taskId: 't_brief_design',
    name: 'maquette-daily-brief-v4.fig',
    size: '2.4 MB',
    kind: 'doc' as const,
    uploadedAt: new Date().toISOString(),
  },
  {
    id: 'at2',
    taskId: 't_brief_design',
    name: 'specs-typo-couleurs.pdf',
    size: '480 KB',
    kind: 'pdf' as const,
    uploadedAt: new Date().toISOString(),
  },
  {
    id: 'at3',
    taskId: 't_brief_design',
    name: 'preview-mobile.png',
    size: '1.1 MB',
    kind: 'img' as const,
    uploadedAt: new Date().toISOString(),
  },
];

const dependencies = [
  { id: 'd1', taskId: 't_brief_design', relatedTaskId: 't_proph3t_routing', relation: 'blocked_by' as const },
  { id: 'd2', taskId: 't_brief_design', relatedTaskId: 't_dashboard_widgets', relation: 'blocks' as const },
];

const activity = [
  {
    id: 'av1',
    taskId: 't_brief_design',
    actorId: 'u_kj',
    verb: 'a partagé',
    target: 'maquette-daily-brief-v4.fig',
    at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'av2',
    taskId: 't_brief_design',
    actorId: 'u_pame',
    verb: 'a changé la priorité',
    target: 'Critique',
    at: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: 'av3',
    taskId: 't_brief_design',
    actorId: 'u_am',
    verb: 'a commenté',
    target: '"Je propose qu\'on cap le brief..."',
    at: new Date(Date.now() - 10800000).toISOString(),
  },
  {
    id: 'av4',
    taskId: 't_brief_design',
    actorId: 'u_kj',
    verb: 'a déplacé vers',
    target: 'En cours',
    at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'av5',
    taskId: 't_brief_design',
    actorId: 'u_pame',
    verb: 'a créé la tâche',
    at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
];

const subtasks = [
  {
    id: 'st_seed1',
    taskId: 't_brief_design',
    title: 'Brief client envoyé',
    done: true,
    assigneeId: 'u_kj',
    position: 0,
  },
  {
    id: 'st_seed2',
    taskId: 't_brief_design',
    title: 'Maquette V1 partagée',
    done: true,
    assigneeId: 'u_kj',
    position: 1,
  },
  {
    id: 'st_seed3',
    taskId: 't_brief_design',
    title: 'Validation interne Atlas',
    done: true,
    assigneeId: 'u_pame',
    position: 2,
  },
  {
    id: 'st_seed4',
    taskId: 't_brief_design',
    title: 'Itération design system tokens',
    done: false,
    assigneeId: 'u_kj',
    position: 3,
  },
  {
    id: 'st_seed5',
    taskId: 't_brief_design',
    title: 'Handoff dev (specs Tiptap)',
    done: false,
    assigneeId: 'u_am',
    position: 4,
  },
];

const notes = [
  {
    taskId: 't_brief_design',
    markdown: `# Validation Daily Brief — notes design

## Décisions du 02/05
- **Hiérarchie 3 niveaux** : insight critique → focus du jour → détails contextuels
- **Accent ambre/sage** uniquement sur la CTA primaire ; reste en typographie pure
- **Token max 1500** côté LLaMA pour respecter latence p95 < 8s

## Open questions
- Doit-on avoir un mode \`compact\` pour mobile en plus du \`full\` ?
- Place de la mention "PROPH3T a libéré X heures" : header ou footer ?

## Liens utiles
- Maquette Figma v4 (cf. pièce jointe)
- PR #124 — matrice de routage`,
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
  },
];

const defaultSettings: Record<string, unknown> = {
  theme: 'light',
  locale: 'fr',
  weekStart: 1,
  dailyBriefHour: 7,
  soundsEnabled: true,
  notificationsEmail: true,
  notificationsPush: true,
  notificationsWhatsapp: true,
  proph3t: { provider: 'groq', apiKey: '', model: 'llama-3.3-70b-versatile' },
};

/* ───────────── Per-user namespacing ───────────── */

/**
 * Recursively rewrite every ID-like string in `value` by prepending the
 * user's 8-char prefix. The match pattern is intentionally strict so we
 * never mutate free-form user copy:
 *   u_, p_, s_, t_, g_, c_, n_, i_   → followed by [a-z0-9_-]
 *   a, f, d, av, at, ff, fg          → followed by digits (a1, f1, av5, at3)
 *   st_seed                          → fixed prefix for the seed subtasks
 *
 * The whole string must also have no spaces and ≤ 50 chars.
 *
 * Returns a deep clone — does NOT mutate the input.
 */
const ID_REGEX = /^(u_|p_|s_|t_|g_|c_|n_|i_)[a-z0-9_-]+$|^(a|f|d|av|at|ff|fg)\d+$|^st_seed\d+$/;

function shouldRewrite(s: string): boolean {
  return s.length <= 50 && !s.includes(' ') && ID_REGEX.test(s);
}

function nsClone<T>(value: T, prefix: string): T {
  if (typeof value === 'string') {
    return (shouldRewrite(value) ? `${prefix}_${value}` : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => nsClone(v, prefix)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = nsClone(v, prefix);
    }
    return out as T;
  }
  return value;
}

/* ───────────── Bootstrap (per-user) ───────────── */

/**
 * If the current authenticated user has no cj_profiles row, populate
 * the demo data into their namespace. Idempotent — safe to call on
 * every login.
 */
export async function seedDatabaseIfEmpty(): Promise<boolean> {
  if (!(await isEmpty())) return false;

  // Find the current authenticated user
  const { data: sessionData } = await supabase.auth.getSession();
  const authUserId = sessionData.session?.user.id;
  if (!authUserId) return false;

  const prefix = authUserId.slice(0, 8);

  // Insert in FK-safe order with namespaced IDs.
  await persist.bulkPut('users', nsClone(users, prefix));
  await persist.bulkPut('folders', nsClone(folders, prefix));
  await persist.bulkPut('projects', nsClone(projects, prefix));
  await persist.bulkPut('sections', nsClone(sections, prefix));
  await persist.bulkPut('tasks', nsClone(tasks, prefix));
  await persist.bulkPut('goals', nsClone(goals, prefix));
  await persist.bulkPut('comments', nsClone(comments, prefix));
  await persist.bulkPut('notifications', nsClone(notifications, prefix));
  await persist.bulkPut('insights', nsClone(insights, prefix));
  await persist.bulkPut('automations', nsClone(automations, prefix));
  await persist.bulkPut('forms', nsClone(forms, prefix));
  await persist.bulkPut('attachments', nsClone(attachments, prefix));
  await persist.bulkPut('dependencies', nsClone(dependencies, prefix));
  await persist.bulkPut('activity', nsClone(activity, prefix));
  await persist.bulkPut('subtasks', nsClone(subtasks, prefix));
  await persist.bulkPut('notes', nsClone(notes, prefix));

  // Settings: bind to the user's "self" profile (the cloned u_pame).
  setCurrentProfileId(`${prefix}_u_pame`);
  for (const [key, value] of Object.entries(defaultSettings)) {
    await persist.setSetting(key, value);
  }

  return true;
}

/**
 * Ensure the current auth user has a profile row to act as. We use
 * `<prefix>_u_pame` as the canonical "self" profile id since the seed
 * always creates it. If no seed has run yet (returning user, no demo
 * data), this still returns the conventional id so the rest of the
 * app keeps working.
 *
 * Called by appStore right after `setCurrentAuthUserId`. Returns the
 * profileId to wire into the in-memory store.
 */
export async function linkAuthUserToProfile(authUserId: string, email: string) {
  setCurrentAuthUserId(authUserId);
  const prefix = authUserId.slice(0, 8);
  const expectedSelfId = `${prefix}_u_pame`;

  // Check if the self profile already exists
  const { data: existing } = await supabase
    .from('cj_profiles')
    .select('id')
    .eq('auth_user_id', authUserId)
    .eq('id', expectedSelfId)
    .maybeSingle();

  if (existing) {
    setCurrentProfileId(expectedSelfId);
    return expectedSelfId;
  }

  // No self profile — make one (covers the case of an existing user
  // whose seed somehow didn't run, or who came in fresh).
  const profile = {
    id: expectedSelfId,
    name: email.split('@')[0] || 'Utilisateur',
    initials: ((email[0] || 'U').toUpperCase() + (email[1] || '')).toUpperCase().slice(0, 2),
    email,
    role: 'CEO · Atlas Studio',
    color: '#95B07D',
  };
  await persist.put('users', profile);

  setCurrentProfileId(expectedSelfId);
  return expectedSelfId;
}
