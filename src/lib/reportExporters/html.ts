/**
 * HTML exporter — produces a self-contained .html file the user can
 * open in any browser, attach to an e-mail, or host on an intranet.
 *
 * Design choices:
 *   - Single document, no external CSS or JS — works fully offline once
 *     downloaded. Fonts default to the system sans-serif stack so we
 *     don't ship a 200 KB webfont in every report.
 *   - Uses the same color tokens + COPY strings as the PDF/DOCX/PPTX
 *     exporters via `./design.ts` for visual consistency.
 *   - Sections respect the user's chosen order (options.sections).
 *   - All HTML is HTML-escaped against XSS — the underlying Report
 *     content comes from user input (task titles, narratives) so we
 *     must NOT inject raw markup.
 */

import type { ExportPayload } from './types';
import {
  SECTION_LABELS,
  filterTasks,
  downloadBlob,
  buildFilename,
  taskStatusLabel,
  priorityLabel,
  formatDate,
} from './types';
import { C, COPY, buildToc, buildDocRef, formatPeriodRange } from './design';
import { healthLabel } from '../utils';

/** HTML-escape — never inject raw user content. */
function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Convert the narrative's lightweight markdown (## headings, * bullets,
 *  blank-line paragraphs) into safe HTML. */
function narrativeToHtml(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      out.push(`<h3>${esc(line.slice(3))}</h3>`);
    } else if (line.startsWith('# ')) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      out.push(`<h2>${esc(line.slice(2))}</h2>`);
    } else if (line.startsWith('* ') || line.startsWith('- ')) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${esc(line.slice(2))}</li>`);
    } else {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      out.push(`<p>${esc(line)}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}

