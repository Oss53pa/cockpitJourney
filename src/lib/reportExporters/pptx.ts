/**
 * PPTX exporter — Big-4-style executive deck.
 *
 * Slide order (matches PDF) :
 *   1. Cover                — full sage gradient bg + brand wordmark + title block
 *   2. Sommaire             — numbered TOC with progress dots
 *   3. Section divider      — 1 slide per section, big chapter number
 *   4. Content slides       — narrative, metrics, highlights, projects (1
 *                              slide each), tasks (paginated), attention,
 *                              workload, goals, retards, next steps.
 *   5. Closing              — Merci · contact · classification · doc ref
 *
 * Aspect: 16:9 wide. Uses pptxgenjs.
 */
import PptxGenJS from 'pptxgenjs';
import {
  buildFilename,
  downloadBlob,
  filterTasks,
  formatDate,
  priorityLabel,
  taskStatusLabel,
  type ExportPayload,
} from './types';
import {
  HX,
  COPY,
  buildToc,
  buildDocRef,
  loadWordmarkDataUrl,
  stripMarkdown,
  formatPeriodRange,
} from './design';

const SAGE = HX.brand;
const SAGE_GLOW = HX.brandGlow;
const CREAM = HX.cream;
const FG = HX.fg1;
const MUTED = HX.fg3;
const LINE = HX.line;
const RED = HX.red;
const GREEN = HX.green;
const YELLOW = HX.yellow;

function healthHex(h: 'green' | 'yellow' | 'red'): string {
  return h === 'red' ? RED : h === 'yellow' ? YELLOW : GREEN;
}

function kindEyebrow(kind: string): string {
  switch (kind) {
    case 'weekly':
      return 'RAPPORT HEBDOMADAIRE';
    case 'monthly':
      return 'BILAN MENSUEL';
    case 'quarterly':
      return 'BILAN TRIMESTRIEL';
    case 'semestrial':
      return 'BILAN SEMESTRIEL';
    case 'annual':
      return 'BILAN ANNUEL';
    default:
      return 'RAPPORT';
  }
}

