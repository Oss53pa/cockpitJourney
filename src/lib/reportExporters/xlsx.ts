/**
 * XLSX exporter — multi-sheet executive workbook.
 *
 * Sheet order:
 *   1. Couverture     — cover block (titre, période, classification, doc ref)
 *   2. Sommaire       — numbered list with hyperlinks to other sheets
 *   3..N Content      — 1 sheet per section, with autofilter + freeze pane
 *   N+1 Merci         — closing page (contact + legal + doc ref)
 *
 * SheetJS Community drops cell font/fill metadata at .xlsx write time,
 * but column widths, freeze panes, autofilter and hyperlinks survive.
 */
import * as XLSX from 'xlsx';
import {
  buildFilename,
  downloadBlob,
  filterTasks,
  formatDate,
  priorityLabel,
  taskStatusLabel,
  type ExportPayload,
  type SectionKey,
} from './types';
import { COPY, buildToc, buildDocRef, formatPeriodRange } from './design';

type Cell = string | number | null;

function aoaSheet(rows: Cell[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(rows);
}

/** Replace a cell with a hyperlink to another sheet (internal link). */
function linkCell(ws: XLSX.WorkSheet, r: number, c: number, sheetName: string, label: string) {
  const ref = XLSX.utils.encode_cell({ r, c });
  ws[ref] = {
    t: 's',
    v: label,
    l: { Target: `#'${sheetName}'!A1`, Tooltip: `Aller à ${sheetName}` },
  };
}

function kindEyebrow(kind: string): string {
  switch (kind) {
    case 'weekly':
      return 'RAPPORT HEBDOMADAIRE';
    case 'monthly':
      return 'BILAN MENSUEL';
    case 'quarterly':
      return 'BILAN TRIMESTRIEL';
    case 'annual':
      return 'BILAN ANNUEL';
    default:
      return 'RAPPORT';
  }
}

export async function exportToXlsx(payload: ExportPayload): Promise<void> {
  const { report, options, projectNames } = payload;
  const docRef = buildDocRef(report);
  const wb = XLSX.utils.book_new();

  // Map of section → resulting sheet name (for sommaire hyperlinks).
  const sheetForKey: Partial<Record<SectionKey, string>> = {};

  /* ─── 1. COVER ─── */
  const coverRows: Cell[][] = [
    [COPY.brandLong.toUpperCase()],
    [],
    [kindEyebrow(report.kind)],
    [report.title],
    [formatPeriodRange(report)],
    [report.period],
    [],
    [`${COPY.preparedBy} : ${COPY.brand}`],
    [`${COPY.generatedOn} : ${formatDate(report.generatedAt)}`],
    [],
    [`${COPY.classification}`],
    [`Document ref : ${docRef}`],
  ];
  const coverWs = aoaSheet(coverRows);
  coverWs['!cols'] = [{ wch: 80 }];
  coverWs['!rows'] = [{ hpt: 18 }, {}, {}, { hpt: 18 }, { hpt: 36 }, { hpt: 18 }];
  XLSX.utils.book_append_sheet(wb, coverWs, 'Couverture');

  /* ─── 2. SOMMAIRE — built last (need sheet names) ─── */

  /* ─── 3. CONTENT SHEETS ─── */
  if (options.sections.includes('narrative') && report.narrative) {
    const ws = aoaSheet([
      ['SYNTHÈSE PROPH3T'],
      [report.title],
      [formatPeriodRange(report)],
      [report.period],
      [],
      [report.narrative],
    ]);
    ws['!cols'] = [{ wch: 100 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Synthèse');
    sheetForKey.narrative = 'Synthèse';
  }

  if (options.sections.includes('metrics') && report.metrics?.length) {
    const rows: Cell[][] = [
      ['Indicateur', 'Valeur', 'Évolution (%)'],
      ...report.metrics.map((m) => [m.label, m.value, m.delta ?? null]),
    ];
    const ws = aoaSheet(rows);
    ws['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 16 }];
    ws['!freeze'] = { ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, 'Indicateurs');
    sheetForKey.metrics = 'Indicateurs';
  }

  if (
    (options.sections.includes('highlights') && report.highlights?.length) ||
    (options.sections.includes('next_steps') && report.nextSteps?.length)
  ) {
    const rows: Cell[][] = [['Type', 'Élément']];
    if (options.sections.includes('highlights'))
      report.highlights?.forEach((h) => rows.push(['Fait marquant', h]));
    if (options.sections.includes('next_steps'))
      report.nextSteps?.forEach((s) => rows.push(['Prochaine étape', s]));
    const ws = aoaSheet(rows);
    ws['!cols'] = [{ wch: 18 }, { wch: 100 }];
    ws['!freeze'] = { ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, 'Faits & étapes');
    if (options.sections.includes('highlights')) sheetForKey.highlights = 'Faits & étapes';
    if (options.sections.includes('next_steps')) sheetForKey.next_steps = 'Faits & étapes';
  }

  if (options.sections.includes('projects') && report.projects?.length) {
    const allow = new Set(options.projectIds ?? []);
    const list = report.projects.filter((p) => allow.size === 0 || allow.has(p.projectId));
    const rows: Cell[][] = [
      [
        'Projet',
        'Santé',
        'Avancement (%)',
        'Total',
        'Livrées',
        'En cours',
        'En retard',
        'Critiques',
        'Membres',
        'Synthèse',
        'Risque',
      ],
      ...list.map((p) => [
        p.name,
        p.health,
        p.progress,
        p.tasksTotal,
        p.tasksDone,
        p.tasksInProgress,
        p.tasksOverdue,
        p.tasksCritical,
        p.members,
        p.summary ?? '',
        p.riskNote ?? '',
      ]),
    ];
    const ws = aoaSheet(rows);
    ws['!cols'] = [
      { wch: 30 },
      { wch: 10 },
      { wch: 14 },
      { wch: 8 },
      { wch: 8 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 50 },
      { wch: 50 },
    ];
    ws['!autofilter'] = { ref: `A1:K${rows.length}` };
    ws['!freeze'] = { ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, 'Projets');
    sheetForKey.projects = 'Projets';
  }

  if (options.sections.includes('tasks')) {
    const tasks = filterTasks(payload).filter((t) => t.status !== 'cancelled');
    const rows: Cell[][] = [
      ['Projet', 'Tâche', 'Statut', 'Priorité', 'Échéance', 'Tags', 'Description'],
      ...tasks.map((t) => [
        projectNames[t.projectId] ?? t.projectId,
        t.title,
        taskStatusLabel(t.status),
        priorityLabel(t.priority),
        formatDate(t.dueDate),
        (t.tags ?? []).join(', '),
        t.description ?? '',
      ]),
    ];
    const ws = aoaSheet(rows);
    ws['!cols'] = [{ wch: 25 }, { wch: 50 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 25 }, { wch: 60 }];
    ws['!autofilter'] = { ref: `A1:G${rows.length}` };
    ws['!freeze'] = { ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, 'Tâches');
    sheetForKey.tasks = 'Tâches';
  }

  if (options.sections.includes('attention') && report.attentionPoints?.length) {
    const rows: Cell[][] = [
      ['Sévérité', 'Périmètre', 'Sujet', 'Détail', 'Recommandation'],
      ...report.attentionPoints.map((a) => [a.severity, a.scope, a.title, a.detail, a.recommendation ?? '']),
    ];
    const ws = aoaSheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 30 }, { wch: 60 }, { wch: 60 }];
    ws['!autofilter'] = { ref: `A1:E${rows.length}` };
    ws['!freeze'] = { ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, "Points d'attention");
    sheetForKey.attention = "Points d'attention";
  }

  if (options.sections.includes('workload') && report.workload?.length) {
    const rows: Cell[][] = [
      ['Membre', 'Tâches ouvertes', 'Heures planifiées', 'Capacité', 'Statut'],
      ...report.workload.map((w) => [w.name, w.tasksOpen, w.plannedHours, w.capacityHours, w.status]),
    ];
    const ws = aoaSheet(rows);
    ws['!cols'] = [{ wch: 25 }, { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 14 }];
    ws['!freeze'] = { ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, 'Charge équipe');
    sheetForKey.workload = 'Charge équipe';
  }

  if (options.sections.includes('goals') && report.goalsProgress?.length) {
    const rows: Cell[][] = [
      ['Objectif', 'Progression (%)', 'Évolution', 'Santé'],
      ...report.goalsProgress.map((g) => [g.title, g.pct, g.delta, g.health]),
    ];
    const ws = aoaSheet(rows);
    ws['!cols'] = [{ wch: 50 }, { wch: 16 }, { wch: 12 }, { wch: 12 }];
    ws['!freeze'] = { ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, 'Goals & OKRs');
    sheetForKey.goals = 'Goals & OKRs';
  }

  if (options.sections.includes('retards') && report.topRetards?.length) {
    const rows: Cell[][] = [
      ['Tâche', 'Projet', 'Jours de retard', 'Priorité', 'Responsable'],
      ...report.topRetards.map((r) => [
        r.title,
        r.projectName,
        r.daysLate,
        priorityLabel(r.priority),
        r.ownerInitials,
      ]),
    ];
    const ws = aoaSheet(rows);
    ws['!cols'] = [{ wch: 50 }, { wch: 25 }, { wch: 16 }, { wch: 12 }, { wch: 15 }];
    ws['!autofilter'] = { ref: `A1:E${rows.length}` };
    ws['!freeze'] = { ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, 'Retards');
    sheetForKey.retards = 'Retards';
  }

  /* ─── Closing ─── */
  const closingRows: Cell[][] = [
    [COPY.thanks],
    [],
    [COPY.thanksSub],
    [],
    ['CONTACT'],
    [COPY.contact],
    [COPY.studioWebsite],
    [],
    [],
    [COPY.legal],
    [],
    [`${docRef} · ${formatDate(report.generatedAt)}`],
  ];
  const closingWs = aoaSheet(closingRows);
  closingWs['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, closingWs, 'Merci');

  /* ─── 2. SOMMAIRE — built now that all sheets exist ─── */
  const toc = buildToc(options.sections);
  const summaryHeader: Cell[][] = [
    ['SOMMAIRE'],
    [report.title],
    [formatPeriodRange(report)],
    [report.period],
    [],
    ['#', 'Section', 'Onglet'],
  ];
  const summaryWs = aoaSheet(summaryHeader);
  toc.forEach((item, i) => {
    const targetSheet = sheetForKey[item.key];
    const r = summaryHeader.length + i;
    XLSX.utils.sheet_add_aoa(summaryWs, [[item.number, item.label, targetSheet ?? '—']], {
      origin: { r, c: 0 },
    });
    if (targetSheet) linkCell(summaryWs, r, 2, targetSheet, '→ Aller');
  });
  summaryWs['!cols'] = [{ wch: 6 }, { wch: 40 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Sommaire');

  // Reorder so Sommaire is 2nd
  const order = wb.SheetNames.slice();
  const summaryIdx = order.indexOf('Sommaire');
  order.splice(summaryIdx, 1);
  order.splice(1, 0, 'Sommaire');
  wb.SheetNames = order;

  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, aoaSheet([['Aucune section sélectionnée']]), 'Vide');
  }

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, buildFilename(report, 'xlsx'));
}
