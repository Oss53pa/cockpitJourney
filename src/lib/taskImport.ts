// Import de tâches depuis un fichier CSV / Excel.
// ===================================================================
// Parse un .csv / .xlsx / .xls en lignes d'objets via la dépendance `xlsx`
// (déjà présente, utilisée par les exports). Fournit aussi une auto-détection
// des colonnes et la coercition vers le modèle Task.

import * as XLSX from 'xlsx';
import type { Priority, TaskStatus } from '../types';

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
}

/** Champs cibles mappables depuis les colonnes du fichier. */
export type ImportField = 'title' | 'description' | 'status' | 'priority' | 'dueDate' | 'tags';

export type ColumnMapping = Partial<Record<ImportField, string>>;

/** Lit un fichier (csv/xlsx/xls) → en-têtes + lignes (valeurs en string). */
export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = wb.Sheets[sheetName];
  // defval:'' → colonnes vides conservées ; raw:false → tout en texte (dates incluses).
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  const rows = json.map((r) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) out[k.trim()] = v == null ? '' : String(v).trim();
    return out;
  });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .trim();

const FIELD_ALIASES: Record<ImportField, string[]> = {
  title: ['title', 'titre', 'tache', 'task', 'nom', 'name', 'intitule', 'sujet'],
  description: ['description', 'desc', 'details', 'detail', 'note', 'notes'],
  status: ['status', 'statut', 'etat', 'etape', 'colonne', 'column'],
  priority: ['priority', 'priorite', 'prio', 'importance'],
  dueDate: ['duedate', 'due', 'echeance', 'date', 'deadline', 'date limite', 'datelimite'],
  tags: ['tags', 'tag', 'etiquettes', 'etiquette', 'labels', 'categorie', 'categories'],
};

/** Devine le mapping colonne→champ à partir des en-têtes. */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const field of Object.keys(FIELD_ALIASES) as ImportField[]) {
    const aliases = FIELD_ALIASES[field];
    const match = headers.find((h) => aliases.includes(norm(h)));
    if (match) mapping[field] = match;
  }
  // Fallback titre : première colonne si rien trouvé.
  if (!mapping.title && headers.length) mapping.title = headers[0];
  return mapping;
}

const STATUS_ALIASES: Record<string, TaskStatus> = {
  'a faire': 'todo',
  todo: 'todo',
  'to do': 'todo',
  backlog: 'todo',
  'en cours': 'in_progress',
  'in progress': 'in_progress',
  doing: 'in_progress',
  'en revue': 'in_review',
  revue: 'in_review',
  review: 'in_review',
  'en validation': 'in_review',
  termine: 'done',
  done: 'done',
  fait: 'done',
  fini: 'done',
  bloque: 'blocked',
  blocked: 'blocked',
};

export function coerceStatus(raw: string | undefined): TaskStatus | undefined {
  if (!raw) return undefined;
  return STATUS_ALIASES[norm(raw)] ?? undefined;
}

export function coercePriority(raw: string | undefined): Priority | undefined {
  if (!raw) return undefined;
  const n = norm(raw);
  if (['4', 'critique', 'critical', 'urgent', 'urgente', 'haute+'].includes(n)) return 4;
  if (['3', 'haute', 'high', 'elevee'].includes(n)) return 3;
  if (['2', 'normale', 'normal', 'moyenne', 'medium'].includes(n)) return 2;
  if (['1', 'faible', 'low', 'basse'].includes(n)) return 1;
  const num = Number(n);
  if (num >= 1 && num <= 4) return num as Priority;
  return undefined;
}

export function coerceDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  // Formats FR jj/mm/aaaa ou jj-mm-aaaa
  const m = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const [, dd, mm, yy] = m;
    const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    const dt = new Date(year, Number(mm) - 1, Number(dd));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  return undefined;
}

export interface PreparedTask {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  dueDate?: string;
  tags?: string[];
}

/** Applique le mapping aux lignes → tâches prêtes à créer (titres vides ignorés). */
export function buildTasks(rows: Record<string, string>[], mapping: ColumnMapping): PreparedTask[] {
  const out: PreparedTask[] = [];
  for (const row of rows) {
    const title = mapping.title ? (row[mapping.title] ?? '').trim() : '';
    if (!title) continue;
    const tagsRaw = mapping.tags ? row[mapping.tags] : '';
    const tags = tagsRaw
      ? tagsRaw
          .split(/[,;|]/)
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;
    out.push({
      title,
      description: mapping.description ? row[mapping.description] || undefined : undefined,
      status: coerceStatus(mapping.status ? row[mapping.status] : undefined),
      priority: coercePriority(mapping.priority ? row[mapping.priority] : undefined),
      dueDate: coerceDate(mapping.dueDate ? row[mapping.dueDate] : undefined),
      tags,
    });
  }
  return out;
}