export async function exportToPptx(payload: ExportPayload): Promise<void> {
  const { report, options, projectNames } = payload;
  const docRef = buildDocRef(report);
  const wordmark = await loadWordmarkDataUrl();

  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE'; // 13.333 × 7.5 in
  // Presentation metadata (standard — visible in PowerPoint → Fichier → Informations / DMS).
  pres.author = COPY.brandLong;
  pres.company = COPY.studio;
  pres.subject = `Rapport ${report.kind} · ${formatPeriodRange(report)}`;
  pres.title = `${report.title} — ${report.period}`;
  pres.revision = docRef;
  // Brand body font for all text (titles + body). PowerPoint substitutes if
  // Dosis isn't installed on the viewer's machine.
  pres.theme = { headFontFace: 'Dosis', bodyFontFace: 'Dosis' };

  // Define a master slide with the running header + footer
  pres.defineSlideMaster({
    title: 'CJ_BODY',
    background: { color: 'FFFFFF' },
    objects: [
      // Top sage strip
      { rect: { x: 0, y: 0, w: 13.333, h: 0.06, fill: { color: SAGE } } },
      // Running header — brand on left, period on right
      {
        text: {
          text: COPY.brand.toUpperCase(),
          options: {
            x: 0.5,
            y: 0.18,
            w: 6,
            h: 0.3,
            fontSize: 9,
            color: SAGE,
            bold: true,
            charSpacing: 8,
          },
        },
      },
      {
        text: {
          text: formatPeriodRange(report),
          options: {
            x: 7,
            y: 0.18,
            w: 5.8,
            h: 0.3,
            fontSize: 9,
            color: MUTED,
            align: 'right',
          },
        },
      },
      // Bottom hairline
      {
        line: {
          x: 0.5,
          y: 7.05,
          w: 12.333,
          h: 0,
          line: { color: LINE, width: 0.5 },
        },
      },
      // Footer — classification · doc ref · slide number
      {
        text: {
          text: COPY.classification,
          options: {
            x: 0.5,
            y: 7.15,
            w: 4,
            h: 0.3,
            fontSize: 8,
            color: MUTED,
            charSpacing: 12,
          },
        },
      },
      {
        text: {
          text: docRef,
          options: {
            x: 4.5,
            y: 7.15,
            w: 4.333,
            h: 0.3,
            fontSize: 8,
            color: MUTED,
            align: 'center',
            fontFace: 'Courier New',
          },
        },
      },
    ],
    slideNumber: { x: 12.5, y: 7.15, w: 0.6, h: 0.3, fontSize: 9, color: FG, bold: true, align: 'right' },
  });

  /* ─────────────────────── 1. COVER ─────────────────────── */
  const cover = pres.addSlide();
  cover.background = { color: CREAM };
  // Sage band on left third
  cover.addShape(pres.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 4.8,
    h: 7.5,
    fill: { color: SAGE },
    line: { color: SAGE, width: 0 },
  });

  // Brand tag at top of sage band
  cover.addText(COPY.brandLong.toUpperCase(), {
    x: 0.4,
    y: 0.4,
    w: 4.2,
    h: 0.35,
    fontSize: 10,
    color: 'FFFFFF',
    bold: true,
    charSpacing: 10,
  });

  // Vertical accent line
  cover.addShape(pres.ShapeType.rect, {
    x: 0.4,
    y: 6.5,
    w: 0.5,
    h: 0.04,
    fill: { color: 'FFFFFF' },
    line: { color: 'FFFFFF', width: 0 },
  });

  // Classification on sage
  cover.addText(COPY.classification, {
    x: 0.4,
    y: 6.65,
    w: 4.2,
    h: 0.3,
    fontSize: 9,
    color: 'FFFFFF',
    bold: true,
    charSpacing: 14,
  });

  // Doc ref
  cover.addText(docRef, {
    x: 0.4,
    y: 7.0,
    w: 4.2,
    h: 0.3,
    fontSize: 9,
    color: 'FFFFFF',
    fontFace: 'Courier New',
  });

  // Wordmark on cream side, top-right
  if (wordmark) {
    cover.addImage({ data: wordmark, x: 9.5, y: 0.5, w: 3.4, h: 0.85 });
  }

  // Sage decorative line above title
  cover.addShape(pres.ShapeType.rect, {
    x: 5.3,
    y: 2.5,
    w: 0.6,
    h: 0.04,
    fill: { color: SAGE },
    line: { color: SAGE, width: 0 },
  });

  // Eyebrow
  cover.addText(kindEyebrow(report.kind), {
    x: 5.3,
    y: 2.7,
    w: 7.5,
    h: 0.4,
    fontSize: 11,
    color: SAGE,
    bold: true,
    charSpacing: 12,
  });

  // Big title
  cover.addText(report.title, {
    x: 5.3,
    y: 3.2,
    w: 7.5,
    h: 1.8,
    fontSize: 36,
    color: FG,
    bold: true,
    valign: 'top',
  });

  // Period range (DD/MM/YYYY → DD/MM/YYYY) — canonical date span
  cover.addText(formatPeriodRange(report), {
    x: 5.3,
    y: 4.95,
    w: 7.5,
    h: 0.4,
    fontSize: 18,
    color: SAGE,
    bold: true,
  });
  // Long-form below
  cover.addText(report.period, {
    x: 5.3,
    y: 5.35,
    w: 7.5,
    h: 0.35,
    fontSize: 13,
    color: MUTED,
  });

  // Bottom info line
  cover.addShape(pres.ShapeType.line, {
    x: 5.3,
    y: 6.4,
    w: 7.5,
    h: 0,
    line: { color: LINE, width: 0.5 },
  });
  cover.addText(COPY.preparedBy.toUpperCase(), {
    x: 5.3,
    y: 6.55,
    w: 3,
    h: 0.3,
    fontSize: 8,
    color: MUTED,
    bold: true,
    charSpacing: 10,
  });
  cover.addText(COPY.brand, {
    x: 5.3,
    y: 6.85,
    w: 3,
    h: 0.3,
    fontSize: 11,
    color: FG,
  });
  cover.addText(COPY.generatedOn.toUpperCase(), {
    x: 8.5,
    y: 6.55,
    w: 3,
    h: 0.3,
    fontSize: 8,
    color: MUTED,
    bold: true,
    charSpacing: 10,
  });
  cover.addText(formatDate(report.generatedAt), {
    x: 8.5,
    y: 6.85,
    w: 3,
    h: 0.3,
    fontSize: 11,
    color: FG,
  });

  /* ─────────────────────── 2. SOMMAIRE ─────────────────────── */
  const toc = buildToc(options.sections);
  if (toc.length > 0) {
    const tocSlide = pres.addSlide({ masterName: 'CJ_BODY' });
    tocSlide.addText('TABLE DES MATIÈRES', {
      x: 0.5,
      y: 0.6,
      w: 6,
      h: 0.4,
      fontSize: 10,
      color: SAGE,
      bold: true,
      charSpacing: 12,
    });
    tocSlide.addText(COPY.toc, {
      x: 0.5,
      y: 1.05,
      w: 12,
      h: 1,
      fontSize: 32,
      color: FG,
      bold: true,
    });
    tocSlide.addShape(pres.ShapeType.rect, {
      x: 0.5,
      y: 2.15,
      w: 0.6,
      h: 0.04,
      fill: { color: SAGE },
      line: { color: SAGE, width: 0 },
    });

    // 2-column TOC if more than 5 entries
    const cols = toc.length > 5 ? 2 : 1;
    const perCol = Math.ceil(toc.length / cols);
    const colW = cols === 2 ? 5.8 : 12.333;
    toc.forEach((item, i) => {
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      const x = 0.5 + col * (colW + 0.4);
      const y = 2.7 + row * 0.55;
      tocSlide.addText(item.number, {
        x,
        y,
        w: 0.5,
        h: 0.4,
        fontSize: 16,
        color: SAGE,
        bold: true,
      });
      tocSlide.addText(item.label, {
        x: x + 0.6,
        y,
        w: colW - 0.6,
        h: 0.4,
        fontSize: 13,
        color: FG,
      });
    });
  }

  /* ─── Section divider helper ─── */
  const addDivider = (number: string, label: string) => {
    const slide = pres.addSlide();
    slide.background = { color: 'FFFFFF' };
    // Sage strip
    slide.addShape(pres.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.333,
      h: 0.12,
      fill: { color: SAGE },
      line: { color: SAGE, width: 0 },
    });
    // Big chapter number
    slide.addText(number, {
      x: 7,
      y: 1,
      w: 5.8,
      h: 5,
      fontSize: 280,
      color: SAGE_GLOW,
      bold: true,
      align: 'right',
      valign: 'top',
    });
    // Eyebrow PARTIE
    slide.addText(`PARTIE ${number}`, {
      x: 0.6,
      y: 2.5,
      w: 6,
      h: 0.4,
      fontSize: 11,
      color: SAGE,
      bold: true,
      charSpacing: 14,
    });
    // Section title
    slide.addText(label, {
      x: 0.6,
      y: 3,
      w: 8,
      h: 1.5,
      fontSize: 36,
      color: FG,
      bold: true,
      valign: 'top',
    });
    // Sage thin line
    slide.addShape(pres.ShapeType.rect, {
      x: 0.6,
      y: 4.6,
      w: 0.7,
      h: 0.04,
      fill: { color: SAGE },
      line: { color: SAGE, width: 0 },
    });
    // Period range
    slide.addText(formatPeriodRange(report), {
      x: 0.6,
      y: 4.8,
      w: 8,
      h: 0.4,
      fontSize: 14,
      color: MUTED,
      italic: true,
    });
  };

  /* ─── Section content slides ─── */
  const addSectionTitle = (slide: PptxGenJS.Slide, title: string) => {
    slide.addText(title.toUpperCase(), {
      x: 0.5,
      y: 0.6,
      w: 12,
      h: 0.4,
      fontSize: 10,
      color: SAGE,
      bold: true,
      charSpacing: 12,
    });
  };

  for (const item of toc) {
    addDivider(item.number, item.label);

    switch (item.key) {
      case 'narrative': {
        if (report.narrative) {
          const s = pres.addSlide({ masterName: 'CJ_BODY' });
          addSectionTitle(s, item.label);
          s.addText(stripMarkdown(report.narrative), {
            x: 0.5,
            y: 1.2,
            w: 12.333,
            h: 5.5,
            fontSize: 14,
            color: FG,
            valign: 'top',
            paraSpaceAfter: 8,
          });
        }
        break;
      }

      case 'metrics': {
        if (report.metrics?.length) {
          const s = pres.addSlide({ masterName: 'CJ_BODY' });
          addSectionTitle(s, item.label);
          const cards = report.metrics.slice(0, 6);
          const cols = Math.min(cards.length, 3);
          const cardW = (12.333 - (cols - 1) * 0.3) / cols;
          const rows = Math.ceil(cards.length / cols);
          const cardH = (5.5 - (rows - 1) * 0.3) / rows;
          cards.forEach((m, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = 0.5 + col * (cardW + 0.3);
            const y = 1.3 + row * (cardH + 0.3);
            s.addShape(pres.ShapeType.roundRect, {
              x,
              y,
              w: cardW,
              h: cardH,
              fill: { color: HX.creamLight },
              line: { color: LINE, width: 1 },
              rectRadius: 0.1,
            });
            s.addText(m.label, {
              x: x + 0.25,
              y: y + 0.25,
              w: cardW - 0.5,
              h: 0.4,
              fontSize: 11,
              color: SAGE,
              bold: true,
              charSpacing: 6,
            });
            s.addText(String(m.value), {
              x: x + 0.25,
              y: y + 0.7,
              w: cardW - 0.5,
              h: cardH - 1.2,
              fontSize: 40,
              color: FG,
              bold: true,
            });
            if (typeof m.delta === 'number') {
              s.addText(`${m.delta >= 0 ? '+' : ''}${m.delta}%`, {
                x: x + 0.25,
                y: y + cardH - 0.6,
                w: cardW - 0.5,
                h: 0.4,
                fontSize: 13,
                color: m.delta >= 0 ? GREEN : RED,
                bold: true,
              });
            }
          });
        }
        break;
      }

      case 'highlights': {
        if (report.highlights?.length) {
          const s = pres.addSlide({ masterName: 'CJ_BODY' });
          addSectionTitle(s, item.label);
          report.highlights.slice(0, 8).forEach((h, i) => {
            const y = 1.3 + i * 0.55;
            // Numbered badge
            s.addShape(pres.ShapeType.ellipse, {
              x: 0.5,
              y: y + 0.05,
              w: 0.4,
              h: 0.4,
              fill: { color: SAGE_GLOW },
              line: { color: SAGE_GLOW, width: 0 },
            });
            s.addText(String(i + 1), {
              x: 0.5,
              y: y + 0.05,
              w: 0.4,
              h: 0.4,
              fontSize: 11,
              color: SAGE,
              bold: true,
              align: 'center',
              valign: 'middle',
            });
            s.addText(h, {
              x: 1.05,
              y,
              w: 11.7,
              h: 0.5,
              fontSize: 14,
              color: FG,
              valign: 'middle',
            });
          });
        }
        break;
      }

      case 'projects': {
        const allow = new Set(options.projectIds ?? []);
        const list = (report.projects ?? []).filter((p) => allow.size === 0 || allow.has(p.projectId));
        for (const proj of list) {
          const slide = pres.addSlide({ masterName: 'CJ_BODY' });
          addSectionTitle(slide, 'PROJET');
          slide.addText(proj.name, {
            x: 0.5,
            y: 1.05,
            w: 9,
            h: 0.7,
            fontSize: 28,
            color: FG,
            bold: true,
          });
          slide.addShape(pres.ShapeType.roundRect, {
            x: 11.5,
            y: 1.1,
            w: 1.3,
            h: 0.5,
            fill: { color: healthHex(proj.health) },
            line: { color: healthHex(proj.health), width: 0 },
            rectRadius: 0.08,
          });
          slide.addText(proj.health.toUpperCase(), {
            x: 11.5,
            y: 1.1,
            w: 1.3,
            h: 0.5,
            fontSize: 10,
            color: 'FFFFFF',
            bold: true,
            align: 'center',
            valign: 'middle',
            charSpacing: 8,
          });
          if (proj.summary) {
            slide.addText(proj.summary, {
              x: 0.5,
              y: 1.85,
              w: 12.333,
              h: 0.7,
              fontSize: 13,
              color: MUTED,
              italic: true,
              valign: 'top',
            });
          }
          // Progress bar
          slide.addShape(pres.ShapeType.rect, {
            x: 0.5,
            y: 2.85,
            w: 12.333,
            h: 0.18,
            fill: { color: LINE },
            line: { color: LINE, width: 0 },
          });
          slide.addShape(pres.ShapeType.rect, {
            x: 0.5,
            y: 2.85,
            w: (12.333 * proj.progress) / 100,
            h: 0.18,
            fill: { color: SAGE },
            line: { color: SAGE, width: 0 },
          });
          slide.addText(`${proj.progress}% — ${proj.tasksDone}/${proj.tasksTotal} tâches livrées`, {
            x: 0.5,
            y: 3.15,
            w: 12.333,
            h: 0.3,
            fontSize: 10,
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
              h: 1.7,
              fill: { color: HX.creamLight },
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
              charSpacing: 4,
            });
            slide.addText(String(val), {
              x: x + 0.2,
              y: 4.25,
              w: w - 0.4,
              h: 1.0,
              fontSize: 32,
              color: FG,
              bold: true,
            });
          });
          if (proj.riskNote) {
            slide.addShape(pres.ShapeType.roundRect, {
              x: 0.5,
              y: 5.7,
              w: 12.333,
              h: 0.7,
              fill: { color: 'FCEAE6' },
              line: { color: RED, width: 0.8 },
              rectRadius: 0.05,
            });
            slide.addText(`⚠ ${proj.riskNote}`, {
              x: 0.7,
              y: 5.7,
              w: 12,
              h: 0.7,
              fontSize: 12,
              color: RED,
              bold: true,
              valign: 'middle',
            });
          }
        }
        break;
      }

      case 'tasks': {
        const tasks = filterTasks(payload);
        const byProject = tasks.reduce<Record<string, typeof tasks>>((acc, t) => {
          (acc[t.projectId] ??= []).push(t);
          return acc;
        }, {});
        for (const [pid, list] of Object.entries(byProject)) {
          for (let chunk = 0; chunk < list.length; chunk += 14) {
            const slide = pres.addSlide({ masterName: 'CJ_BODY' });
            addSectionTitle(slide, 'TÂCHES');
            slide.addText(projectNames[pid] ?? pid, {
              x: 0.5,
              y: 1.05,
              w: 12.333,
              h: 0.6,
              fontSize: 22,
              color: FG,
              bold: true,
            });
            const slice = list.slice(chunk, chunk + 14);
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
              y: 1.8,
              w: 12.333,
              colW: [7, 1.8, 1.8, 1.7],
              fontSize: 10,
              border: { type: 'solid', color: LINE, pt: 0.5 },
            });
          }
        }
        break;
      }

      case 'attention':
      case 'workload':
      case 'goals':
      case 'retards': {
        const slide = pres.addSlide({ masterName: 'CJ_BODY' });
        addSectionTitle(slide, item.label);
        const tableData = buildSimpleTable(report, item.key);
        if (tableData) {
          slide.addTable(tableData.rows, {
            x: 0.5,
            y: 1.2,
            w: 12.333,
            colW: tableData.colWidths,
            fontSize: 11,
            border: { type: 'solid', color: LINE, pt: 0.5 },
          });
        }
        break;
      }

      case 'next_steps': {
        if (report.nextSteps?.length) {
          const s = pres.addSlide({ masterName: 'CJ_BODY' });
          addSectionTitle(s, item.label);
          report.nextSteps.slice(0, 8).forEach((step, i) => {
            const y = 1.3 + i * 0.6;
            s.addShape(pres.ShapeType.ellipse, {
              x: 0.5,
              y: y + 0.05,
              w: 0.45,
              h: 0.45,
              fill: { color: SAGE },
              line: { color: SAGE, width: 0 },
            });
            s.addText(String(i + 1), {
              x: 0.5,
              y: y + 0.05,
              w: 0.45,
              h: 0.45,
              fontSize: 12,
              color: 'FFFFFF',
              bold: true,
              align: 'center',
              valign: 'middle',
            });
            s.addText(step, {
              x: 1.1,
              y,
              w: 11.6,
              h: 0.55,
              fontSize: 14,
              color: FG,
              valign: 'middle',
            });
          });
        }
        break;
      }
    }
  }

  /* ─────────────────────── 5. CLOSING ─────────────────────── */
  const closing = pres.addSlide();
  closing.background = { color: CREAM };
  // Sage band on right
  closing.addShape(pres.ShapeType.rect, {
    x: 8.5,
    y: 0,
    w: 4.833,
    h: 7.5,
    fill: { color: SAGE },
    line: { color: SAGE, width: 0 },
  });

  // "Merci."
  closing.addText(COPY.thanks, {
    x: 0.6,
    y: 2.5,
    w: 8,
    h: 1.4,
    fontSize: 96,
    color: FG,
    bold: true,
  });
  // Sage accent
  closing.addShape(pres.ShapeType.rect, {
    x: 0.6,
    y: 3.85,
    w: 0.7,
    h: 0.05,
    fill: { color: SAGE },
    line: { color: SAGE, width: 0 },
  });
  // Subline
  closing.addText(COPY.thanksSub, {
    x: 0.6,
    y: 4.05,
    w: 7.6,
    h: 1.4,
    fontSize: 14,
    color: HX.fg2,
    valign: 'top',
  });
  // Contact block
  closing.addText('CONTACT', {
    x: 0.6,
    y: 5.8,
    w: 4,
    h: 0.3,
    fontSize: 10,
    color: SAGE,
    bold: true,
    charSpacing: 12,
  });
  closing.addText(COPY.contact, {
    x: 0.6,
    y: 6.1,
    w: 4,
    h: 0.3,
    fontSize: 12,
    color: FG,
  });
  closing.addText(COPY.studioWebsite, {
    x: 0.6,
    y: 6.4,
    w: 4,
    h: 0.3,
    fontSize: 12,
    color: SAGE,
    bold: true,
  });
  // Doc ref + classification at bottom of cream
  closing.addText(`${docRef} · ${formatDate(report.generatedAt)}`, {
    x: 0.6,
    y: 7.0,
    w: 7.6,
    h: 0.3,
    fontSize: 9,
    color: MUTED,
    fontFace: 'Courier New',
  });

  // Sage band content: wordmark + classification
  if (wordmark) {
    closing.addImage({ data: wordmark, x: 9.0, y: 3.4, w: 3.6, h: 0.9 });
  }
  closing.addText(COPY.brand.toUpperCase(), {
    x: 8.7,
    y: 0.4,
    w: 4.5,
    h: 0.35,
    fontSize: 10,
    color: 'FFFFFF',
    bold: true,
    charSpacing: 14,
  });
  closing.addText(COPY.classification, {
    x: 8.7,
    y: 7.0,
    w: 4.5,
    h: 0.3,
    fontSize: 10,
    color: 'FFFFFF',
    bold: true,
    charSpacing: 14,
  });

  /* Save */
  const blob = (await pres.write({ outputType: 'blob' })) as Blob;
  downloadBlob(blob, buildFilename(report, 'pptx'));
}

