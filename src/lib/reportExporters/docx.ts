/**
 * DOCX exporter — uses the `docx` library.
 *
 * Produces an editable Word document with proper headings, tables, and
 * paragraph styles (no images — the Grand-Hotel logo isn't embedded
 * because docx doesn't support remote URLs reliably).
 */
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
  type ITableCellOptions,
} from 'docx';
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
const FG = '1A1D17';
const MUTED = '7A8071';

/* ────────── helpers ────────── */

function heading(text: string, level: 1 | 2 = 1): Paragraph {
  return new Paragraph({
    spacing: { before: level === 1 ? 280 : 200, after: 120 },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        color: SAGE,
        size: level === 1 ? 28 : 22, // half-points: 28 = 14pt
      }),
    ],
  });
}

function p(text: string, opts: { bold?: boolean; color?: string; size?: number } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        color: opts.color ?? FG,
        size: opts.size ?? 20,
      }),
    ],
  });
}

function cell(text: string, opts: { header?: boolean; align?: 'left' | 'center' | 'right' } = {}): TableCell {
  const cellOpts: ITableCellOptions = {
    children: [
      new Paragraph({
        alignment:
          opts.align === 'center'
            ? AlignmentType.CENTER
            : opts.align === 'right'
              ? AlignmentType.RIGHT
              : AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            bold: opts.header,
            color: opts.header ? 'FFFFFF' : FG,
            size: 18,
          }),
        ],
      }),
    ],
    shading: opts.header ? { fill: SAGE } : undefined,
    margins: { top: 100, bottom: 100, left: 100, right: 100 },
  };
  return new TableCell(cellOpts);
}

function makeTable(header: string[], rows: string[][], widths: number[]): Table {
  const totalWidth = 9000; // 5 inches in DXA-ish — `docx` will normalize
  const colWidths = widths.map((w) => (w / 100) * totalWidth);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: colWidths,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'DCD9CB' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'DCD9CB' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'DCD9CB' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'DCD9CB' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'DCD9CB' },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'DCD9CB' },
    },
    rows: [
      new TableRow({
        children: header.map((h) => cell(h, { header: true, align: 'center' })),
        tableHeader: true,
      }),
      ...rows.map(
        (r, i) =>
          new TableRow({
            children: r.map((c) => cell(c)),
            cantSplit: false,
            ...(i % 2 === 1
              ? {
                  // alternate row shading via cell shading
                }
              : {}),
          })
      ),
    ],
  });
}

/** Strip markdown formatting → plain paragraphs. */
function paragraphsFromMarkdown(md: string): Paragraph[] {
  return md
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith('## ')) {
        return new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
          children: [new TextRun({ text: line.slice(3), bold: true, color: FG, size: 22 })],
        });
      }
      if (line.startsWith('### ')) {
        return new Paragraph({
          spacing: { before: 160, after: 80 },
          children: [new TextRun({ text: line.slice(4), bold: true, color: FG, size: 20 })],
        });
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: line.slice(2), size: 20, color: FG })],
        });
      }
      if (/^\d+\.\s/.test(line)) {
        return new Paragraph({
          numbering: { reference: 'numbered', level: 0 },
          children: [new TextRun({ text: line.replace(/^\d+\.\s/, ''), size: 20, color: FG })],
        });
      }
      // Plain paragraph — also handles **bold** inline.
      const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
      return new Paragraph({
        spacing: { after: 100 },
        children: parts.map((part) => {
          if (part.startsWith('**')) {
            return new TextRun({ text: part.slice(2, -2), bold: true, color: FG, size: 20 });
          }
          return new TextRun({ text: part, color: FG, size: 20 });
        }),
      });
    });
}

/* ────────── main ────────── */

