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
import { persist, setCurrentProfileId, setCurrentAuthUserId, getCurrentProfileId } from './repo';
// mockData (full demo personas: Pamela, Koffi, Aminata, Cosmos Group,
// DocJourney…) is dev-only — it's never seeded into a production
// account. We dynamic-import it from the two functions that need it
// (seedFullDemo + buildOfflineSnapshot) so Vite tree-shakes the whole
// 17 KB out of the prod bundle.

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
 * Unified boot path — combines what used to be three separate Supabase
 * round-trips (isEmpty + linkAuthUserToProfile SELECT + a possible
 * second profile INSERT) into ONE: a single SELECT against cj_profiles.
 *
 *   • Profile exists → use it. Returning user, zero extra writes.
 *   • Profile missing → run the appropriate seed (clean-starter in prod,
 *     full demo in dev). The seed sets currentProfileId itself.
 *
 * This is THE function the app should call after auth resolves —
 * `seedDatabaseIfEmpty` + `linkAuthUserToProfile` are kept as exports
 * only for backward compatibility / explicit re-link scenarios.
 */
export async function bootstrapUserData(
  authUserId: string,
  user: { email?: string | null; user_metadata?: Record<string, unknown> }
): Promise<{ profileId: string; seeded: boolean }> {
  setCurrentAuthUserId(authUserId);

  // Single SELECT — replaces both isEmpty() and the old linkAuthUserToProfile lookup.
  const { data: rows, error } = await supabase
    .from('cj_profiles')
    .select('id')
    .eq('auth_user_id', authUserId)
    .order('id')
    .limit(1);
  if (error) {
    console.warn('[bootstrap] cj_profiles lookup failed', error);
  }

  const existingId = (rows && (rows[0] as { id?: string } | undefined))?.id;
  if (existingId) {
    setCurrentProfileId(existingId);
    return { profileId: existingId, seeded: false };
  }

  // No profile yet → seed.
  const useFullDemo = import.meta.env.DEV || import.meta.env.VITE_SEED_DEMO === '1';
  if (useFullDemo) {
    await seedFullDemo(authUserId, user.email ?? '');
  } else {
    await seedCleanStarter(authUserId, user);
  }

  // Both seed paths call setCurrentProfileId themselves; read back the
  // value they wrote rather than re-deriving it here.
  const profileId = getCurrentProfileId() ?? `${authUserId.slice(0, 8)}_u_me`;
  return { profileId, seeded: true };
}

/**
 * Production seed: just the user's profile + one starter project +
 * three onboarding tasks. The user is the ONLY profile, the ONLY
 * assignee, the ONLY owner. Zero hardcoded names from anyone else.
 */