/** Build a simple table-row structure for the table-style sections. */
function buildSimpleTable(
  report: ExportPayload['report'],
  key: 'attention' | 'workload' | 'goals' | 'retards'
): { rows: PptxGenJS.TableRow[]; colWidths: number[] } | null {
  const headStyle = { bold: true, color: 'FFFFFF', fill: { color: SAGE } } as const;
  switch (key) {
    case 'attention': {
      if (!report.attentionPoints?.length) return null;
      return {
        rows: [
          [
            { text: 'Sévérité', options: headStyle },
            { text: 'Sujet', options: headStyle },
            { text: 'Détail', options: headStyle },
            { text: 'Recommandation', options: headStyle },
          ],
          ...report.attentionPoints.map((a) => [
            { text: a.severity.toUpperCase() },
            { text: `${a.title}\n${a.scope}` },
            { text: a.detail },
            { text: a.recommendation ?? '—' },
          ]),
        ],
        colWidths: [1.5, 3, 4.4, 3.4],
      };
    }
    case 'workload': {
      if (!report.workload?.length) return null;
      return {
        rows: [
          [
            { text: 'Membre', options: headStyle },
            { text: 'Tâches ouvertes', options: headStyle },
            { text: 'Charge', options: headStyle },
            { text: 'Statut', options: headStyle },
          ],
          ...report.workload.map((w) => [
            { text: w.name },
            { text: String(w.tasksOpen) },
            { text: `${w.plannedHours}h / ${w.capacityHours}h` },
            { text: w.status },
          ]),
        ],
        colWidths: [4.5, 2.5, 2.8, 2.5],
      };
    }
    case 'goals': {
      if (!report.goalsProgress?.length) return null;
      return {
        rows: [
          [
            { text: 'Objectif', options: headStyle },
            { text: 'Progression', options: headStyle },
            { text: 'Évolution', options: headStyle },
            { text: 'Santé', options: headStyle },
          ],
          ...report.goalsProgress.map((g) => [
            { text: g.title },
            { text: `${g.pct}%` },
            { text: `${g.delta >= 0 ? '+' : ''}${g.delta}` },
            { text: g.health.toUpperCase() },
          ]),
        ],
        colWidths: [7, 2, 1.8, 1.5],
      };
    }
    case 'retards': {
      if (!report.topRetards?.length) return null;
      return {
        rows: [
          [
            { text: 'Tâche', options: headStyle },
            { text: 'Projet', options: headStyle },
            { text: 'Jours', options: headStyle },
            { text: 'Priorité', options: headStyle },
            { text: 'Resp.', options: headStyle },
          ],
          ...report.topRetards.map((r) => [
            { text: r.title },
            { text: r.projectName },
            { text: `+${r.daysLate}` },
            { text: priorityLabel(r.priority) },
            { text: r.ownerInitials },
          ]),
        ],
        colWidths: [5, 3.3, 1.4, 1.6, 1],
      };
    }
  }
}
