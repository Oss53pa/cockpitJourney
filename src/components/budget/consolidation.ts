import type { BudgetLine, Expense, ExpenseStatus, Folder, Project } from '../../types';

/**
 * Consolidation budgétaire en cascade : DÉPENSES → PROJET → DOSSIER → PORTEFEUILLE.
 *
 * Toute la logique d'agrégation vit ici, en fonctions pures (zéro React, zéro
 * store) pour rester testable et réutilisable (panneau projet, vue portefeuille,
 * exports, PROPH3T en P3). Le principe : chaque niveau additionne les sommes du
 * niveau inférieur — un montant alloué/dépensé n'est jamais compté deux fois.
 *
 * Cadrage double :
 *   - top-down  = `allocated`  (l'enveloppe décidée, Σ des lignes budgétaires)
 *   - bottom-up = `spent`      (le réalisé remonté, Σ de toutes les dépenses)
 *   - écart     = `variance`   (allocated − spent ; négatif = dépassement)
 */

/** Seuil d'alerte d'un niveau, dérivé du % de consommation (spent / allocated). */
export type ThresholdLevel = 'ok' | 'warning' | 'reached' | 'over';

export interface BudgetSummary {
  /** Σ allocatedAmount des lignes — l'enveloppe top-down. */
  allocated: number;
  /** Σ montant de TOUTES les dépenses, tous statuts — le réalisé bottom-up. */
  spent: number;
  /** allocated − spent (positif = sous budget, négatif = dépassement). */
  variance: number;
  /** spent / allocated × 100 (0 si rien ; 100 si dépensé sans enveloppe). */
  pct: number;
  /** Engagement ferme = engagée + facturée + payée (exclut le prévisionnel). */
  committedFirm: number;
  /** Dépense ventilée par statut. */
  byStatus: Record<ExpenseStatus, number>;
  /** Nombre de lignes et de dépenses agrégées (pour les libellés « n … »). */
  lineCount: number;
  expenseCount: number;
}

export function emptyByStatus(): Record<ExpenseStatus, number> {
  return { planned: 0, committed: 0, invoiced: 0, paid: 0 };
}

const STATUS_KEYS: ExpenseStatus[] = ['planned', 'committed', 'invoiced', 'paid'];

/** % de consommation, robuste au budget nul (dépense sans enveloppe → 100 %). */
export function consumptionPct(spent: number, allocated: number): number {
  if (allocated > 0) return (spent / allocated) * 100;
  return spent > 0 ? 100 : 0;
}

/** Classe un % de consommation selon les seuils d'alerte 80 % / 100 % / dépassement. */
export function thresholdLevel(pct: number): ThresholdLevel {
  if (pct > 100) return 'over';
  if (pct >= 100) return 'reached';
  if (pct >= 80) return 'warning';
  return 'ok';
}

/**
 * Résumé budgétaire d'un ensemble plat de lignes + dépenses (déjà filtrées au
 * périmètre voulu). Chaque dépense est comptée exactement une fois.
 */
export function summarize(lines: BudgetLine[], expenses: Expense[]): BudgetSummary {
  const allocated = lines.reduce((s, l) => s + (l.allocatedAmount || 0), 0);
  const byStatus = emptyByStatus();
  let spent = 0;
  for (const e of expenses) {
    spent += e.amount;
    byStatus[e.status] += e.amount;
  }
  const committedFirm = byStatus.committed + byStatus.invoiced + byStatus.paid;
  return {
    allocated,
    spent,
    variance: allocated - spent,
    pct: consumptionPct(spent, allocated),
    committedFirm,
    byStatus,
    lineCount: lines.length,
    expenseCount: expenses.length,
  };
}

/** Agrège plusieurs résumés en un seul niveau supérieur (somme membre à membre). */
export function aggregate(summaries: BudgetSummary[]): BudgetSummary {
  const byStatus = emptyByStatus();
  let allocated = 0;
  let spent = 0;
  let committedFirm = 0;
  let lineCount = 0;
  let expenseCount = 0;
  for (const s of summaries) {
    allocated += s.allocated;
    spent += s.spent;
    committedFirm += s.committedFirm;
    lineCount += s.lineCount;
    expenseCount += s.expenseCount;
    for (const k of STATUS_KEYS) byStatus[k] += s.byStatus[k];
  }
  return {
    allocated,
    spent,
    variance: allocated - spent,
    pct: consumptionPct(spent, allocated),
    committedFirm,
    byStatus,
    lineCount,
    expenseCount,
  };
}

/* ─────────── Arborescence Portefeuille → Dossier → Projet ─────────── */

export interface ProjectBudgetNode {
  project: Project;
  summary: BudgetSummary;
}

export interface FolderBudgetNode {
  /** `null` = pseudo-dossier « Projets sans dossier ». */
  folder: Folder | null;
  projects: ProjectBudgetNode[];
  summary: BudgetSummary;
}

export interface PortfolioTree {
  folders: FolderBudgetNode[];
  summary: BudgetSummary;
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/**
 * Construit l'arbre de consolidation. Seuls les projets ayant une activité
 * budgétaire (enveloppe allouée OU dépense enregistrée) apparaissent — un projet
 * vide n'encombre pas la vue. Les dossiers sans projet actif sont omis ; les
 * projets sans dossier sont regroupés dans un bucket `folder: null`.
 *
 * Tri : dossiers par budget alloué décroissant (le pseudo-dossier en dernier),
 * projets par % de consommation décroissant (les plus tendus en tête).
 */
export function buildPortfolio(
  folders: Folder[],
  projects: Project[],
  lines: BudgetLine[],
  expenses: Expense[]
): PortfolioTree {
  const linesByProject = groupBy(lines, (l) => l.projectId);
  const expByProject = groupBy(expenses, (e) => e.projectId);

  const folderById = new Map(folders.map((f) => [f.id, f]));
  const projectsByFolder = new Map<string | null, ProjectBudgetNode[]>();

  for (const project of projects) {
    const summary = summarize(linesByProject.get(project.id) ?? [], expByProject.get(project.id) ?? []);
    if (summary.allocated === 0 && summary.spent === 0) continue; // pas d'activité → masqué
    const fid = project.folderId && folderById.has(project.folderId) ? project.folderId : null;
    const arr = projectsByFolder.get(fid);
    if (arr) arr.push({ project, summary });
    else projectsByFolder.set(fid, [{ project, summary }]);
  }

  const folderNodes: FolderBudgetNode[] = [];
  for (const [fid, projectNodes] of projectsByFolder) {
    projectNodes.sort((a, b) => b.summary.pct - a.summary.pct);
    folderNodes.push({
      folder: fid ? (folderById.get(fid) ?? null) : null,
      projects: projectNodes,
      summary: aggregate(projectNodes.map((p) => p.summary)),
    });
  }

  folderNodes.sort((a, b) => {
    // Le pseudo-dossier « Sans dossier » toujours en dernier.
    if (!a.folder && b.folder) return 1;
    if (a.folder && !b.folder) return -1;
    return b.summary.allocated - a.summary.allocated;
  });

  return {
    folders: folderNodes,
    summary: aggregate(folderNodes.map((f) => f.summary)),
  };
}