async function seedCleanStarter(
  authUserId: string,
  user: { email?: string | null; user_metadata?: Record<string, unknown> }
): Promise<boolean> {
  const prefix = authUserId.slice(0, 8);
  const meta = (user.user_metadata ?? {}) as { full_name?: string };
  const email = user.email ?? '';
  const fullName = meta.full_name?.trim() || extractNameFromEmail(email);
  const initials = computeInitials(fullName);

  const profileId = `${prefix}_u_me`;
  setCurrentProfileId(profileId);
  setCurrentAuthUserId(authUserId);

  const now = new Date();
  const isoNow = now.toISOString();
  const today = new Date(now);
  today.setHours(17, 0, 0, 0);
  const inThreeDays = new Date(now);
  inThreeDays.setDate(inThreeDays.getDate() + 3);
  inThreeDays.setHours(17, 0, 0, 0);

  const userProfile = {
    id: profileId,
    name: fullName,
    initials,
    email,
    color: '#6E8B58', // atlas-sage-deep
    role: 'admin' as const,
    status: 'online' as const,
    createdAt: isoNow,
  };

  const projectId = `${prefix}_p_starter`;

  // Default folders, grouped by sphere (personnel / professionnel) — the
  // sidebar renders these in 2 headers so the user organizes their
  // life cleanly from day 1. The starter project lives in Personnel.
  const folderPersonnel = {
    id: `${prefix}_f_personal`,
    name: 'Personnel',
    color: '#6E8B58',
    icon: 'briefcase',
    sphere: 'personnel' as const,
    order: 0,
    projectIds: [projectId],
    createdAt: isoNow,
  };
  const folderFamille = {
    id: `${prefix}_f_famille`,
    name: 'Famille',
    color: '#D58FA7',
    icon: 'home',
    sphere: 'personnel' as const,
    order: 1,
    projectIds: [] as string[],
    createdAt: isoNow,
  };
  const folderEntreprise = {
    id: `${prefix}_f_entreprise`,
    name: 'Entreprise',
    color: '#8AA6C4',
    icon: 'building-2',
    sphere: 'professionnel' as const,
    order: 0,
    projectIds: [] as string[],
    createdAt: isoNow,
  };
  const allFolders = [folderPersonnel, folderFamille, folderEntreprise];

  const project = {
    id: projectId,
    name: 'Mon premier projet',
    slug: 'mon-premier-projet',
    description:
      'Découvrez CockpitJourney en trois étapes. Cliquez sur chaque tâche pour voir comment elles s’éditent — ou créez les vôtres.',
    color: '#6E8B58',
    icon: 'target',
    folderId: folderPersonnel.id,
    ownerId: profileId,
    status: 'active' as const,
    // Fields required by the Project type — must be populated or
    // ProjectView crashes on .map() / renders "undefined%". Solo user,
    // brand-new project, healthy by default.
    health: 'green' as const,
    progress: 0,
    taskCount: 3,
    membersIds: [profileId],
    createdAt: isoNow,
    updatedAt: isoNow,
  };

  // Section type requires `position` (NOT `order`) and `color`. The
  // previous seed used `order: N` with no color — the Kanban board
  // sorted by undefined and rendered columns without their accent.
  const sectionTodo = {
    id: `${prefix}_s_todo`,
    projectId: project.id,
    name: 'À faire',
    color: '#94A3B8', // slate-400 — neutral grey for "to do"
    position: 0,
    createdAt: isoNow,
    updatedAt: isoNow,
  };
  const sectionInProgress = {
    id: `${prefix}_s_progress`,
    projectId: project.id,
    name: 'En cours',
    color: '#6E8B58', // atlas-sage-deep — same accent as the project
    position: 1,
    createdAt: isoNow,
    updatedAt: isoNow,
  };
  const sectionDone = {
    id: `${prefix}_s_done`,
    projectId: project.id,
    name: 'Terminé',
    color: '#22C55E', // signal-green — success
    position: 2,
    createdAt: isoNow,
    updatedAt: isoNow,
  };

  const onboardingTasks = [
    {
      id: `${prefix}_t_welcome`,
      projectId: project.id,
      sectionId: sectionTodo.id,
      title: 'Bienvenue sur CockpitJourney',
      description:
        'Cliquez sur cette tâche pour voir le drawer latéral. Modifiez le titre, ajoutez une description, jouez avec les priorités et les tags. Marquez "Terminée" quand vous avez exploré.',
      status: 'todo' as const,
      priority: 3,
      dueDate: today.toISOString(),
      assignees: [profileId],
      tags: ['onboarding'],
      createdAt: isoNow,
      updatedAt: isoNow,
    },
    {
      id: `${prefix}_t_brief`,
      projectId: project.id,
      sectionId: sectionTodo.id,
      title: 'Configurer mon Daily Brief PROPH3T',
      description:
        'Allez dans Paramètres → IA pour coller votre clé Groq (gratuite, 30 req/min). Ensuite, PROPH3T générera votre Daily Brief chaque matin à 7h avec les top 3 priorités, risques détectés et fenêtres Deep Work.',
      status: 'todo' as const,
      priority: 2,
      dueDate: today.toISOString(),
      assignees: [profileId],
      tags: ['onboarding', 'PROPH3T'],
      createdAt: isoNow,
      updatedAt: isoNow,
    },
    {
      id: `${prefix}_t_team`,
      projectId: project.id,
      sectionId: sectionTodo.id,
      title: 'Inviter mon équipe',
      description:
        'CockpitJourney est meilleur en équipe. Allez dans Paramètres → Utilisateurs pour inviter vos collègues — ils recevront un e-mail et arriveront directement dans votre tenant.',
      status: 'todo' as const,
      priority: 3,
      dueDate: inThreeDays.toISOString(),
      assignees: [profileId],
      tags: ['onboarding'],
      createdAt: isoNow,
      updatedAt: isoNow,
    },
  ];

  // Parallelize ALL writes: every bulkPut + every setSetting is an
  // independent upsert keyed on its own PK / (profile_id,key) → there's
  // no cross-row FK enforcement issue here (FKs are nullable in cj_*
  // and the rows we're inserting only reference each other, not anything
  // that needs to land first). Going from ~15 serial round-trips to 1
  // parallel batch shaves 2-3s off cold boot on a clean account.
  console.info('[seed-clean] → parallel upserts (entities + settings)');
  const t0 = performance.now();
  const settled = await Promise.allSettled([
    persist.bulkPut('users', [userProfile]),
    persist.bulkPut('folders', allFolders),
    persist.bulkPut('projects', [project]),
    persist.bulkPut('sections', [sectionTodo, sectionInProgress, sectionDone]),
    persist.bulkPut('tasks', onboardingTasks),
    ...Object.entries(defaultSettings).map(([k, v]) => persist.setSetting(k, v)),
  ]);
  const failed = settled.filter((r) => r.status === 'rejected');
  if (failed.length) {
    console.warn(`[seed-clean] ${failed.length}/${settled.length} writes rejected`, failed);
  }
  console.info(`[seed-clean] DONE — clean starter deployed in ${Math.round(performance.now() - t0)}ms`);
  return true;
}

