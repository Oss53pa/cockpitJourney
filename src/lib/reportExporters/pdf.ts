/**
 * PDF exporter — Big-4-style executive report.
 *
 * Layout (international standard executive deliverable):
 *   1. Cover page          — full-bleed sage band + brand wordmark +
 *                            title block + period + classification stamp
 *   2. Sommaire (TOC)      — numbered sections, dotted leader, page refs
 *   3. Section dividers    — big chapter number + section title
 *   4. Body pages          — running header (logo + period) + footer
 *                            (classification · doc ref · page n/N)
 *   5. Closing page        — Thank you, contact, legal disclaimer
 *
 * Pure client-side via jsPDF + jspdf-autotable. No server round-trip.
 */
import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
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
import {
  C,
  PAGE,
  GAP,
  TYPE,
  COPY,
  buildToc,
  buildDocRef,
  loadWordmarkDataUrl,
  rgb,
  stripMarkdown,
  formatPeriodRange,
} from './design';

/** jsPDF instance with the autotable side-effect attached. */
type DocWithAutotable = jsPDF & { lastAutoTable: { finalY: number } };

interface Cursor {
  y: number;
  section: string;
}

function healthHex(h?: 'green' | 'yellow' | 'red'): string {
  return h === 'red' ? C.red : h === 'yellow' ? C.yellow : C.green;
}

/**
 * Strip characters jsPDF's built-in Helvetica can't render to a glyph.
 * The font's encoding is WinAnsi (Latin-1 + a few extras) — anything
 * outside that range was producing gibberish (the "& & & 1& t& à&" we
 * saw in the user's screenshot was the WARNING emoji ⚠ falling apart
 * inside the WinAnsi encoder). We replace common offenders inline and
 * drop the rest.
 */
