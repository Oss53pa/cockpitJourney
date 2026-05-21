/**
 * DOCX exporter — Big-4-style executive document.
 *
 * Structure :
 *   1. Cover page          — full-bleed sage + brand + title block
 *   2. Sommaire (auto-TOC) — Word's TableOfContents field updates on
 *                            open ("F9" or "Update field" right-click)
 *   3. Section breaks      — page break before each major heading
 *   4. Body                — headings, tables, paragraphs
 *   5. Closing             — Merci · contact · classification
 *
 * Uses the `docx` library. Output is a .docx Blob.
 */
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageNumber,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TableOfContents,
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
  taskStatusLabel,
  type ExportPayload,
} from './types';
import { HX, COPY, buildToc, buildDocRef, formatPeriodRange } from './design';

const SAGE = HX.brand;
const FG = HX.fg1;
const FG2 = HX.fg2;
const MUTED = HX.fg3;
const VERY_MUTED = HX.fg4;
const LINE = HX.line;

/* ────────── helpers ────────── */

const PB = () => new Paragraph({ children: [new PageBreak()] });

function eyebrow(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 60 },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        color: SAGE,
        size: 18, // 9pt
        characterSpacing: 30,
      }),
    ],
  });
}

function h1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, color: FG, size: 44 })],
  });
}

function h2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, bold: true, color: FG, size: 28 })],
  });
}

function h3(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 160, after: 80 },
    children: [new TextRun({ text, bold: true, color: FG, size: 22 })],
  });
}

function p(
  text: string,
  opts: { bold?: boolean; color?: string; size?: number; italic?: boolean } = {}
): Paragraph {
  return new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        italics: opts.italic,
        color: opts.color ?? FG2,
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
  const total = 9000;
  const colWidths = widths.map((w) => (w / 100) * total);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: colWidths,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      left: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      right: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: LINE },
    },
    rows: [
      new TableRow({
        children: header.map((h) => cell(h, { header: true, align: 'center' })),
        tableHeader: true,
      }),
      ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) })),
    ],
  });
}

/** Strip markdown to a list of paragraphs. */
function paragraphsFromMarkdown(md: string): Paragraph[] {
  return md
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith('## ')) return h2(line.slice(3));
      if (line.startsWith('### ')) return h3(line.slice(4));
      if (line.startsWith('- ') || line.startsWith('* '))
        return new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: line.slice(2), size: 20, color: FG })],
        });
      if (/^\d+\.\s/.test(line))
        return new Paragraph({
          numbering: { reference: 'numbered', level: 0 },
          children: [new TextRun({ text: line.replace(/^\d+\.\s/, ''), size: 20, color: FG })],
        });
      const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
      return new Paragraph({
        spacing: { after: 100 },
        children: parts.map((part) =>
          part.startsWith('**')
            ? new TextRun({ text: part.slice(2, -2), bold: true, color: FG, size: 20 })
            : new TextRun({ text: part, color: FG2, size: 20 })
        ),
      });
    });
}

