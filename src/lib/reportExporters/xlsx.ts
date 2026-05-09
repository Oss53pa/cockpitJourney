/**
 * XLSX exporter — uses SheetJS (xlsx).
 *
 * One sheet per included section, plus a "Synthèse" cover sheet. Cells
 * are kept as raw values (numbers stay numeric, dates stay dates) so
 * the recipient can sort, filter, pivot, etc. — that's the whole point
 * of an Excel export over a PDF.
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
} from './types';

function aoaSheet(rows: (string | number | null)[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(rows);
}

/** Set the first row's font/fill via XLSX cell styles (best-effort). */
function styleHeader(ws: XLSX.WorkSheet, ncols: number) {
  for (let c = 0; c < ncols; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[ref]) continue;
    // SheetJS Community drops style metadata on .xlsx export; we still
    // set it so power users on SheetJS-Pro see proper styling.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ws[ref] as any).s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '52693F' } },
      alignment: { horizontal: 'center' },
    };
  }
}

export async function exportToXlsx(payload: ExportPayload): Promise<void> {
  const { report, options, projectNames } = payload;
  const wb = XLSX.utils.book_new();

  /* ─── Cover / Synthèse ─── */
  if (options.sections.includes('cover') || options.sections.includes('narrative')) {
    const rows: (string | number | null)[][] = [
      ['CockpitJourney · Rapport'],
      [],
      ['Titre', report.title],
      ['Période', report.period],
      ['Généré le', formatDate(report.generatedAt)],
    ];
    if (options.sections.includes('narrative') && report.narrative) {
      rows.push([], ['Synthèse PROPH3T'], [report.narrative]);
    }
    const ws = aoaSheet(rows);
    ws['!cols'] = [{ wch: 22 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Synthèse');
  }

  /* ─── Metrics ─── */
  if (options.sections.includes('metrics') && report.metrics?.length) {
    const rows: (string | number | null)[][] = [
      ['Indicateur', 'Valeur', 'Évolution (%)'],
      ...report.metrics.map((m) => [m.label, m.value, m.delta ?? null]),
    ];
    const ws = aoaSheet(rows);
    ws['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 16 }];
    styleHeader(ws, 3);
    XLSX.utils.book_append_sheet(wb, ws, 'Indicateurs');
  }

  /* ─── Highlights / Next steps (combined when present) ─── */
  if (
    (options.sections.includes('highlights') && report.highlights?.length) ||
    (options.sections.includes('next_steps') && report.nextSteps?.length)
  ) {
    const rows: (string | number | null)[][] = [['Type', 'Élément']];
    if (options.sections.includes('highlights'))
      report.highlights?.forEach((h) => rows.push(['Fait marquant', h]));
    if (options.sections.includes('next_steps'))
      report.nextSteps?.forEach((s) => rows.push(['Prochaine étape', s]));
    const ws = aoaSheet(rows);
    ws['!cols'] = [{ wch: 18 }, { wch: 80 }];
    styleHeader(ws, 2);
    XLSX.utils.book_append_sheet(wb, ws, 'Faits & étapes');
  }

  /* ─── Projects ─── */
  if (options.sections.includes('projects') && report.projects?.length) {
    const allow = new Set(options.projectIds ?? []);
    const list = report.projects.filter((p) => allow.size === 0 || allow.has(p.projectId));
    const rows: (string | number | null)[][] = [
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
    styleHeader(ws, 11);
    XLSX.utils.book_append_sheet(wb, ws, 'Projets');
  }

  /* ─── Tasks ─── */
  if (options.sections.includes('tasks')) {
    const tasks = filterTasks(payload).filter((t) => t.status !== 'cancelled');
    const rows: (string | number | null)[][] = [
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
    styleHeader(ws, 7);
    XLSX.utils.book_append_sheet(wb, ws, 'Tâches');
  }

  /* ─── Attention ─── */
  if (options.sections.includes('attention') && report.attentionPoints?.length) {
    const rows: (string | number | null)[][] = [
      ['Sévérité', 'Périmètre', 'Sujet', 'Détail', 'Recommandation'],
      ...report.attentionPoints.map((a) => [a.severity, a.scope, a.title, a.detail, a.recommendation ?? '']),
    ];
    const ws = aoaSheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 30 }, { wch: 60 }, { wch: 60 }];
    styleHeader(ws, 5);
    XLSX.utils.book_append_sheet(wb, ws, "Points d'attention");
  }

  /* ─── Workload ─── */
  if (options.sections.includes('workload') && report.workload?.length) {
    const rows: (string | number | null)[][] = [
      ['Membre', 'Tâches ouvertes', 'Heures planifiées', 'Capacité', 'Statut'],
      ...report.workload.map((w) => [w.name, w.tasksOpen, w.plannedHours, w.capacityHours, w.status]),
    ];
    const ws = aoaSheet(rows);
    ws['!cols'] = [{ wch: 25 }, { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 14 }];
    styleHeader(ws, 5);
    XLSX.utils.book_append_sheet(wb, ws, 'Charge équipe');
  }

  /* ─── Goals ─── */
  if (options.sections.includes('goals') && report.goalsProgress?.length) {
    const rows: (string | number | null)[][] = [
      ['Objectif', 'Progression (%)', 'Évolution', 'Santé'],
      ...report.goalsProgress.map((g) => [g.title, g.pct, g.delta, g.health]),
    ];
    const ws = aoaSheet(rows);
    ws['!cols'] = [{ wch: 50 }, { wch: 16 }, { wch: 12 }, { wch: 12 }];
    styleHeader(ws, 4);
    XLSX.utils.book_append_sheet(wb, ws, 'Goals & OKRs');
  }

  /* ─── Top retards ─── */
  if (options.sections.includes('retards') && report.topRetards?.length) {
    const rows: (string | number | null)[][] = [
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
    styleHeader(ws, 5);
    XLSX.utils.book_append_sheet(wb, ws, 'Retards');
  }

  // Bail if we somehow ended up with zero sheets (xlsx.write throws otherwise).
  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, aoaSheet([['Aucune section sélectionnée']]), 'Vide');
  }

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, buildFilename(report, 'xlsx'));
}
