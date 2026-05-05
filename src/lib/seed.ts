// First-launch seed for CockpitJourney.
//
// Runs ONCE per Supabase database (when cj_profiles is empty). After that,
// Supabase is the source of truth — the seed itself is just initial demo
// data, not application state.
//
// On subsequent logins by the same user (with cj_profiles already populated),
// we just link auth.users.id to the existing 'u_pame' profile if not done yet.

import { supabase } from './supabase';
import { isEmpty, persist, setCurrentProfileId } from './repo';
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

/* ───────────── Demo data (matches the previous Dexie seed) ───────────── */

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

/* ───────────── Bootstrap ───────────── */

/**
 * If the cj_* schema has no profiles yet, populate it from the demo data.
 * Returns true if seeding occurred.
 */
export async function seedDatabaseIfEmpty(): Promise<boolean> {
  if (!(await isEmpty())) return false;

  // Insert in FK-safe order. We use `persist.bulkPut` so writes go through
  // the same write-tracked queue as runtime mutations.
  await persist.bulkPut('users', users);
  await persist.bulkPut('folders', folders);
  await persist.bulkPut('projects', projects);
  await persist.bulkPut('sections', sections);
  await persist.bulkPut('tasks', tasks);
  await persist.bulkPut('goals', goals);
  await persist.bulkPut('comments', comments);
  await persist.bulkPut('notifications', notifications);
  await persist.bulkPut('insights', insights);
  await persist.bulkPut('automations', automations as never);
  await persist.bulkPut('forms', forms as never);
  await persist.bulkPut('attachments', attachments as never);
  await persist.bulkPut('dependencies', dependencies as never);
  await persist.bulkPut('activity', activity as never);
  await persist.bulkPut('subtasks', subtasks as never);
  await persist.bulkPut('notes', notes as never);

  // Settings — bind to the current profile (set by auth bootstrap).
  for (const [key, value] of Object.entries(defaultSettings)) {
    await persist.setSetting(key, value);
  }

  return true;
}

/**
 * Bind the authenticated auth.users.id to a cj_profiles row. By default
 * the demo seed creates 'u_pame' for Pamela; the first authenticated user
 * claims that profile (so the app maps "u_pame" everywhere to the real user).
 *
 * If no demo profile exists yet, the caller should run seedDatabaseIfEmpty()
 * first — but this function is safe to call multiple times.
 */
export async function linkAuthUserToProfile(authUserId: string, email: string) {
  // Try to claim the existing 'u_pame' profile if it has no auth_user_id yet
  // and matches the user's email (or there's no claim conflict).
  const { data: existing } = await supabase
    .from('cj_profiles')
    .select('id, auth_user_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (existing) {
    setCurrentProfileId((existing as { id: string }).id);
    return (existing as { id: string }).id;
  }

  // Pick the first unclaimed profile (preferring 'u_pame').
  const { data: candidates } = await supabase
    .from('cj_profiles')
    .select('id')
    .is('auth_user_id', null)
    .order('id', { ascending: true });

  let profileId: string;
  if (candidates && candidates.length > 0) {
    const pame = (candidates as { id: string }[]).find((p) => p.id === 'u_pame');
    profileId = pame ? pame.id : (candidates[0] as { id: string }).id;
    await supabase.from('cj_profiles').update({ auth_user_id: authUserId }).eq('id', profileId);
  } else {
    // No unclaimed profiles → create one fresh.
    profileId = `u_${authUserId.slice(0, 8)}`;
    const profile = {
      id: profileId,
      name: email.split('@')[0] || 'Utilisateur',
      initials: (email[0] || 'U').toUpperCase() + (email[1] || '').toUpperCase(),
      email,
      role: 'Utilisateur',
      color: '#95B07D',
    };
    await supabase.from('cj_profiles').insert({ id: profileId, auth_user_id: authUserId, data: profile });
  }

  setCurrentProfileId(profileId);
  return profileId;
}