function kindEyebrowText(kind: string): string {
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

/* ────────── main ────────── */

export async function exportToDocx(payload: ExportPayload): Promise<void> {
  const { report, options, projectNames } = payload;
  const docRef = buildDocRef(report);
  const toc = buildToc(options.sections);

  const blocks: (Paragraph | Table)[] = [];

  /* ─── 1. COVER ─── */
  // Top brand line
  blocks.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 200 },
      children: [
        new TextRun({
          text: COPY.brandLong.toUpperCase(),
          bold: true,
          color: SAGE,
          size: 18,
          characterSpacing: 30,
        }),
      ],
    })
  );
  // Spacer
  blocks.push(p('', { size: 24 }));
  blocks.push(p('', { size: 24 }));
  // Sage thin accent (we can't draw lines easily; use a row of em-dashes as visual)
  blocks.push(
    new Paragraph({
      spacing: { before: 0, after: 100 },
      children: [new TextRun({ text: '———', color: SAGE, bold: true, size: 28 })],
    })
  );
  // Eyebrow
  blocks.push(
    new Paragraph({
      spacing: { before: 0, after: 200 },
      children: [
        new TextRun({
          text: kindEyebrowText(report.kind),
          bold: true,
          color: SAGE,
          size: 22,
          characterSpacing: 30,
        }),
      ],
    })
  );
  // Big title
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 },
      children: [new TextRun({ text: report.title, color: FG, bold: true, size: 72 })],
    })
  );
  // Period range (DD/MM/YYYY → DD/MM/YYYY) — canonical date span
  blocks.push(
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: formatPeriodRange(report), bold: true, color: SAGE, size: 28 })],
    })
  );
  // Long-form below
  blocks.push(p(report.period, { color: MUTED, size: 22 }));

  // Spacer (tightened: was 8, now 5)
  for (let i = 0; i < 5; i++) blocks.push(p(''));

  // Bottom info table (Préparé par / Généré le)
  blocks.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: LINE },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  spacing: { before: 100, after: 60 },
                  children: [
                    new TextRun({
                      text: COPY.preparedBy.toUpperCase(),
                      bold: true,
                      color: MUTED,
                      size: 16,
                      characterSpacing: 20,
                    }),
                  ],
                }),
                p(COPY.brand, { color: FG, size: 22 }),
              ],
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
              },
            }),
            new TableCell({
              children: [
                new Paragraph({
                  spacing: { before: 100, after: 60 },
                  children: [
                    new TextRun({
                      text: COPY.generatedOn.toUpperCase(),
                      bold: true,
                      color: MUTED,
                      size: 16,
                      characterSpacing: 20,
                    }),
                  ],
                }),
                p(formatDate(report.generatedAt), { color: FG, size: 22 }),
              ],
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
                right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
              },
            }),
          ],
        }),
      ],
    })
  );

  // Classification stamp
  blocks.push(p(''));
  blocks.push(
    new Paragraph({
      spacing: { before: 200, after: 60 },
      children: [
        new TextRun({
          text: COPY.classification,
          bold: true,
          color: SAGE,
          size: 18,
          characterSpacing: 30,
        }),
      ],
    })
  );
  blocks.push(
    new Paragraph({
      children: [
        new TextRun({
          text: docRef,
          color: MUTED,
          font: 'Courier New',
          size: 16,
        }),
      ],
    })
  );

  /* ─── 2. SOMMAIRE ─── */
  if (toc.length > 0) {
    blocks.push(PB());
    blocks.push(eyebrow('Table des matières'));
    blocks.push(h1(COPY.toc));
    blocks.push(
      new Paragraph({
        spacing: { before: 0, after: 200 },
        children: [new TextRun({ text: '———', color: SAGE, bold: true, size: 24 })],
      })
    );
    // Auto TOC field — Word will populate it on first open (right-click → Update Field).
    blocks.push(
      new TableOfContents('Sommaire', {
        hyperlink: true,
        headingStyleRange: '1-3',
      })
    );
    // Fallback static list (in case Word doesn't update the field automatically).
    blocks.push(p(''));
    blocks.push(p('', { italic: true, size: 16, color: MUTED }));
    blocks.push(
      p(
        '(Si la table ne se met pas à jour automatiquement : clic-droit dessus → "Mettre à jour les champs".)',
        { italic: true, size: 16, color: MUTED }
      )
    );
    toc.forEach((item) => {
      blocks.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({ text: item.number, bold: true, color: SAGE, size: 22 }),
            new TextRun({ text: '   ' + item.label, color: FG, size: 22 }),
          ],
        })
      );
    });
  }

  /* ─── 3. CONTENT SECTIONS ─── */
  for (const item of toc) {
    // Section divider page
    blocks.push(PB());
    blocks.push(eyebrow(`Partie ${item.number}`));
    blocks.push(h1(item.label));
    blocks.push(
      new Paragraph({
        spacing: { after: 100 },
        children: [new TextRun({ text: formatPeriodRange(report), bold: true, color: SAGE, size: 22 })],
      })
    );
    blocks.push(
      new Paragraph({
        spacing: { before: 100, after: 200 },
        children: [new TextRun({ text: '———', color: SAGE, bold: true, size: 22 })],
      })
    );

    switch (item.key) {
      case 'narrative': {
        if (report.narrative) {
          blocks.push(...paragraphsFromMarkdown(report.narrative));
        } else {
          blocks.push(p('Aucune narration PROPH3T générée pour ce rapport.', { italic: true, color: MUTED }));
        }
        break;
      }

      case 'metrics': {
        if (report.metrics?.length) {
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
        break;
      }

      case 'highlights': {
        if (report.highlights?.length) {
          report.highlights.forEach((h) =>
            blocks.push(
              new Paragraph({
                bullet: { level: 0 },
                spacing: { after: 100 },
                children: [new TextRun({ text: h, size: 22, color: FG })],
              })
            )
          );
        }
        break;
      }

      case 'projects': {
        const allow = new Set(options.projectIds ?? []);
        const list = (report.projects ?? []).filter((proj) => allow.size === 0 || allow.has(proj.projectId));
        for (const proj of list) {
          blocks.push(h2(proj.name));
          if (proj.summary) blocks.push(p(proj.summary, { color: MUTED, italic: true }));
          blocks.push(
            p(
              `Avancement : ${proj.progress}%  ·  ${proj.tasksDone}/${proj.tasksTotal} livrées  ·  santé : ${proj.health}`,
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
          if (proj.riskNote) blocks.push(p(`⚠  ${proj.riskNote}`, { color: HX.red, bold: true, size: 20 }));
        }
        break;
      }

      case 'tasks': {
        const tasks = filterTasks(payload);
        if (tasks.length) {
          const byProject = tasks.reduce<Record<string, typeof tasks>>((acc, t) => {
            (acc[t.projectId] ??= []).push(t);
            return acc;
          }, {});
          for (const [pid, list] of Object.entries(byProject)) {
            blocks.push(h2(projectNames[pid] ?? pid));
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
        break;
      }

      case 'attention': {
        if (report.attentionPoints?.length) {
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
        break;
      }

      case 'workload': {
        if (report.workload?.length) {
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
        break;
      }

      case 'goals': {
        if (report.goalsProgress?.length) {
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
        break;
      }

      case 'retards': {
        if (report.topRetards?.length) {
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
        break;
      }

      case 'next_steps': {
        if (report.nextSteps?.length) {
          report.nextSteps.forEach((s) =>
            blocks.push(
              new Paragraph({
                numbering: { reference: 'numbered', level: 0 },
                spacing: { after: 100 },
                children: [new TextRun({ text: s, size: 22, color: FG })],
              })
            )
          );
        }
        break;
      }
    }
  }

  /* ─── 4. CLOSING ─── */
  blocks.push(PB());
  blocks.push(p('', { size: 30 }));
  blocks.push(
    new Paragraph({
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: COPY.thanks, bold: true, color: FG, size: 96 })],
    })
  );
  blocks.push(
    new Paragraph({
      spacing: { before: 0, after: 200 },
      children: [new TextRun({ text: '———', color: SAGE, bold: true, size: 28 })],
    })
  );
  blocks.push(p(COPY.thanksSub, { size: 24, color: FG2 }));
  blocks.push(p(''));
  blocks.push(eyebrow('Contact'));
  blocks.push(p(COPY.contact, { size: 22, color: FG }));
  blocks.push(p(COPY.studioWebsite, { size: 22, color: SAGE, bold: true }));
  blocks.push(p(''));
  blocks.push(p(''));
  blocks.push(p(COPY.legal, { size: 16, color: VERY_MUTED, italic: true }));
  blocks.push(
    new Paragraph({
      spacing: { before: 200 },
      children: [
        new TextRun({
          text: `${docRef} · ${formatDate(report.generatedAt)}`,
          color: MUTED,
          font: 'Courier New',
          size: 16,
        }),
      ],
    })
  );

  /* ─── Document ─── */
  const doc = new Document({
    creator: COPY.brand,
    title: report.title,
    description: report.period,
    features: { updateFields: true }, // tells Word to update TOC on open
    numbering: {
      config: [
        {
          reference: 'numbered',
          levels: [
            {
              level: 0,
              format: 'decimal',
              text: '%1.',
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          // Tighter print margins (was 1000 = 0.7 inch; now ~0.6 inch / 1.5cm).
          page: { margin: { top: 850, right: 900, bottom: 850, left: 900 } },
          titlePage: true, // suppresses header/footer on the cover page
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                tabStops: [{ type: 'right', position: 9000 }],
                children: [
                  new TextRun({
                    text: COPY.brand.toUpperCase(),
                    bold: true,
                    color: SAGE,
                    size: 16,
                    characterSpacing: 30,
                  }),
                  new TextRun({ text: '\t' }),
                  new TextRun({
                    text: formatPeriodRange(report),
                    color: MUTED,
                    size: 16,
                  }),
                ],
              }),
            ],
          }),
          first: new Header({ children: [new Paragraph('')] }), // blank header on cover
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                tabStops: [
                  { type: 'center', position: 4500 },
                  { type: 'right', position: 9000 },
                ],
                children: [
                  new TextRun({
                    text: COPY.classification,
                    color: MUTED,
                    size: 14,
                    characterSpacing: 30,
                  }),
                  new TextRun({ text: '\t' }),
                  new TextRun({
                    text: docRef,
                    color: MUTED,
                    font: 'Courier New',
                    size: 14,
                  }),
                  new TextRun({ text: '\t' }),
                  new TextRun({
                    children: ['Page ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES],
                    bold: true,
                    color: FG,
                    size: 14,
                  }),
                ],
              }),
            ],
          }),
          first: new Footer({ children: [new Paragraph('')] }), // blank footer on cover
        },
        children: blocks,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, buildFilename(report, 'docx'));
}
