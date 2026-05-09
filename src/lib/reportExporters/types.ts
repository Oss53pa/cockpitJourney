/**
 * Shared types for the 4 report exporters (PDF / DOCX / XLSX / PPTX).
 *
 * The customizer dialog produces an `ExportOptions` object describing
 * what the user wants in their export. Each format-specific exporter
 * consumes that + the full `Report` (+ live tasks list, since reports
 * carry only counts) and emits a Blob the browser downloads.
 */
import type { Report } from '../../stores/appStore';
import type { Task, User } from '../../types';

export type ExportFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx';

export type SectionKey =
  | 'cover'
  | 'narrative'
  | 'metrics'
  | 'highlights'
  | 'projects'
  | 'tasks'
  | 'attention'
  | 'workload'
  | 'goals'
  | 'retards'
  | 'next_steps';

export interface ExportOptions {
  /** Sections to include, in order. */
  sections: SectionKey[];
  /** Restrict project breakdown + tasks to this set (undefined = all). */
  projectIds?: string[];
  /** Branding strip + headline color (defaults to the CockpitJourney sage). */
  brandColor?: string;
  /** Optional logo dataURL/URL for the cover page (PDF + DOCX + PPTX). */
  logoUrl?: string;
}

/** Bundle handed to every exporter. */
export interface ExportPayload {
  report: Report;
  tasks: Task[];
  users: User[];
  /** Map of project_id → name (for tasks where projectId is the only ref). */
  projectNames: Record<string, string>;
  options: ExportOptions;
}

/** Default sections — matches the 6 tabs in the in-app viewer. */
export const DEFAULT_SECTIONS: SectionKey[] = [
  'cover',
  'narrative',
  'metrics',
  'highlights',
  'projects',
  'tasks',
  'attention',
  'workload',
  'goals',
  'retards',
  'next_steps',
];

export const SECTION_LABELS: Record<SectionKey, string> = {
  cover: 'Page de garde',
  narrative: 'Synthèse exécutive (PROPH3T)',
  metrics: 'Indicateurs clés',
  highlights: 'Faits marquants',
  projects: 'Avancement par projet',
  tasks: 'Détail des tâches',
  attention: "Points d'attention",
  workload: 'Charge équipe',
  goals: 'Goals & OKRs',
  retards: 'Top retards',
  next_steps: 'Prochaines étapes',
};

export const FORMAT_LABELS: Record<ExportFormat, string> = {
  pdf: 'PDF',
  docx: 'Word (.docx)',
  xlsx: 'Excel (.xlsx)',
  pptx: 'PowerPoint (.pptx)',
};

export const FORMAT_DESCRIPTIONS: Record<ExportFormat, string> = {
  pdf: 'Document partageable, mise en page exécutive, idéal e-mail / impression.',
  docx: 'Document éditable Microsoft Word, parfait pour annoter et reformuler.',
  xlsx: 'Tableur Excel multi-onglets : un onglet par section, valeurs brutes manipulables.',
  pptx: 'Présentation PowerPoint, une diapo par section. Idéal CoDir / lecture rapide.',
};

/* ─── Helpers ─── */

/** Filter tasks to those visible in the export. */
export function filterTasks(payload: ExportPayload): Task[] {
  const { tasks, options } = payload;
  if (!options.projectIds || options.projectIds.length === 0) return tasks;
  const allow = new Set(options.projectIds);
  return tasks.filter((t) => allow.has(t.projectId));
}

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

/** "Rapport hebdo · 2026-W19.pdf" — slugified for the filesystem. */
export function buildFilename(report: Report, format: ExportFormat): string {
  const base = `${report.title}-${report.period}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base}.${format}`;
}

/** Map task status to a French label. */
export function taskStatusLabel(status: string): string {
  switch (status) {
    case 'todo':
      return 'À faire';
    case 'in_progress':
      return 'En cours';
    case 'in_review':
      return 'En revue';
    case 'done':
      return 'Terminée';
    case 'cancelled':
      return 'Annulée';
    default:
      return status;
  }
}

/** Map priority 1..4 → label. */
export function priorityLabel(p: number): string {
  return ['Faible', 'Normale', 'Haute', 'Critique'][p - 1] ?? String(p);
}

/** Format a date-like value → "DD/MM/YYYY" or "—". */
export function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
