/**
 * PDF exporter — uses jsPDF + jspdf-autotable.
 *
 * Layout:
 *   - Cover page with brand strip + report title + period
 *   - Optional narrative (markdown stripped to plain text)
 *   - Metrics grid
 *   - Per-project breakdown with progress bar + counts + task table
 *   - Attention / workload / goals / retards / next_steps tables
 *
 * The whole thing is generated in pure JS — no server round-trip. The
 * output is a Blob the caller pushes to the browser via `downloadBlob`.
 */
import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';

/** jsPDF instance with the autotable side-effect attached. */
type DocWithAutotable = jsPDF & { lastAutoTable: { finalY: number } };
import {
  buildFilename,
  downloadBlob,
  filterTasks,
  formatDate,
  priorityLabel,
  SECTION_LABELS,
  taskStatusLabel,
  type ExportPayload,
} from './types';

const SAGE = '#52693F';
const SAGE_LIGHT = '#EEF4E9';
const FG_DARK = '#1A1D17';
const FG_MUTED = '#7A8071';
const LINE = '#DCD9CB';
const RED = '#B85B4D';
const GREEN = '#4D9A6A';
const YELLOW = '#B69248';

/* ────────────────────── helpers ────────────────────── */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function healthHex(h?: 'green' | 'yellow' | 'red'): string {
  return h === 'red' ? RED : h === 'yellow' ? YELLOW : GREEN;
}

/** Strip markdown to plain text — good enough for PDF prose. */
function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, '');
}

/* ────────────────────── main ────────────────────── */