export async function exportToHtml(payload: ExportPayload): Promise<void> {
  const { report, users, projectNames, options } = payload;
  const tasks = filterTasks(payload);
  const sections = options.sections;
  const docRef = buildDocRef(report);
  const periodLabel = formatPeriodRange(report);
  const author = users.find((u) => u.id === report.authorId);
  const generatedDate = new Date(report.generatedAt).toLocaleString('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  /* ───────────────────────── Section renderers ───────────────────────── */

  const renderCover = () => `
    <section class="cover">
      <div class="brand-bar"></div>
      <div class="cover-inner">
        <div class="brand-tag">${esc(COPY.brandLong)}</div>
        <h1 class="cover-title">${esc(report.title)}</h1>
        <div class="cover-period">${esc(periodLabel)}</div>
        <p class="cover-period-fr">${esc(report.period)}</p>
        <div class="cover-meta">
          <div><span>${esc(COPY.preparedBy)}</span><strong>${esc(author?.name ?? '—')}</strong></div>
          <div><span>${esc(COPY.generatedOn)}</span><strong>${esc(generatedDate)}</strong></div>
          <div><span>Référence</span><strong class="mono">${esc(docRef)}</strong></div>
          <div><span>Classification</span><strong>${esc(COPY.classification)}</strong></div>
        </div>
      </div>
    </section>
  `;

  const renderToc = () => {
    const toc = buildToc(sections);
    if (toc.length === 0) return '';
    return `
      <section>
        <h2>${esc(COPY.toc)}</h2>
        <ol class="toc">
          ${toc
            .map(
              (item) =>
                `<li><span class="toc-num">${esc(item.number)}</span><span class="toc-label">${esc(
                  item.label
                )}</span></li>`
            )
            .join('')}
        </ol>
      </section>
    `;
  };

  const renderNarrative = () => {
    if (!report.narrative) return '';
    return `
      <section>
        <h2>${esc(SECTION_LABELS.narrative)}</h2>
        <div class="narrative">${narrativeToHtml(report.narrative)}</div>
      </section>
    `;
  };

  const renderMetrics = () => {
    const metrics = report.metrics ?? [];
    if (metrics.length === 0) return '';
    return `
      <section>
        <h2>${esc(SECTION_LABELS.metrics)}</h2>
        <div class="metrics-grid">
          ${metrics
            .map(
              (m) => `
            <div class="metric-card">
              <div class="metric-label">${esc(m.label)}</div>
              <div class="metric-value">${esc(m.value)}</div>
              ${typeof m.delta === 'number' ? `<div class="metric-trend">${m.delta >= 0 ? '+' : ''}${esc(m.delta)}%</div>` : ''}
            </div>
          `
            )
            .join('')}
        </div>
      </section>
    `;
  };

  const renderHighlights = () => {
    const items = report.highlights ?? [];
    if (items.length === 0) return '';
    return `
      <section>
        <h2>${esc(SECTION_LABELS.highlights)}</h2>
        <ul class="highlights">
          ${items.map((h) => `<li>${esc(h)}</li>`).join('')}
        </ul>
      </section>
    `;
  };

  const renderProjects = () => {
    const ids = options.projectIds && options.projectIds.length > 0 ? new Set(options.projectIds) : null;
    const projects = (report.projects ?? []).filter((p) => !ids || ids.has(p.projectId));
    if (projects.length === 0) return '';
    return `
      <section>
        <h2>${esc(SECTION_LABELS.projects)}</h2>
        <div class="data-table-wrap"><table class="data-table">
          <thead>
            <tr>
              <th>Projet</th>
              <th>Avancement</th>
              <th>Statut</th>
              <th>Tâches</th>
              <th>Critiques</th>
            </tr>
          </thead>
          <tbody>
            ${projects
              .map(
                (p) => `
              <tr>
                <td>${esc(projectNames[p.projectId] ?? p.projectId)}</td>
                <td><div class="bar"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, p.progress ?? 0))}%"></div></div><span class="mono">${esc(p.progress ?? 0)}%</span></td>
                <td>${esc(p.health ? healthLabel(p.health) : '—')}</td>
                <td class="num">${esc(p.tasksTotal ?? 0)}</td>
                <td class="num">${esc(p.tasksCritical ?? 0)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table></div>
      </section>
    `;
  };

  const renderTasks = () => {
    if (tasks.length === 0) return '';
    return `
      <section>
        <h2>${esc(SECTION_LABELS.tasks)}</h2>
        <div class="data-table-wrap"><table class="data-table">
          <thead>
            <tr>
              <th>Tâche</th>
              <th>Projet</th>
              <th>Statut</th>
              <th>Priorité</th>
              <th>Échéance</th>
            </tr>
          </thead>
          <tbody>
            ${tasks
              .slice(0, 200)
              .map(
                (t) => `
              <tr>
                <td>${esc(t.title)}</td>
                <td>${esc(projectNames[t.projectId] ?? t.projectId)}</td>
                <td>${esc(taskStatusLabel(t.status))}</td>
                <td>${esc(priorityLabel(t.priority))}</td>
                <td class="mono">${esc(formatDate(t.dueDate))}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table></div>
        ${
          tasks.length > 200
            ? `<p class="muted">${esc(tasks.length - 200)} tâches supplémentaires non affichées — voir l'export Excel pour la liste complète.</p>`
            : ''
        }
      </section>
    `;
  };

  const renderAttention = () => {
    const items = report.attentionPoints ?? [];
    if (items.length === 0) return '';
    return `
      <section>
        <h2>${esc(SECTION_LABELS.attention)}</h2>
        <ul class="attention">
          ${items
            .map(
              (a) =>
                `<li class="sev-${esc(a.severity)}"><strong>${esc(a.title)}</strong>${
                  a.detail ? ` — ${esc(a.detail)}` : ''
                }</li>`
            )
            .join('')}
        </ul>
      </section>
    `;
  };

  const renderNextSteps = () => {
    const items = report.nextSteps ?? [];
    if (items.length === 0) return '';
    return `
      <section>
        <h2>${esc(SECTION_LABELS.next_steps)}</h2>
        <ul class="next-steps">
          ${items.map((s) => `<li>${esc(s)}</li>`).join('')}
        </ul>
      </section>
    `;
  };

  // Dispatcher per section key. The 'cover' key is rendered separately
  // at the top; the rest follow the user's chosen order.
  const renderSection = (key: (typeof sections)[number]): string => {
    switch (key) {
      case 'cover':
        return '';
      case 'narrative':
        return renderNarrative();
      case 'metrics':
        return renderMetrics();
      case 'highlights':
        return renderHighlights();
      case 'projects':
        return renderProjects();
      case 'tasks':
        return renderTasks();
      case 'attention':
        return renderAttention();
      case 'next_steps':
        return renderNextSteps();
      // Sections we don't have dedicated renderers for yet (workload,
      // goals, retards) — silently skip rather than dump raw JSON.
      default:
        return '';
    }
  };

  /* ───────────────────────── Document shell ───────────────────────── */

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(report.title)} — ${esc(COPY.brand)}</title>
  <meta name="description" content="Rapport ${esc(report.kind)} · ${esc(periodLabel)}">
  <meta name="author" content="${esc(COPY.brandLong)}">
  <meta name="generator" content="${esc(COPY.poweredBy)}">
  <meta name="keywords" content="CockpitJourney, rapport, ${esc(report.kind)}, ${esc(report.period)}, ${esc(docRef)}">
  <meta name="dcterms.created" content="${esc(new Date(report.generatedAt).toISOString())}">
  <meta name="robots" content="noindex, nofollow">
  <style>
    :root {
      --brand: ${C.brand};
      --brand-soft: ${C.brandSoft};
      --brand-light: ${C.brandLight};
      --cream: ${C.cream};
      --panel: ${C.panel};
      --line: ${C.line};
      --fg1: ${C.fg1};
      --fg2: ${C.fg2};
      --fg3: ${C.fg3};
      --red: ${C.red};
      --yellow: ${C.yellow};
      --green: ${C.green};
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.55;
      color: var(--fg1);
      background: var(--cream);
      padding: 32px 16px;
      /* Preserve all background colors and gradients when the user prints
       * this report — without this, Chrome/Edge default to "background
       * colors stripped" which kills the cover gradient, the data-table
       * header band, and the attention-point fills. */
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      color-adjust: exact;
    }
    .doc {
      max-width: 820px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0,0,0,0.06);
      border: 1px solid var(--line);
    }
    .cover {
      background: linear-gradient(135deg, var(--brand) 0%, var(--brand-soft) 100%);
      color: white;
      padding: 0;
      position: relative;
    }
    .cover .brand-bar {
      height: 6px;
      background: var(--brand-light);
    }
    .cover-inner {
      padding: 56px 48px 48px;
    }
    .brand-tag {
      font-size: 11px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      opacity: 0.82;
      margin-bottom: 24px;
      font-weight: 600;
    }
    .cover-title {
      font-size: 34px;
      line-height: 1.15;
      margin: 0 0 16px;
      font-weight: 500;
      letter-spacing: -0.01em;
    }
    .cover-period {
      font-size: 17px;
      font-family: ui-monospace, "SF Mono", Consolas, monospace;
      letter-spacing: 0.02em;
      opacity: 0.95;
      margin-bottom: 4px;
    }
    .cover-period-fr {
      opacity: 0.78;
      margin: 0 0 28px;
      font-size: 13px;
    }
    .cover-meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      padding-top: 24px;
      border-top: 1px solid rgba(255,255,255,0.2);
    }
    .cover-meta > div {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .cover-meta span {
      font-size: 10px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      opacity: 0.72;
    }
    .cover-meta strong {
      font-weight: 500;
      font-size: 14px;
    }
    section {
      padding: 32px 48px;
      border-bottom: 1px solid var(--line);
    }
    section:last-child {
      border-bottom: none;
    }
    h2 {
      font-size: 20px;
      font-weight: 500;
      letter-spacing: -0.01em;
      color: var(--fg1);
      margin: 0 0 16px;
      padding-bottom: 10px;
      border-bottom: 2px solid var(--brand);
      display: inline-block;
    }
    h3 {
      font-size: 15px;
      font-weight: 600;
      margin: 18px 0 8px;
      color: var(--fg1);
    }
    p { margin: 0 0 10px; color: var(--fg2); }
    ul, ol { margin: 0 0 14px; padding-left: 22px; color: var(--fg2); }
    li { margin-bottom: 6px; line-height: 1.55; }
    .toc { list-style: none; padding: 0; }
    .toc li {
      display: flex;
      align-items: baseline;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px dotted var(--line);
    }
    .toc-num {
      font-family: ui-monospace, "SF Mono", Consolas, monospace;
      color: var(--brand);
      font-weight: 600;
      font-size: 12px;
    }
    .toc-label { color: var(--fg1); font-size: 14px; }
    .narrative p { color: var(--fg1); }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
    }
    .metric-card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 14px 16px;
    }
    .metric-label {
      font-size: 10px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--fg3);
      margin-bottom: 6px;
      font-weight: 600;
    }
    .metric-value {
      font-size: 24px;
      font-weight: 500;
      color: var(--brand);
    }
    .metric-trend {
      font-size: 11px;
      color: var(--fg3);
      margin-top: 4px;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .data-table th {
      text-align: left;
      font-size: 10px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--fg3);
      font-weight: 600;
      padding: 10px 12px;
      background: var(--panel);
      border-bottom: 2px solid var(--brand);
    }
    .data-table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      color: var(--fg2);
      vertical-align: top;
    }
    .data-table tr:last-child td { border-bottom: none; }
    .data-table td.num { text-align: right; font-family: ui-monospace, "SF Mono", Consolas, monospace; }
    .data-table td.mono { font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 12px; }
    .bar {
      display: inline-block;
      width: 80px;
      height: 6px;
      background: var(--line);
      border-radius: 3px;
      overflow: hidden;
      vertical-align: middle;
      margin-right: 8px;
    }
    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--brand-soft), var(--brand));
    }
    .attention { list-style: none; padding: 0; }
    .attention li {
      padding: 12px 14px;
      margin-bottom: 8px;
      border-radius: 8px;
      border-left: 4px solid var(--fg3);
      background: var(--panel);
    }
    .attention .sev-critical, .attention li.sev-critical { border-left-color: var(--red); background: rgba(184, 91, 77, 0.06); }
    .attention li.sev-high { border-left-color: var(--yellow); background: rgba(182, 146, 72, 0.06); }
    .attention li.sev-medium { border-left-color: var(--blue, #5C7BA1); background: rgba(92, 123, 161, 0.06); }
    .highlights { padding-left: 0; list-style: none; }
    .highlights li {
      padding: 10px 14px;
      background: rgba(77, 154, 106, 0.08);
      border-left: 3px solid var(--green);
      border-radius: 6px;
      margin-bottom: 8px;
      color: var(--fg1);
    }
    .next-steps li { color: var(--fg1); font-weight: 500; }
    .mono { font-family: ui-monospace, "SF Mono", Consolas, monospace; }
    .muted { color: var(--fg3); font-size: 12px; font-style: italic; }
    footer.doc-footer {
      padding: 24px 48px 32px;
      border-top: 1px solid var(--line);
      background: var(--panel);
      color: var(--fg3);
      font-size: 11px;
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }
    footer.doc-footer strong { color: var(--fg2); font-weight: 600; }
    @media print {
      @page {
        size: A4 portrait;
        margin: 14mm 12mm 14mm 12mm;
      }
      body { padding: 0; background: white; }
      .doc { box-shadow: none; border: none; border-radius: 0; max-width: none; }
      /* Each top-level section should sit on its own page slice when
       * possible — but allow long tables to span multiple pages. */
      section { page-break-inside: avoid; break-inside: avoid; }
      .cover { page-break-after: always; break-after: page; }
      /* Tables: repeat the header on every printed page, and keep each
       * row intact (never split a row across two pages). */
      .data-table { page-break-inside: auto; }
      .data-table thead {
        display: table-header-group;
      }
      .data-table tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .metric-card, .attention li, .highlights li, .next-steps li, .toc li {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      /* Hide the footer's gradient bar in print — it doesn't render
       * cleanly on most printers and wastes ink. */
      footer.doc-footer { background: transparent; }
    }
    @media (max-width: 640px) {
      body { padding: 12px 8px; }
      .doc { border-radius: 8px; }
      .cover-inner { padding: 32px 20px 24px; }
      .cover-meta { grid-template-columns: 1fr; gap: 10px; }
      .cover-title { font-size: 24px; }
      .cover-period { font-size: 14px; }
      section { padding: 20px 16px; }
      h2 { font-size: 17px; }
      .metrics-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
      .metric-value { font-size: 20px; }
      .data-table { font-size: 12px; }
      .data-table th, .data-table td { padding: 8px 6px; }
      /* On very narrow viewports, allow horizontal scroll on tables
       * rather than truncating cells. Wrap the table in a scroll
       * container automatically. */
      .data-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      footer.doc-footer { flex-direction: column; padding: 20px 16px; gap: 6px; }
    }
    @media (max-width: 420px) {
      .metrics-grid { grid-template-columns: 1fr; }
      .cover-title { font-size: 20px; }
    }
  </style>
</head>
<body>
  <article class="doc">
    ${renderCover()}
    ${renderToc()}
    ${sections.map(renderSection).join('\n')}
    <footer class="doc-footer">
      <div><strong>${esc(COPY.brandLong)}</strong> · ${esc(COPY.poweredBy)}</div>
      <div>Réf : <span class="mono">${esc(docRef)}</span> · ${esc(COPY.confidential)}</div>
    </footer>
  </article>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  downloadBlob(blob, buildFilename(report, 'html'));
}