function safeText(s: string | undefined | null): string {
  if (!s) return '';
  return s
    .replace(/⚠/g, '!')
    .replace(/✦/g, '·')
    .replace(/[…]/g, '...')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '') // emoji
    .replace(/[…]/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
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

export async function exportToPdf(payload: ExportPayload): Promise<void> {
  const { report, options, projectNames } = payload;
  const docRef = buildDocRef(report);
  const wordmarkDataUrl = await loadWordmarkDataUrl();

  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  // Document metadata (PDF/ISO standard) — surfaces in viewers, search, DMS.
  doc.setProperties({
    title: `${report.title} — ${report.period}`,
    subject: `Rapport ${report.kind} · ${formatPeriodRange(report)}`,
    author: COPY.brandLong,
    keywords: `CockpitJourney, rapport, ${report.kind}, ${report.period}, ${docRef}`,
    creator: COPY.poweredBy,
  });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  /* ─── Body-page helpers ─── */
  const newBodyPage = (cur: Cursor) => {
    doc.addPage();
    cur.y = PAGE.marginTop;
  };

  const ensureSpace = (cur: Cursor, need: number) => {
    if (cur.y + need > H - PAGE.marginBottom - PAGE.runningFooter) {
      newBodyPage(cur);
    }
  };

  const drawSubheading = (cur: Cursor, text: string) => {
    ensureSpace(cur, 28);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...rgb(C.fg1));
    doc.setFontSize(TYPE.h3);
    doc.text(text, PAGE.marginLeft, cur.y);
    cur.y += GAP.heading;
  };

  const drawText = (
    cur: Cursor,
    text: string,
    opts: { color?: string; size?: number; italic?: boolean } = {}
  ) => {
    if (!text) return;
    const size = opts.size ?? TYPE.body;
    doc.setFont('helvetica', opts.italic ? 'italic' : 'normal');
    doc.setTextColor(...rgb(opts.color ?? C.fg2));
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, W - PAGE.marginLeft - PAGE.marginRight);
    for (const line of lines) {
      ensureSpace(cur, size + 2);
      doc.text(line, PAGE.marginLeft, cur.y);
      cur.y += size + 2;
    }
    cur.y += GAP.paragraph;
  };

  /* ─────────────────────── 1. COVER PAGE ─────────────────────── */
  doc.setFillColor(...rgb(C.brand));
  doc.rect(0, 0, W * 0.36, H, 'F');
  doc.setFillColor(...rgb(C.cream));
  doc.rect(W * 0.36, 0, W * 0.64, H, 'F');

  // Wordmark on cream side, top-right
  if (wordmarkDataUrl) {
    try {
      doc.addImage(wordmarkDataUrl, 'PNG', W - PAGE.marginRight - 180, 56, 180, 46);
    } catch {
      /* silent */
    }
  }

  // Sage thin accent line above title
  doc.setDrawColor(...rgb(C.brand));
  doc.setLineWidth(2);
  doc.line(W * 0.36 + PAGE.marginLeft, 240, W * 0.36 + PAGE.marginLeft + 40, 240);

  // Eyebrow
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...rgb(C.brand));
  doc.setFontSize(TYPE.eyebrow);
  doc.text(kindEyebrow(report.kind), W * 0.36 + PAGE.marginLeft, 270, { charSpace: 1.5 });

  // Big title — auto-shrink if it doesn't fit on 2 lines at full size.
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...rgb(C.fg1));
  // Cream side starts at 36% of W; leave a comfortable inner margin.
  const titleX = W * 0.36 + PAGE.marginLeft;
  const titleMaxW = W - titleX - PAGE.marginRight;
  let titleSize = TYPE.cover;
  let titleLines: string[] = [];
  // Try 36 → 32 → 28 → 24 until the title fits on at most 3 lines.
  for (const size of [TYPE.cover, 32, 28, 24]) {
    doc.setFontSize(size);
    titleLines = doc.splitTextToSize(report.title, titleMaxW) as string[];
    if (titleLines.length <= 3) {
      titleSize = size;
      break;
    }
  }
  doc.setFontSize(titleSize);
  let titleY = 320;
  const lineH = Math.round(titleSize * 1.18);
  titleLines.forEach((line: string) => {
    doc.text(line, titleX, titleY);
    titleY += lineH;
  });

  // Period range (DD/MM/YYYY → DD/MM/YYYY) — the canonical date span
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...rgb(C.brand));
  doc.setFontSize(TYPE.h3);
  doc.text(formatPeriodRange(report), W * 0.36 + PAGE.marginLeft, titleY + 18);
  // Long-form below for human readability
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...rgb(C.fg3));
  doc.setFontSize(TYPE.body);
  doc.text(report.period, W * 0.36 + PAGE.marginLeft, titleY + 36);

  // Bottom block: prepared by + date
  const bottomY = H - 100;
  doc.setDrawColor(...rgb(C.line));
  doc.setLineWidth(0.5);
  doc.line(W * 0.36 + PAGE.marginLeft, bottomY - 18, W - PAGE.marginRight, bottomY - 18);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...rgb(C.fg3));
  doc.setFontSize(TYPE.micro);
  doc.text(COPY.preparedBy.toUpperCase(), W * 0.36 + PAGE.marginLeft, bottomY, { charSpace: 1 });
  doc.text(COPY.generatedOn.toUpperCase(), W * 0.36 + PAGE.marginLeft + 200, bottomY, {
    charSpace: 1,
  });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...rgb(C.fg1));
  doc.setFontSize(TYPE.body);
  doc.text(COPY.brand, W * 0.36 + PAGE.marginLeft, bottomY + 16);
  doc.text(formatDate(report.generatedAt), W * 0.36 + PAGE.marginLeft + 200, bottomY + 16);

  // Sage band — brand tag at top-left
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255);
  doc.setFontSize(TYPE.brandTag);
  doc.text(COPY.brandLong.toUpperCase(), PAGE.marginLeft, 64, { charSpace: 1.5 });

  // Classification stamp at bottom-left of sage band
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255);
  doc.setFontSize(TYPE.micro);
  doc.setDrawColor(255);
  doc.setLineWidth(0.5);
  doc.line(PAGE.marginLeft, H - 70, PAGE.marginLeft + 60, H - 70);
  doc.text(COPY.classification, PAGE.marginLeft, H - 60, { charSpace: 2 });

  // Doc reference (monospace) at very bottom-left of sage band
  doc.setFont('courier', 'normal');
  doc.setFontSize(TYPE.micro);
  doc.text(docRef, PAGE.marginLeft, H - 36);

  /* ─────────────────────── 2. SOMMAIRE ─────────────────────── */
  const cur: Cursor = { y: PAGE.marginTop, section: COPY.toc };
  const toc = buildToc(options.sections);

  if (toc.length > 0) {
    doc.addPage();
    cur.y = PAGE.marginTop;

    // Sommaire eyebrow + big title
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...rgb(C.brand));
    doc.setFontSize(TYPE.eyebrow);
    doc.text('TABLE DES MATIÈRES', PAGE.marginLeft, cur.y, { charSpace: 1.5 });
    cur.y += 24;

    doc.setFontSize(TYPE.h1);
    doc.setTextColor(...rgb(C.fg1));
    doc.text(COPY.toc, PAGE.marginLeft, cur.y);
    cur.y += 14;

    // Sage accent line
    doc.setDrawColor(...rgb(C.brand));
    doc.setLineWidth(2);
    doc.line(PAGE.marginLeft, cur.y, PAGE.marginLeft + 60, cur.y);
    cur.y += 30;

    // Pre-estimate: cover=1, toc=2, then each section ≈ 2 pages incl. divider
    let pageEstimate = 3;
    for (const item of toc) {
      ensureSpace(cur, 30);

      // Section number in big sage
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...rgb(C.brand));
      doc.setFontSize(TYPE.h3);
      doc.text(item.number, PAGE.marginLeft, cur.y);

      // Label
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...rgb(C.fg1));
      doc.setFontSize(TYPE.bodyBold);
      doc.text(item.label, PAGE.marginLeft + 44, cur.y);

      // Dotted leader between label and page number
      const labelW = doc.getTextWidth(item.label);
      const labelEnd = PAGE.marginLeft + 44 + labelW + 8;
      const pageNumStr = String(pageEstimate);
      const pageNumW = doc.getTextWidth(pageNumStr);
      const dotsEnd = W - PAGE.marginRight - pageNumW - 8;

      doc.setTextColor(...rgb(C.fg4));
      const dotCount = Math.max(0, Math.floor((dotsEnd - labelEnd) / 4));
      let dotsX = labelEnd;
      for (let i = 0; i < dotCount; i++) {
        doc.text('·', dotsX, cur.y);
        dotsX += 4;
      }

      // Page number
      doc.setFont('courier', 'bold');
      doc.setTextColor(...rgb(C.fg2));
      doc.text(pageNumStr, W - PAGE.marginRight, cur.y, { align: 'right' });

      cur.y += 26;
      pageEstimate += 2;
    }

    // Footer note on TOC page
    cur.y = H - 90;
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...rgb(C.fg4));
    doc.setFontSize(TYPE.micro);
    doc.text(`${COPY.poweredBy} · ${docRef}`, PAGE.marginLeft, cur.y);
  }

  /* ─── Section divider page ─── */
  const drawSectionDivider = (number: string, label: string, key: SectionKey) => {
    doc.addPage();
    cur.section = label;

    // Top sage strip
    doc.setFillColor(...rgb(C.brand));
    doc.rect(0, 0, W, 6, 'F');

    // Big chapter number, sage glow, top-right — sized to never collide
    // with the section title (right-aligned, top-anchored at y=200).
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...rgb(C.brandGlow));
    doc.setFontSize(140);
    doc.text(number, W - PAGE.marginRight, 200, { align: 'right' });

    // Eyebrow PARTIE 0X
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...rgb(C.brand));
    doc.setFontSize(TYPE.eyebrow);
    doc.text(`PARTIE ${number}`, PAGE.marginLeft, 220, { charSpace: 2 });

    // Section title — auto-shrink if too long, never overlap the chapter
    // number on the right (reserve 160pt for the number + breathing).
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...rgb(C.fg1));
    let labelSize: number = TYPE.h1;
    let lines: string[] = [];
    const labelMaxW = W - PAGE.marginLeft - PAGE.marginRight - 160;
    for (const size of [TYPE.h1, 18, 16, 14]) {
      doc.setFontSize(size);
      lines = doc.splitTextToSize(label, labelMaxW) as string[];
      if (lines.length <= 3) {
        labelSize = size;
        break;
      }
    }
    doc.setFontSize(labelSize);
    let yy = 250;
    const lineH = Math.round(labelSize * 1.25);
    lines.forEach((line: string) => {
      doc.text(line, PAGE.marginLeft, yy);
      yy += lineH;
    });

    // Sage thin line under title
    doc.setDrawColor(...rgb(C.brand));
    doc.setLineWidth(2);
    doc.line(PAGE.marginLeft, yy + 8, PAGE.marginLeft + 60, yy + 8);

    // Period range below the section title
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...rgb(C.brand));
    doc.setFontSize(TYPE.body);
    doc.text(formatPeriodRange(report), PAGE.marginLeft, yy + 32);

    // Body content starts on the NEXT page
    newBodyPage(cur);
    void key;
  };

  /* ─────────────────────── 3. CONTENT SECTIONS ─────────────────────── */

  for (const item of toc) {
    drawSectionDivider(item.number, item.label, item.key);

    switch (item.key) {
      case 'narrative': {
        if (report.narrative) {
          drawText(cur, stripMarkdown(report.narrative));
        } else {
          drawText(cur, 'Aucune narration PROPH3T générée pour ce rapport.', {
            italic: true,
            color: C.fg3,
          });
        }
        break;
      }

      case 'metrics': {
        if (report.metrics?.length) {
          const rows: RowInput[] = report.metrics.map((m) => [
            m.label,
            m.value,
            typeof m.delta === 'number' ? `${m.delta >= 0 ? '+' : ''}${m.delta}%` : '—',
          ]);
          autoTable(doc, {
            startY: cur.y,
            head: [['Indicateur', 'Valeur', 'Évolution']],
            body: rows,
            theme: 'grid',
            headStyles: {
              fillColor: rgb(C.brand),
              textColor: 255,
              fontStyle: 'bold',
              fontSize: TYPE.eyebrow,
              halign: 'left',
              cellPadding: 8,
            },
            bodyStyles: { fontSize: TYPE.body, textColor: rgb(C.fg1), cellPadding: 8, overflow: 'linebreak' },
            alternateRowStyles: { fillColor: rgb(C.creamLight) },
            columnStyles: {
              1: { fontStyle: 'bold', halign: 'right' },
              2: { halign: 'right', fontStyle: 'bold' },
            },
            margin: { left: PAGE.marginLeft, right: PAGE.marginRight },
          });
          cur.y = (doc as DocWithAutotable).lastAutoTable.finalY + GAP.table;
        }
        break;
      }

      case 'highlights': {
        if (report.highlights?.length) {
          report.highlights.forEach((h, i) => {
            ensureSpace(cur, 24);
            doc.setFillColor(...rgb(C.brandGlow));
            doc.circle(PAGE.marginLeft + 6, cur.y - 4, 8, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...rgb(C.brand));
            doc.setFontSize(TYPE.small);
            doc.text(String(i + 1), PAGE.marginLeft + 6, cur.y - 1.5, { align: 'center' });

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...rgb(C.fg1));
            doc.setFontSize(TYPE.body);
            const lines = doc.splitTextToSize(h, W - PAGE.marginLeft - PAGE.marginRight - 22);
            let yy = cur.y;
            lines.forEach((line: string) => {
              doc.text(line, PAGE.marginLeft + 22, yy);
              yy += TYPE.body + 3;
            });
            cur.y = yy + 6;
          });
        }
        break;
      }

      case 'projects': {
        const allow = new Set(options.projectIds ?? []);
        const projects = (report.projects ?? []).filter((p) => allow.size === 0 || allow.has(p.projectId));
        for (const p of projects) {
          /* ── Project header row (name + health pill) ── */
          ensureSpace(cur, 24);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...rgb(C.fg1));
          doc.setFontSize(TYPE.h3);
          // Truncate the name if needed so it doesn't crash into the pill.
          const pillW = 56;
          const nameMaxW = W - PAGE.marginLeft - PAGE.marginRight - pillW - 12;
          const nameLines = doc.splitTextToSize(safeText(p.name), nameMaxW) as string[];
          doc.text(nameLines[0] ?? '', PAGE.marginLeft, cur.y);

          // Health pill (right-anchored on the same row as name)
          const pillX = W - PAGE.marginRight - pillW;
          const pillCol = rgb(healthHex(p.health));
          doc.setFillColor(...pillCol);
          doc.roundedRect(pillX, cur.y - 11, pillW, 16, 4, 4, 'F');
          doc.setTextColor(255);
          doc.setFontSize(TYPE.eyebrow);
          doc.setFont('helvetica', 'bold');
          doc.text(p.health.toUpperCase(), pillX + pillW / 2, cur.y, {
            align: 'center',
            charSpace: 1,
          });
          cur.y += 14;

          /* ── Summary (italic muted) ── */
          if (p.summary) {
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(...rgb(C.fg3));
            doc.setFontSize(TYPE.body);
            const sumLines = doc.splitTextToSize(
              safeText(p.summary),
              W - PAGE.marginLeft - PAGE.marginRight
            ) as string[];
            // Reserve space for ALL lines together — never split the
            // summary across pages mid-sentence.
            ensureSpace(cur, sumLines.length * 13 + 4);
            sumLines.forEach((l: string) => {
              doc.text(l, PAGE.marginLeft, cur.y);
              cur.y += 13;
            });
            cur.y += 4;
          }

          /* ── Progress bar + caption ── */
          ensureSpace(cur, 28);
          const barW = W - PAGE.marginLeft - PAGE.marginRight;
          const barH = 6;
          doc.setFillColor(...rgb(C.line));
          doc.roundedRect(PAGE.marginLeft, cur.y, barW, barH, 3, 3, 'F');
          doc.setFillColor(...rgb(C.brand));
          doc.roundedRect(PAGE.marginLeft, cur.y, (barW * p.progress) / 100, barH, 3, 3, 'F');
          cur.y += barH + 5;
          doc.setTextColor(...rgb(C.fg3));
          doc.setFontSize(TYPE.micro);
          doc.text(`${p.progress}% — ${p.tasksDone}/${p.tasksTotal} taches livrees`, PAGE.marginLeft, cur.y);
          cur.y += 12;

          /* ── Counts grid (autoTable handles its own pagination) ── */
          ensureSpace(cur, 50);
          autoTable(doc, {
            startY: cur.y,
            head: [['Total', 'Livrees', 'En cours', 'En retard', 'Critiques']],
            body: [[p.tasksTotal, p.tasksDone, p.tasksInProgress, p.tasksOverdue, p.tasksCritical]],
            theme: 'grid',
            headStyles: {
              fillColor: rgb(C.brand),
              textColor: 255,
              fontSize: TYPE.eyebrow,
              halign: 'center',
              cellPadding: 6,
            },
            bodyStyles: {
              fontSize: TYPE.body,
              halign: 'center',
              cellPadding: 6,
              overflow: 'linebreak',
            },
            margin: { left: PAGE.marginLeft, right: PAGE.marginRight },
          });
          cur.y = (doc as DocWithAutotable).lastAutoTable.finalY + GAP.paragraph;

          /* ── Risk note (red box, plain text — no emoji) ── */
          if (p.riskNote) {
            const note = safeText(p.riskNote);
            const noteLines = doc.splitTextToSize(
              note,
              W - PAGE.marginLeft - PAGE.marginRight - 60
            ) as string[];
            const noteH = Math.max(22, noteLines.length * 12 + 10);
            ensureSpace(cur, noteH + 4);
            doc.setFillColor(...rgb('#FCEAE6'));
            doc.roundedRect(PAGE.marginLeft, cur.y, W - PAGE.marginLeft - PAGE.marginRight, noteH, 3, 3, 'F');
            // "RISQUE" tag in red, then the note in red regular.
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...rgb(C.red));
            doc.setFontSize(TYPE.eyebrow);
            doc.text('RISQUE', PAGE.marginLeft + 8, cur.y + 12, { charSpace: 1.5 });
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(TYPE.small);
            const noteY = cur.y + 12;
            noteLines.forEach((line, idx) => {
              doc.text(line, PAGE.marginLeft + 56, noteY + idx * 12);
            });
            cur.y += noteH + 8;
          } else {
            cur.y += GAP.section;
          }
        }
        break;
      }

      case 'tasks': {
        const tasks = filterTasks(payload);
        if (tasks.length === 0) break;
        const byProject = tasks.reduce<Record<string, typeof tasks>>((acc, t) => {
          (acc[t.projectId] ??= []).push(t);
          return acc;
        }, {});
        for (const [pid, list] of Object.entries(byProject)) {
          drawSubheading(cur, projectNames[pid] ?? pid);
          autoTable(doc, {
            startY: cur.y,
            head: [['Tâche', 'Statut', 'Priorité', 'Échéance']],
            body: list.map((t) => [
              t.title,
              taskStatusLabel(t.status),
              priorityLabel(t.priority),
              formatDate(t.dueDate),
            ]),
            theme: 'striped',
            headStyles: {
              fillColor: rgb(C.brand),
              textColor: 255,
              fontSize: TYPE.eyebrow,
              cellPadding: 6,
            },
            bodyStyles: { fontSize: TYPE.small, cellPadding: 6, overflow: 'linebreak' },
            alternateRowStyles: { fillColor: rgb(C.creamLight) },
            columnStyles: {
              0: { cellWidth: 'auto' },
              1: { cellWidth: 70 },
              2: { cellWidth: 70 },
              3: { cellWidth: 70, halign: 'right' },
            },
            margin: { left: PAGE.marginLeft, right: PAGE.marginRight },
          });
          cur.y = (doc as DocWithAutotable).lastAutoTable.finalY + GAP.table;
        }
        break;
      }

      case 'attention': {
        if (report.attentionPoints?.length) {
          autoTable(doc, {
            startY: cur.y,
            head: [['Sévérité', 'Sujet', 'Détail', 'Recommandation']],
            body: report.attentionPoints.map((a) => [
              a.severity.toUpperCase(),
              `${a.title}\n${a.scope}`,
              a.detail,
              a.recommendation ?? '—',
            ]),
            theme: 'grid',
            headStyles: {
              fillColor: rgb(C.brand),
              textColor: 255,
              fontSize: TYPE.eyebrow,
              cellPadding: 6,
            },
            bodyStyles: { fontSize: TYPE.small, valign: 'top', cellPadding: 6, overflow: 'linebreak' },
            columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' } },
            margin: { left: PAGE.marginLeft, right: PAGE.marginRight },
          });
          cur.y = (doc as DocWithAutotable).lastAutoTable.finalY + GAP.table;
        }
        break;
      }

      case 'workload': {
        if (report.workload?.length) {
          autoTable(doc, {
            startY: cur.y,
            head: [['Membre', 'Tâches ouvertes', 'Charge', 'Statut']],
            body: report.workload.map((w) => [
              w.name,
              w.tasksOpen,
              `${w.plannedHours}h / ${w.capacityHours}h`,
              w.status,
            ]),
            theme: 'grid',
            headStyles: {
              fillColor: rgb(C.brand),
              textColor: 255,
              fontSize: TYPE.eyebrow,
              cellPadding: 6,
            },
            bodyStyles: { fontSize: TYPE.small, cellPadding: 6, overflow: 'linebreak' },
            margin: { left: PAGE.marginLeft, right: PAGE.marginRight },
          });
          cur.y = (doc as DocWithAutotable).lastAutoTable.finalY + GAP.table;
        }
        break;
      }

      case 'goals': {
        if (report.goalsProgress?.length) {
          autoTable(doc, {
            startY: cur.y,
            head: [['Objectif', 'Progression', 'Évolution', 'Santé']],
            body: report.goalsProgress.map((g) => [
              g.title,
              `${g.pct}%`,
              `${g.delta >= 0 ? '+' : ''}${g.delta}`,
              g.health.toUpperCase(),
            ]),
            theme: 'grid',
            headStyles: {
              fillColor: rgb(C.brand),
              textColor: 255,
              fontSize: TYPE.eyebrow,
              cellPadding: 6,
            },
            bodyStyles: { fontSize: TYPE.small, cellPadding: 6, overflow: 'linebreak' },
            margin: { left: PAGE.marginLeft, right: PAGE.marginRight },
          });
          cur.y = (doc as DocWithAutotable).lastAutoTable.finalY + GAP.table;
        }
        break;
      }

      case 'retards': {
        if (report.topRetards?.length) {
          autoTable(doc, {
            startY: cur.y,
            head: [['Tâche', 'Projet', 'Jours', 'Priorité', 'Responsable']],
            body: report.topRetards.map((r) => [
              r.title,
              r.projectName,
              `+${r.daysLate}`,
              priorityLabel(r.priority),
              r.ownerInitials,
            ]),
            theme: 'grid',
            headStyles: {
              fillColor: rgb(C.brand),
              textColor: 255,
              fontSize: TYPE.eyebrow,
              cellPadding: 6,
            },
            bodyStyles: { fontSize: TYPE.small, cellPadding: 6, overflow: 'linebreak' },
            columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } },
            margin: { left: PAGE.marginLeft, right: PAGE.marginRight },
          });
          cur.y = (doc as DocWithAutotable).lastAutoTable.finalY + GAP.table;
        }
        break;
      }

      case 'next_steps': {
        if (report.nextSteps?.length) {
          report.nextSteps.forEach((s, i) => {
            ensureSpace(cur, 24);
            doc.setFillColor(...rgb(C.brand));
            doc.circle(PAGE.marginLeft + 6, cur.y - 4, 8, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255);
            doc.setFontSize(TYPE.small);
            doc.text(String(i + 1), PAGE.marginLeft + 6, cur.y - 1.5, { align: 'center' });

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...rgb(C.fg1));
            doc.setFontSize(TYPE.body);
            const lines = doc.splitTextToSize(s, W - PAGE.marginLeft - PAGE.marginRight - 22);
            let yy = cur.y;
            lines.forEach((line: string) => {
              doc.text(line, PAGE.marginLeft + 22, yy);
              yy += TYPE.body + 3;
            });
            cur.y = yy + 6;
          });
        }
        break;
      }
    }
  }

  /* ─────────────────────── 4. CLOSING PAGE ─────────────────────── */
  doc.addPage();
  doc.setFillColor(...rgb(C.brand));
  doc.rect(W * 0.64, 0, W * 0.36, H, 'F');
  doc.setFillColor(...rgb(C.cream));
  doc.rect(0, 0, W * 0.64, H, 'F');

  // "Merci." big
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...rgb(C.fg1));
  doc.setFontSize(TYPE.coverBig);
  doc.text(COPY.thanks, PAGE.marginLeft, H / 2 - 20);

  // Sage accent
  doc.setDrawColor(...rgb(C.brand));
  doc.setLineWidth(2);
  doc.line(PAGE.marginLeft, H / 2 + 8, PAGE.marginLeft + 50, H / 2 + 8);

  // Subline
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...rgb(C.fg2));
  doc.setFontSize(TYPE.h3);
  const subLines = doc.splitTextToSize(COPY.thanksSub, W * 0.55);
  let sy = H / 2 + 36;
  subLines.forEach((l: string) => {
    doc.text(l, PAGE.marginLeft, sy);
    sy += 18;
  });

  // Contact block
  sy += 20;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...rgb(C.brand));
  doc.setFontSize(TYPE.eyebrow);
  doc.text('CONTACT', PAGE.marginLeft, sy, { charSpace: 1.5 });
  sy += 14;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...rgb(C.fg1));
  doc.setFontSize(TYPE.body);
  doc.text(COPY.contact, PAGE.marginLeft, sy);
  sy += 14;
  doc.setTextColor(...rgb(C.brand));
  doc.text(COPY.studioWebsite, PAGE.marginLeft, sy);

  // Legal disclaimer at bottom of cream side
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...rgb(C.fg4));
  doc.setFontSize(TYPE.micro);
  const legalLines = doc.splitTextToSize(COPY.legal, W * 0.55);
  let ly = H - 100;
  legalLines.forEach((l: string) => {
    doc.text(l, PAGE.marginLeft, ly);
    ly += 10;
  });

  // Doc reference at very bottom
  doc.setFont('courier', 'normal');
  doc.setTextColor(...rgb(C.fg3));
  doc.setFontSize(TYPE.micro);
  doc.text(`${docRef} · ${formatDate(report.generatedAt)}`, PAGE.marginLeft, H - 40);

  // Sage band: wordmark + brand tag + classification
  if (wordmarkDataUrl) {
    try {
      doc.addImage(wordmarkDataUrl, 'PNG', W - PAGE.marginRight - 140, H / 2 - 18, 140, 36);
    } catch {
      /* silent */
    }
  }
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255);
  doc.setFontSize(TYPE.brandTag);
  doc.text(COPY.brand.toUpperCase(), W * 0.64 + PAGE.marginLeft - 12, 64, { charSpace: 1.5 });
  doc.setFontSize(TYPE.micro);
  doc.text(COPY.classification, W * 0.64 + PAGE.marginLeft - 12, H - 64, { charSpace: 2 });

  /* ─────────────────────── 5. RUNNING HEADER & FOOTER ─────────────────────── */
  const total = doc.getNumberOfPages();
  for (let p = 2; p <= total - 1; p++) {
    doc.setPage(p);

    // Running header
    doc.setDrawColor(...rgb(C.line));
    doc.setLineWidth(0.4);
    doc.line(PAGE.marginLeft, 60, W - PAGE.marginRight, 60);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...rgb(C.brand));
    doc.setFontSize(TYPE.micro);
    doc.text(COPY.brand.toUpperCase(), PAGE.marginLeft, 50, { charSpace: 1 });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...rgb(C.fg3));
    doc.text(formatPeriodRange(report), W - PAGE.marginRight, 50, { align: 'right' });

    // Running footer
    doc.setDrawColor(...rgb(C.line));
    doc.line(PAGE.marginLeft, H - 50, W - PAGE.marginRight, H - 50);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...rgb(C.fg3));
    doc.setFontSize(TYPE.micro);
    doc.text(COPY.classification, PAGE.marginLeft, H - 36, { charSpace: 2 });
    doc.setFont('courier', 'normal');
    doc.text(docRef, W / 2, H - 36, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...rgb(C.fg1));
    doc.text(`${p} / ${total}`, W - PAGE.marginRight, H - 36, { align: 'right' });
  }

  /* Done */
  const blob = doc.output('blob');
  downloadBlob(blob, buildFilename(report, 'pdf'));
}