export async function exportToPdf(payload: ExportPayload): Promise<void> {
  const { report, options, projectNames } = payload;
  const brandHex = options.brandColor ?? SAGE;
  const brand = hexToRgb(brandHex);
  const muted = hexToRgb(FG_MUTED);
  const dark = hexToRgb(FG_DARK);

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48; // margin
  let y = M;

  /** Move down + paginate. Adds a small "page n / N" footer at the bottom. */
  const ensureSpace = (need: number) => {
    if (y + need > H - M) {
      doc.addPage();
      y = M;
    }
  };

  const drawHeading = (text: string, opts: { large?: boolean } = {}) => {
    ensureSpace(opts.large ? 60 : 36);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...brand);
    doc.setFontSize(opts.large ? 22 : 13);
    doc.text(text.toUpperCase(), M, y);
    y += opts.large ? 28 : 18;
    // sage underline
    doc.setDrawColor(...brand);
    doc.setLineWidth(opts.large ? 1.4 : 0.8);
    doc.line(M, y - 8, M + (opts.large ? 60 : 30), y - 8);
    y += 6;
  };

  const drawText = (text: string, size = 10) => {
    if (!text) return;
    ensureSpace(size + 4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...dark);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, W - 2 * M);
    for (const line of lines) {
      ensureSpace(size + 2);
      doc.text(line, M, y);
      y += size + 2;
    }
    y += 4;
  };

  /* ─── Cover ─── */
  if (options.sections.includes('cover')) {
    // Top sage strip
    doc.setFillColor(...brand);
    doc.rect(0, 0, W, 4, 'F');
    y = 100;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...dark);
    doc.setFontSize(28);
    const titleLines = doc.splitTextToSize(report.title, W - 2 * M);
    titleLines.forEach((line: string) => {
      doc.text(line, M, y);
      y += 32;
    });
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...muted);
    doc.setFontSize(11);
    doc.text(report.period, M, y);
    y += 18;
    doc.setFontSize(9);
    doc.text(`Généré le ${formatDate(report.generatedAt)} · CockpitJourney`, M, y);
    // Add page break before the body content
    doc.addPage();
    y = M;
  }

  /* ─── Narrative ─── */
  if (options.sections.includes('narrative') && report.narrative) {
    drawHeading(SECTION_LABELS.narrative);
    drawText(stripMarkdown(report.narrative));
    y += 8;
  }

  /* ─── Metrics ─── */
  if (options.sections.includes('metrics') && report.metrics?.length) {
    drawHeading(SECTION_LABELS.metrics);
    const rows: RowInput[] = report.metrics.map((m) => [
      m.label,
      m.value,
      typeof m.delta === 'number' ? `${m.delta >= 0 ? '+' : ''}${m.delta}%` : '—',
    ]);
    autoTable(doc, {
      startY: y,
      head: [['Indicateur', 'Valeur', 'Évolution']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: brand, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 10, textColor: dark },
      alternateRowStyles: { fillColor: hexToRgb(SAGE_LIGHT) },
      columnStyles: { 1: { fontStyle: 'bold' }, 2: { halign: 'right' } },
      margin: { left: M, right: M },
    });
    y = (doc as DocWithAutotable).lastAutoTable.finalY + 14;
  }

  /* ─── Highlights ─── */
  if (options.sections.includes('highlights') && report.highlights?.length) {
    drawHeading(SECTION_LABELS.highlights);
    report.highlights.forEach((h, i) => {
      drawText(`${i + 1}. ${h}`);
    });
  }

  /* ─── Projects ─── */
  if (options.sections.includes('projects') && report.projects?.length) {
    drawHeading(SECTION_LABELS.projects, { large: true });
    const allowProjects = new Set(options.projectIds ?? []);
    const projects = report.projects.filter(
      (p) => allowProjects.size === 0 || allowProjects.has(p.projectId)
    );
    for (const p of projects) {
      ensureSpace(110);
      // Project header
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...dark);
      doc.setFontSize(13);
      doc.text(p.name, M, y);
      // Health pill
      const pillW = 50;
      const pillX = W - M - pillW;
      const pillColor = hexToRgb(healthHex(p.health));
      doc.setFillColor(...pillColor);
      doc.roundedRect(pillX, y - 12, pillW, 16, 4, 4, 'F');
      doc.setTextColor(255);
      doc.setFontSize(8);
      doc.text(p.health.toUpperCase(), pillX + pillW / 2, y - 2, { align: 'center' });
      y += 12;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...muted);
      doc.setFontSize(9);
      if (p.summary) {
        const sumLines = doc.splitTextToSize(p.summary, W - 2 * M);
        sumLines.forEach((l: string) => {
          ensureSpace(11);
          doc.text(l, M, y);
          y += 11;
        });
      }
      y += 4;

      // Progress bar
      const barW = W - 2 * M;
      const barH = 6;
      doc.setFillColor(...hexToRgb(LINE));
      doc.roundedRect(M, y, barW, barH, 3, 3, 'F');
      doc.setFillColor(...brand);
      doc.roundedRect(M, y, (barW * p.progress) / 100, barH, 3, 3, 'F');
      y += barH + 4;
      doc.setTextColor(...muted);
      doc.setFontSize(8);
      doc.text(`${p.progress}% — ${p.tasksDone}/${p.tasksTotal} tâches livrées`, M, y);
      y += 14;

      // Counts table
      autoTable(doc, {
        startY: y,
        head: [['Total', 'Livrées', 'En cours', 'En retard', 'Critiques']],
        body: [[p.tasksTotal, p.tasksDone, p.tasksInProgress, p.tasksOverdue, p.tasksCritical]],
        theme: 'grid',
        headStyles: { fillColor: brand, textColor: 255, fontSize: 8, halign: 'center' },
        bodyStyles: { fontSize: 10, halign: 'center' },
        margin: { left: M, right: M },
        tableWidth: 'auto',
      });
      y = (doc as DocWithAutotable).lastAutoTable.finalY + 10;

      if (p.riskNote) {
        ensureSpace(28);
        doc.setFillColor(...hexToRgb('#FCEAE6'));
        doc.roundedRect(M, y, W - 2 * M, 22, 3, 3, 'F');
        doc.setTextColor(...hexToRgb(RED));
        doc.setFontSize(9);
        doc.text(`⚠ ${p.riskNote}`, M + 8, y + 14);
        y += 32;
      } else {
        y += 8;
      }
    }
  }

  /* ─── Tasks (detail) ─── */
  if (options.sections.includes('tasks')) {
    const tasks = filterTasks(payload).filter((t) => t.status !== 'cancelled');
    if (tasks.length > 0) {
      drawHeading(SECTION_LABELS.tasks, { large: true });
      // Group by project
      const byProject = tasks.reduce<Record<string, typeof tasks>>((acc, t) => {
        (acc[t.projectId] ??= []).push(t);
        return acc;
      }, {});
      for (const [pid, list] of Object.entries(byProject)) {
        ensureSpace(40);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...brand);
        doc.setFontSize(11);
        doc.text(projectNames[pid] ?? pid, M, y);
        y += 14;

        autoTable(doc, {
          startY: y,
          head: [['Tâche', 'Statut', 'Priorité', 'Échéance']],
          body: list.map((t) => [
            t.title,
            taskStatusLabel(t.status),
            priorityLabel(t.priority),
            formatDate(t.dueDate),
          ]),
          theme: 'striped',
          headStyles: { fillColor: brand, textColor: 255, fontSize: 9 },
          bodyStyles: { fontSize: 9 },
          alternateRowStyles: { fillColor: hexToRgb(SAGE_LIGHT) },
          columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 70 },
            2: { cellWidth: 70 },
            3: { cellWidth: 70, halign: 'right' },
          },
          margin: { left: M, right: M },
        });
        y = (doc as DocWithAutotable).lastAutoTable.finalY + 10;
      }
    }
  }

  /* ─── Attention ─── */
  if (options.sections.includes('attention') && report.attentionPoints?.length) {
    drawHeading(SECTION_LABELS.attention);
    autoTable(doc, {
      startY: y,
      head: [['Sévérité', 'Sujet', 'Détail', 'Recommandation']],
      body: report.attentionPoints.map((a) => [
        a.severity.toUpperCase(),
        `${a.title}\n${a.scope}`,
        a.detail,
        a.recommendation ?? '—',
      ]),
      theme: 'grid',
      headStyles: { fillColor: brand, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9, valign: 'top' },
      columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' } },
      margin: { left: M, right: M },
    });
    y = (doc as DocWithAutotable).lastAutoTable.finalY + 14;
  }

  /* ─── Workload ─── */
  if (options.sections.includes('workload') && report.workload?.length) {
    drawHeading(SECTION_LABELS.workload);
    autoTable(doc, {
      startY: y,
      head: [['Membre', 'Tâches ouvertes', 'Charge', 'Statut']],
      body: report.workload.map((w) => [
        w.name,
        w.tasksOpen,
        `${w.plannedHours}h / ${w.capacityHours}h`,
        w.status,
      ]),
      theme: 'grid',
      headStyles: { fillColor: brand, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: M, right: M },
    });
    y = (doc as DocWithAutotable).lastAutoTable.finalY + 14;
  }

  /* ─── Goals ─── */
  if (options.sections.includes('goals') && report.goalsProgress?.length) {
    drawHeading(SECTION_LABELS.goals);
    autoTable(doc, {
      startY: y,
      head: [['Objectif', 'Progression', 'Évolution', 'Santé']],
      body: report.goalsProgress.map((g) => [
        g.title,
        `${g.pct}%`,
        `${g.delta >= 0 ? '+' : ''}${g.delta}`,
        g.health.toUpperCase(),
      ]),
      theme: 'grid',
      headStyles: { fillColor: brand, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: M, right: M },
    });
    y = (doc as DocWithAutotable).lastAutoTable.finalY + 14;
  }

  /* ─── Top retards ─── */
  if (options.sections.includes('retards') && report.topRetards?.length) {
    drawHeading(SECTION_LABELS.retards);
    autoTable(doc, {
      startY: y,
      head: [['Tâche', 'Projet', 'Jours de retard', 'Priorité', 'Responsable']],
      body: report.topRetards.map((r) => [
        r.title,
        r.projectName,
        `+${r.daysLate}`,
        priorityLabel(r.priority),
        r.ownerInitials,
      ]),
      theme: 'grid',
      headStyles: { fillColor: brand, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: M, right: M },
    });
    y = (doc as DocWithAutotable).lastAutoTable.finalY + 14;
  }

  /* ─── Next steps ─── */
  if (options.sections.includes('next_steps') && report.nextSteps?.length) {
    drawHeading(SECTION_LABELS.next_steps);
    report.nextSteps.forEach((s, i) => drawText(`${i + 1}. ${s}`));
  }

  /* ─── Page numbering ─── */
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...muted);
    doc.setFontSize(8);
    doc.text(`${i} / ${total}`, W - M, H - 20, { align: 'right' });
    doc.text('CockpitJourney · Atlas Studio', M, H - 20);
  }

  const blob = doc.output('blob');
  downloadBlob(blob, buildFilename(report, 'pdf'));
}
