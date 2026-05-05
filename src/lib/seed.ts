// Initial database seed — populated only on first launch (when DB is empty).
// After that, Dexie is the source of truth. The seed itself is just initial data,
// not application state.

import { db, isEmpty } from './db';
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

const reports: any[] = [];

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

export async function seedDatabaseIfEmpty(): Promise<boolean> {
  if (!(await isEmpty())) return false;

  await db.transaction(
    'rw',
    [
      db.users,
      db.folders,
      db.projects,
      db.sections,
      db.tasks,
      db.goals,
      db.comments,
      db.notifications,
      db.insights,
      db.automations,
      db.forms,
      db.reports,
      db.attachments,
      db.dependencies,
      db.activity,
      db.subtasks,
      db.notes,
      db.settings,
    ],
    async () => {
      await db.users.bulkPut(users);
      await db.folders.bulkPut(folders);
      await db.projects.bulkPut(projects);
      await db.sections.bulkPut(sections);
      await db.tasks.bulkPut(tasks);
      await db.goals.bulkPut(goals);
      await db.comments.bulkPut(comments);
      await db.notifications.bulkPut(notifications);
      await db.insights.bulkPut(insights);
      await db.automations.bulkPut(automations as any);
      await db.forms.bulkPut(forms as any);
      await db.reports.bulkPut(reports as any);
      await db.attachments.bulkPut(attachments as any);
      await db.dependencies.bulkPut(dependencies as any);
      await db.activity.bulkPut(activity as any);
      await db.subtasks.bulkPut(subtasks as any);
      await db.notes.bulkPut(notes as any);
      await db.settings.bulkPut(Object.entries(defaultSettings).map(([key, value]) => ({ key, value })));
    }
  );

  return true;
}