/**
 * Dev-only seed: clone the full mockData demo into the user's
 * namespace. Useful for screenshots, UX testing, multi-user feature
 * demos. Never fires in production.
 */
async function seedFullDemo(authUserId: string, _email: string): Promise<boolean> {
  void _email;
  const prefix = authUserId.slice(0, 8);
  setCurrentProfileId(`${prefix}_u_pame`);
  console.info('[seed-demo] prefix:', prefix);

  // Dynamic import — keeps mockData out of the prod bundle.
  const { users, folders, projects, sections, tasks, goals, comments, notifications, insights } =
    await import('../data/mockData');

  const notificationsWithRecipient = notifications.map((n) => ({ ...n, userId: 'u_pame' }));

  const stepWithTimeout = async (label: string, work: () => Promise<unknown>) => {
    console.info('[seed-demo] →', label);
    const t0 = performance.now();
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const watchdogPromise = new Promise<'__timeout__'>((resolve) => {
      watchdog = setTimeout(() => {
        console.warn(`[seed-demo] ⚠ ${label} > 8s — moving on`);
        resolve('__timeout__');
      }, 8000);
    });
    try {
      const result = await Promise.race([work(), watchdogPromise]);
      const ms = Math.round(performance.now() - t0);
      if (result === '__timeout__') console.warn(`[seed-demo] ${label} timed out after ${ms}ms`);
      else console.info(`[seed-demo] ✓ ${label} (${ms}ms)`);
    } catch (err) {
      console.error(`[seed-demo] ✗ ${label} failed`, err);
    } finally {
      if (watchdog) clearTimeout(watchdog);
    }
  };

  await stepWithTimeout('users (cj_profiles)', () => persist.bulkPut('users', nsClone(users, prefix)));
  await stepWithTimeout('folders', () => persist.bulkPut('folders', nsClone(folders, prefix)));
  await stepWithTimeout('projects', () => persist.bulkPut('projects', nsClone(projects, prefix)));
  await stepWithTimeout('sections', () => persist.bulkPut('sections', nsClone(sections, prefix)));
  await stepWithTimeout('tasks', () => persist.bulkPut('tasks', nsClone(tasks, prefix)));
  await stepWithTimeout('goals', () => persist.bulkPut('goals', nsClone(goals, prefix)));
  await stepWithTimeout('comments', () => persist.bulkPut('comments', nsClone(comments, prefix)));
  await stepWithTimeout('notifications', () =>
    persist.bulkPut('notifications', nsClone(notificationsWithRecipient, prefix))
  );
  await stepWithTimeout('insights', () => persist.bulkPut('insights', nsClone(insights, prefix)));
  await stepWithTimeout('automations', () => persist.bulkPut('automations', nsClone(automations, prefix)));
  await stepWithTimeout('forms', () => persist.bulkPut('forms', nsClone(forms, prefix)));
  await stepWithTimeout('attachments', () => persist.bulkPut('attachments', nsClone(attachments, prefix)));
  await stepWithTimeout('dependencies', () => persist.bulkPut('dependencies', nsClone(dependencies, prefix)));
  await stepWithTimeout('activity', () => persist.bulkPut('activity', nsClone(activity, prefix)));
  await stepWithTimeout('subtasks', () => persist.bulkPut('subtasks', nsClone(subtasks, prefix)));
  await stepWithTimeout('notes', () => persist.bulkPut('notes', nsClone(notes, prefix)));

  console.info('[seed-demo] → settings (per-key)');
  for (const [key, value] of Object.entries(defaultSettings)) {
    await persist.setSetting(key, value);
  }
  console.info('[seed-demo] DONE');
  return true;
}

