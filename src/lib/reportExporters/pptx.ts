/**
 * PPTX exporter — uses pptxgenjs.
 *
 * One slide per section:
 *   - Cover (title + period + sage strip)
 *   - Narrative (text only)
 *   - Metrics (chart-grid)
 *   - Highlights (bulleted list)
 *   - Per-project (1 slide each, with progress bar shape)
 *   - Tasks summary (1 slide per project, table)
 *   - Attention / Workload / Goals / Retards (one table slide each)
 *   - Next steps (numbered list)
 *
 * Aspect ratio: 16:9. Theme: CockpitJourney sage on cream.
 */
import PptxGenJS from 'pptxgenjs';
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

const SAGE = '52693F';
const SAGE_LIGHT = 'EEF4E9';
const CREAM = 'F4F2E9';
const FG = '1A1D17';
const MUTED = '7A8071';
const LINE = 'DCD9CB';
const RED = 'B85B4D';
const GREEN = '4D9A6A';
const YELLOW = 'B69248';

function healthHex(h: 'green' | 'yellow' | 'red'): string {
  return h === 'red' ? RED : h === 'yellow' ? YELLOW : GREEN;
}

function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, '');
}

export async function exportToPptx(payload: ExportPayload): Promise<void> {
  const { report, options, projectNames } = payload;
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE'; // 13.33 × 7.5 in

  /** Add the same sage strip + footer to every slide. */
  const decorate = (slide: PptxGenJS.Slide) => {
    slide.background = { color: 'FFFFFF' };
    slide.addShape(pres.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.33,
      h: 0.06,
      fill: { color: SAGE },
      line: { color: SAGE, width: 0 },
    });
    slide.addText(`CockpitJourney · ${report.period}`, {
      x: 0.4,
      y: 7.0,
      w: 12.5,
      h: 0.3,
      fontSize: 9,
      color: MUTED,
      align: 'left',
    });
  };

  /* ─── Cover ─── */
  if (options.sections.includes('cover')) {
    const slide = pres.addSlide();
    slide.background = { color: CREAM };
    slide.addShape(pres.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.33,
      h: 0.12,
      fill: { color: SAGE },
      line: { color: SAGE, width: 0 },
    });
    slide.addText('CockpitJourney · Atlas Studio', {
      x: 0.7,
      y: 0.7,
      w: 12,
      h: 0.4,
      fontSize: 12,
      color: SAGE,
      bold: true,
    });
    slide.addText(report.title, {
      x: 0.7,
      y: 1.5,
      w: 12,
      h: 2,
      fontSize: 36,
      color: FG,
      bold: true,
      valign: 'top',
    });
    slide.addText(report.period, { x: 0.7, y: 4, w: 12, h: 0.5, fontSize: 18, color: MUTED });
    slide.addText(`Généré le ${formatDate(report.generatedAt)}`, {
      x: 0.7,
      y: 6.7,
      w: 12,
      h: 0.4,
      fontSize: 11,
      color: MUTED,
    });
  }

  /* ─── Narrative ─── */
  if (options.sections.includes('narrative') && report.narrative) {
    const slide = pres.addSlide();
    decorate(slide);
    slide.addText(SECTION_LABELS.narrative.toUpperCase(), {
      x: 0.5,
      y: 0.4,
      w: 12,
      h: 0.5,
      fontSize: 12,
      color: SAGE,
      bold: true,
      charSpacing: 8,
    });
    slide.addText(stripMarkdown(report.narrative), {
      x: 0.5,
      y: 1.2,
      w: 12.3,
      h: 5.5,
      fontSize: 14,
      color: FG,
      valign: 'top',
    });
  }

  /* ─── Metrics ─── */
  if (options.sections.includes('metrics') && report.metrics?.length) {
    const slide = pres.addSlide();
    decorate(slide);
    slide.addText(SECTION_LABELS.metrics.toUpperCase(), {
      x: 0.5,
      y: 0.4,
      w: 12,
      h: 0.5,
      fontSize: 12,
      color: SAGE,
      bold: true,
      charSpacing: 8,
    });
    const cols = Math.min(report.metrics.length, 4);
    const cardW = (12.3 - (cols - 1) * 0.3) / cols;
    report.metrics.slice(0, 4).forEach((m, i) => {
      const x = 0.5 + i * (cardW + 0.3);
      slide.addShape(pres.ShapeType.roundRect, {
        x,
        y: 1.5,
        w: cardW,
        h: 2.4,
        fill: { color: SAGE_LIGHT },
        line: { color: LINE, width: 1 },
        rectRadius: 0.1,
      });
      slide.addText(m.label, {
        x: x + 0.2,
        y: 1.7,
        w: cardW - 0.4,
        h: 0.4,
        fontSize: 10,
        color: SAGE,
        bold: true,
        charSpacing: 4,
      });
      slide.addText(String(m.value), {
        x: x + 0.2,
        y: 2.2,
        w: cardW - 0.4,
        h: 1,
        fontSize: 36,
        color: FG,
        bold: true,
      });
      if (typeof m.delta === 'number') {
        slide.addText(`${m.delta >= 0 ? '+' : ''}${m.delta}%`, {
          x: x + 0.2,
          y: 3.2,
          w: cardW - 0.4,
          h: 0.4,
          fontSize: 12,
          color: m.delta >= 0 ? GREEN : RED,
          bold: true,
        });
      }
    });
  }

  /* ─── Highlights ─── */
  if (options.sections.includes('highlights') && report.highlights?.length) {
    const slide = pres.addSlide();
    decorate(slide);
    slide.addText(SECTION_LABELS.highlights.toUpperCase(), {
      x: 0.5,
      y: 0.4,
      w: 12,
      h: 0.5,
      fontSize: 12,
      color: SAGE,
      bold: true,
      charSpacing: 8,
    });
    slide.addText(
      report.highlights.map((h) => ({ text: h, options: { bullet: true } })),
      { x: 0.5, y: 1.3, w: 12.3, h: 5.5, fontSize: 16, color: FG, valign: 'top' }
    );
  }

  /* ─── Projects (1 slide each) ─── */
  if (options.sections.includes('projects') && report.projects?.length) {
    const allow = new Set(options.projectIds ?? []);
    const list = report.projects.filter((p) => allow.size === 0 || allow.has(p.projectId));
    for (const proj of list) {
      const slide = pres.addSlide();
      decorate(slide);
      slide.addText('PROJET', {
        x: 0.5,
        y: 0.4,
        w: 6,
        h: 0.4,
        fontSize: 10,
        color: SAGE,
        bold: true,
        charSpacing: 8,
      });
      slide.addText(proj.name, { x: 0.5, y: 0.85, w: 9, h: 0.7, fontSize: 28, color: FG, bold: true });
      // Health badge
      slide.addShape(pres.ShapeType.roundRect, {
        x: 11.5,
        y: 0.85,
        w: 1.3,
        h: 0.5,
        fill: { color: healthHex(proj.health) },
        line: { color: healthHex(proj.health), width: 0 },
        rectRadius: 0.08,
      });
      slide.addText(proj.health.toUpperCase(), {
        x: 11.5,
        y: 0.85,
        w: 1.3,
        h: 0.5,
        fontSize: 11,
        color: 'FFFFFF',
        bold: true,
        align: 'center',
        valign: 'middle',
      });
      if (proj.summary) {
        slide.addText(proj.summary, {
          x: 0.5,
          y: 1.7,
          w: 12.3,
          h: 0.8,
          fontSize: 13,
          color: MUTED,
          italic: true,
        });
      }
      // Progress bar
      slide.addShape(pres.ShapeType.rect, {
        x: 0.5,
        y: 2.7,
        w: 12.3,
        h: 0.18,
        fill: { color: LINE },
        line: { color: LINE, width: 0 },
      });
      slide.addShape(pres.ShapeType.rect, {
        x: 0.5,
        y: 2.7,
        w: (12.3 * proj.progress) / 100,
        h: 0.18,
        fill: { color: SAGE },
        line: { color: SAGE, width: 0 },
      });
      slide.addText(`${proj.progress}% — ${proj.tasksDone}/${proj.tasksTotal} tâches livrées`, {
        x: 0.5,
        y: 3,
        w: 12.3,
        h: 0.4,
        fontSize: 11,
        color: MUTED,
      });
      // 5-stat row
      const stats = [
        ['Total', proj.tasksTotal],
        ['Livrées', proj.tasksDone],
        ['En cours', proj.tasksInProgress],
        ['En retard', proj.tasksOverdue],
        ['Critiques', proj.tasksCritical],
      ];
      stats.forEach(([label, val], i) => {
        const w = 2.4;
        const x = 0.5 + i * (w + 0.1);
        slide.addShape(pres.ShapeType.roundRect, {
          x,
          y: 3.7,
          w,
          h: 1.6,
          fill: { color: SAGE_LIGHT },
          line: { color: LINE, width: 1 },
          rectRadius: 0.08,
        });
        slide.addText(String(label), {
          x: x + 0.2,
          y: 3.85,
          w: w - 0.4,
          h: 0.4,
          fontSize: 10,
          color: SAGE,
          bold: true,
        });
        slide.addText(String(val), {
          x: x + 0.2,
          y: 4.25,
          w: w - 0.4,
          h: 0.9,
          fontSize: 28,
          color: FG,
          bold: true,
        });
      });
      if (proj.riskNote) {
        slide.addText(`⚠ ${proj.riskNote}`, {
          x: 0.5,
          y: 5.7,
          w: 12.3,
          h: 0.6,
          fontSize: 12,
          color: RED,
          bold: true,
          fill: { color: 'FCEAE6' },
        });
      }
    }
  }

  /* ─── Tasks (one slide per project, table) ─── */
  if (options.sections.includes('tasks')) {
    const tasks = filterTasks(payload).filter((t) => t.status !== 'cancelled');
    const byProject = tasks.reduce<Record<string, typeof tasks>>((acc, t) => {
      (acc[t.projectId] ??= []).push(t);
      return acc;
    }, {});
    for (const [pid, list] of Object.entries(byProject)) {
      // Up to 12 rows per slide, paginate beyond that
      for (let chunk = 0; chunk < list.length; chunk += 12) {
        const slide = pres.addSlide();
        decorate(slide);
        slide.addText('TÂCHES', {
          x: 0.5,
          y: 0.4,
          w: 6,
          h: 0.4,
          fontSize: 10,
          color: SAGE,
          bold: true,
          charSpacing: 8,
        });
        slide.addText(projectNames[pid] ?? pid, {
          x: 0.5,
          y: 0.85,
          w: 12.3,
          h: 0.6,
          fontSize: 22,
          color: FG,
          bold: true,
        });
        const slice = list.slice(chunk, chunk + 12);
        const rows: PptxGenJS.TableRow[] = [
          [
            { text: 'Tâche', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
            { text: 'Statut', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
            { text: 'Priorité', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
            { text: 'Échéance', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
          ],
          ...slice.map((t) => [
            { text: t.title, options: { color: FG } },
            { text: taskStatusLabel(t.status), options: { color: FG } },
            { text: priorityLabel(t.priority), options: { color: FG } },
            { text: formatDate(t.dueDate), options: { color: FG } },
          ]),
        ];
        slide.addTable(rows, {
          x: 0.5,
          y: 1.6,
          w: 12.3,
          colW: [7, 1.8, 1.8, 1.7],
          fontSize: 10,
          border: { type: 'solid', color: LINE, pt: 0.5 },
        });
      }
    }
  }

  /* ─── Attention / Workload / Goals / Retards / Next steps as table-or-list slides ─── */
  type SectionRender = () => void;
  const sectionRenderers: Record<string, SectionRender> = {
    attention: () => {
      if (!report.attentionPoints?.length) return;
      const slide = pres.addSlide();
      decorate(slide);
      slide.addText(SECTION_LABELS.attention.toUpperCase(), {
        x: 0.5,
        y: 0.4,
        w: 12,
        h: 0.5,
        fontSize: 12,
        color: SAGE,
        bold: true,
        charSpacing: 8,
      });
      const rows: PptxGenJS.TableRow[] = [
        [
          { text: 'Sévérité', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
          { text: 'Sujet', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
          { text: 'Détail', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
          { text: 'Recommandation', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
        ],
        ...report.attentionPoints!.map((a) => [
          { text: a.severity.toUpperCase() },
          { text: `${a.title}\n${a.scope}` },
          { text: a.detail },
          { text: a.recommendation ?? '—' },
        ]),
      ];
      slide.addTable(rows, {
        x: 0.5,
        y: 1.2,
        w: 12.3,
        colW: [1.5, 3, 4.4, 3.4],
        fontSize: 10,
        border: { type: 'solid', color: LINE, pt: 0.5 },
      });
    },
    workload: () => {
      if (!report.workload?.length) return;
      const slide = pres.addSlide();
      decorate(slide);
      slide.addText(SECTION_LABELS.workload.toUpperCase(), {
        x: 0.5,
        y: 0.4,
        w: 12,
        h: 0.5,
        fontSize: 12,
        color: SAGE,
        bold: true,
        charSpacing: 8,
      });
      const rows: PptxGenJS.TableRow[] = [
        [
          { text: 'Membre', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
          { text: 'Tâches ouvertes', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
          { text: 'Charge', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
          { text: 'Statut', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
        ],
        ...report.workload!.map((w) => [
          { text: w.name },
          { text: String(w.tasksOpen) },
          { text: `${w.plannedHours}h / ${w.capacityHours}h` },
          { text: w.status },
        ]),
      ];
      slide.addTable(rows, {
        x: 0.5,
        y: 1.2,
        w: 12.3,
        colW: [4.5, 2.5, 2.8, 2.5],
        fontSize: 11,
        border: { type: 'solid', color: LINE, pt: 0.5 },
      });
    },
    goals: () => {
      if (!report.goalsProgress?.length) return;
      const slide = pres.addSlide();
      decorate(slide);
      slide.addText(SECTION_LABELS.goals.toUpperCase(), {
        x: 0.5,
        y: 0.4,
        w: 12,
        h: 0.5,
        fontSize: 12,
        color: SAGE,
        bold: true,
        charSpacing: 8,
      });
      const rows: PptxGenJS.TableRow[] = [
        [
          { text: 'Objectif', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
          { text: 'Progression', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
          { text: 'Évolution', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
          { text: 'Santé', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
        ],
        ...report.goalsProgress!.map((g) => [
          { text: g.title },
          { text: `${g.pct}%` },
          { text: `${g.delta >= 0 ? '+' : ''}${g.delta}` },
          { text: g.health.toUpperCase() },
        ]),
      ];
      slide.addTable(rows, {
        x: 0.5,
        y: 1.2,
        w: 12.3,
        colW: [7, 2, 1.8, 1.5],
        fontSize: 11,
        border: { type: 'solid', color: LINE, pt: 0.5 },
      });
    },
    retards: () => {
      if (!report.topRetards?.length) return;
      const slide = pres.addSlide();
      decorate(slide);
      slide.addText(SECTION_LABELS.retards.toUpperCase(), {
        x: 0.5,
        y: 0.4,
        w: 12,
        h: 0.5,
        fontSize: 12,
        color: SAGE,
        bold: true,
        charSpacing: 8,
      });
      const rows: PptxGenJS.TableRow[] = [
        [
          { text: 'Tâche', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
          { text: 'Projet', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
          { text: 'Jours', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
          { text: 'Priorité', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
          { text: 'Resp.', options: { bold: true, color: 'FFFFFF', fill: { color: SAGE } } },
        ],
        ...report.topRetards!.map((r) => [
          { text: r.title },
          { text: r.projectName },
          { text: `+${r.daysLate}` },
          { text: priorityLabel(r.priority) },
          { text: r.ownerInitials },
        ]),
      ];
      slide.addTable(rows, {
        x: 0.5,
        y: 1.2,
        w: 12.3,
        colW: [5, 3.3, 1.4, 1.6, 1],
        fontSize: 11,
        border: { type: 'solid', color: LINE, pt: 0.5 },
      });
    },
    next_steps: () => {
      if (!report.nextSteps?.length) return;
      const slide = pres.addSlide();
      decorate(slide);
      slide.addText(SECTION_LABELS.next_steps.toUpperCase(), {
        x: 0.5,
        y: 0.4,
        w: 12,
        h: 0.5,
        fontSize: 12,
        color: SAGE,
        bold: true,
        charSpacing: 8,
      });
      slide.addText(
        report.nextSteps.map((s) => ({ text: s, options: { bullet: { type: 'number' } } })),
        { x: 0.5, y: 1.2, w: 12.3, h: 5.8, fontSize: 16, color: FG, valign: 'top' }
      );
    },
  };

  for (const key of ['attention', 'workload', 'goals', 'retards', 'next_steps'] as const) {
    if (options.sections.includes(key)) sectionRenderers[key]();
  }

  // Convert pptxgenjs output to a Blob the browser can save
  const blob = (await pres.write({ outputType: 'blob' })) as Blob;
  downloadBlob(blob, buildFilename(report, 'pptx'));
}