export async function exportToDocx(payload: ExportPayload): Promise<void> {
  const { report, options, projectNames } = payload;

  const blocks: (Paragraph | Table)[] = [];

  /* Cover */
  if (options.sections.includes('cover')) {
    blocks.push(
      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [new TextRun({ text: 'CockpitJourney · Atlas Studio', color: SAGE, bold: true, size: 18 })],
      })
    );
    blocks.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        spacing: { after: 120 },
        children: [new TextRun({ text: report.title, color: FG, bold: true, size: 44 })],
      })
    );
    blocks.push(
      p(`${report.period} · généré le ${formatDate(report.generatedAt)}`, {
        color: MUTED,
        size: 18,
      })
    );
  }

  /* Narrative */
  if (options.sections.includes('narrative') && report.narrative) {
    blocks.push(heading(SECTION_LABELS.narrative));
    blocks.push(...paragraphsFromMarkdown(report.narrative));
  }

  /* Metrics */
  if (options.sections.includes('metrics') && report.metrics?.length) {
    blocks.push(heading(SECTION_LABELS.metrics));
    blocks.push(
      makeTable(
        ['Indicateur', 'Valeur', 'Évolution'],
        report.metrics.map((m) => [
          m.label,
          m.value,
          typeof m.delta === 'number' ? `${m.delta >= 0 ? '+' : ''}${m.delta}%` : '—',
        ]),
        [60, 20, 20]
      )
    );
  }

  /* Highlights */
  if (options.sections.includes('highlights') && report.highlights?.length) {
    blocks.push(heading(SECTION_LABELS.highlights));
    report.highlights.forEach((h) =>
      blocks.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: h, size: 20, color: FG })],
        })
      )
    );
  }

  /* Projects */
  if (options.sections.includes('projects') && report.projects?.length) {
    blocks.push(heading(SECTION_LABELS.projects, 1));
    const allow = new Set(options.projectIds ?? []);
    const list = report.projects.filter((p) => allow.size === 0 || allow.has(p.projectId));
    for (const proj of list) {
      blocks.push(heading(proj.name, 2));
      if (proj.summary) blocks.push(p(proj.summary, { color: MUTED }));
      blocks.push(
        p(
          `Avancement : ${proj.progress}% · ${proj.tasksDone}/${proj.tasksTotal} livrées · santé : ${proj.health}`,
          { bold: true }
        )
      );
      blocks.push(
        makeTable(
          ['Total', 'Livrées', 'En cours', 'En retard', 'Critiques'],
          [
            [
              String(proj.tasksTotal),
              String(proj.tasksDone),
              String(proj.tasksInProgress),
              String(proj.tasksOverdue),
              String(proj.tasksCritical),
            ],
          ],
          [20, 20, 20, 20, 20]
        )
      );
      if (proj.riskNote) blocks.push(p(`⚠ ${proj.riskNote}`, { color: 'B85B4D', bold: true }));
    }
  }

  /* Tasks */
  if (options.sections.includes('tasks')) {
    const tasks = filterTasks(payload).filter((t) => t.status !== 'cancelled');
    if (tasks.length) {
      blocks.push(heading(SECTION_LABELS.tasks, 1));
      const byProject = tasks.reduce<Record<string, typeof tasks>>((acc, t) => {
        (acc[t.projectId] ??= []).push(t);
        return acc;
      }, {});
      for (const [pid, list] of Object.entries(byProject)) {
        blocks.push(heading(projectNames[pid] ?? pid, 2));
        blocks.push(
          makeTable(
            ['Tâche', 'Statut', 'Priorité', 'Échéance'],
            list.map((t) => [
              t.title,
              taskStatusLabel(t.status),
              priorityLabel(t.priority),
              formatDate(t.dueDate),
            ]),
            [55, 15, 15, 15]
          )
        );
      }
    }
  }

  /* Attention */
  if (options.sections.includes('attention') && report.attentionPoints?.length) {
    blocks.push(heading(SECTION_LABELS.attention));
    blocks.push(
      makeTable(
        ['Sévérité', 'Sujet', 'Détail', 'Recommandation'],
        report.attentionPoints.map((a) => [
          a.severity.toUpperCase(),
          `${a.title} (${a.scope})`,
          a.detail,
          a.recommendation ?? '—',
        ]),
        [12, 25, 33, 30]
      )
    );
  }

  /* Workload */
  if (options.sections.includes('workload') && report.workload?.length) {
    blocks.push(heading(SECTION_LABELS.workload));
    blocks.push(
      makeTable(
        ['Membre', 'Tâches ouvertes', 'Charge', 'Statut'],
        report.workload.map((w) => [
          w.name,
          String(w.tasksOpen),
          `${w.plannedHours}h / ${w.capacityHours}h`,
          w.status,
        ]),
        [40, 18, 22, 20]
      )
    );
  }

  /* Goals */
  if (options.sections.includes('goals') && report.goalsProgress?.length) {
    blocks.push(heading(SECTION_LABELS.goals));
    blocks.push(
      makeTable(
        ['Objectif', 'Progression', 'Évolution', 'Santé'],
        report.goalsProgress.map((g) => [
          g.title,
          `${g.pct}%`,
          `${g.delta >= 0 ? '+' : ''}${g.delta}`,
          g.health.toUpperCase(),
        ]),
        [55, 15, 15, 15]
      )
    );
  }

  /* Retards */
  if (options.sections.includes('retards') && report.topRetards?.length) {
    blocks.push(heading(SECTION_LABELS.retards));
    blocks.push(
      makeTable(
        ['Tâche', 'Projet', 'Jours de retard', 'Priorité', 'Responsable'],
        report.topRetards.map((r) => [
          r.title,
          r.projectName,
          `+${r.daysLate}`,
          priorityLabel(r.priority),
          r.ownerInitials,
        ]),
        [40, 22, 12, 12, 14]
      )
    );
  }

  /* Next steps */
  if (options.sections.includes('next_steps') && report.nextSteps?.length) {
    blocks.push(heading(SECTION_LABELS.next_steps));
    report.nextSteps.forEach((s, i) => blocks.push(p(`${i + 1}. ${s}`)));
  }

  const doc = new Document({
    creator: 'CockpitJourney',
    title: report.title,
    description: report.period,
    sections: [
      {
        properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
        children: blocks,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, buildFilename(report, 'docx'));
}