/** Best-effort name extraction from an e-mail address: "j.dupont@x.com" → "J. Dupont". */
export function extractNameFromEmail(email: string): string {
  if (!email) return 'Vous';
  const local = email.split('@')[0] || '';
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) =>
        part.length === 1 ? part.toUpperCase() + '.' : part.charAt(0).toUpperCase() + part.slice(1)
      )
      .join(' ') || 'Vous'
  );
}

export function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'V';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Build an in-memory snapshot of the demo data, namespaced for the given
 * auth user, WITHOUT touching Supabase. Used as a fallback when Supabase
 * REST is unreachable (corporate proxy, browser extension, etc.) so the
 * cockpit at least renders and the user can see the UI work.
 *
 * In offline mode mutations stay in-memory only — they are logged but
 * not persisted. A banner in the UI tells the user about the degraded mode.
 */
export async function buildOfflineSnapshot(authUserId: string) {
  const prefix = authUserId.slice(0, 8);
  // Dynamic import — keeps mockData out of the prod bundle. This
  // function is only called by the DEV-only offline fallback in
  // appStore.hydrateFromSupabase; prod never reaches this branch.
  const { users, folders, projects, sections, tasks, goals, comments, notifications, insights } =
    await import('../data/mockData');
  const notifsWithRecipient = notifications.map((n) => ({ ...n, userId: 'u_pame' }));
  return {
    users: nsClone(users, prefix),
    folders: nsClone(folders, prefix),
    projects: nsClone(projects, prefix),
    sections: nsClone(sections, prefix),
    tasks: nsClone(tasks, prefix),
    goals: nsClone(goals, prefix),
    comments: nsClone(comments, prefix),
    notifications: nsClone(notifsWithRecipient, prefix),
    insights: nsClone(insights, prefix),
    automations: nsClone(automations, prefix),
    forms: nsClone(forms, prefix),
    reports: [],
    attachments: nsClone(attachments, prefix),
    dependencies: nsClone(dependencies, prefix),
    activity: nsClone(activity, prefix),
    notes: nsClone(notes, prefix),
    subtasks: nsClone(subtasks, prefix),
    settings: defaultSettings,
    selfProfileId: `${prefix}_u_pame`,
  };
}

// (`linkAuthUserToProfile` was removed when `bootstrapUserData` above
// replaced the seed → link → load 3-step sequence. The boot path is now
// a single SELECT against cj_profiles.)
