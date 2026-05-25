/**
 * Public surface of the report exporter system.
 *
 * Each format (`pdf`/`docx`/`xlsx`/`pptx`/`html`) is **lazy-loaded**
 * via dynamic import — that's how we keep the main bundle small. A
 * user who never exports a report never pays the cost of the 4 heavy
 * underlying libraries (~2 MB combined). The HTML exporter is the
 * only one with zero npm dependencies (pure string templating), so
 * its chunk is tiny (~3 KB).
 */
import type { Report } from '../../stores/appStore';
import type { Task, User } from '../../types';
import type { ExportFormat, ExportOptions, ExportPayload } from './types';

export type { ExportFormat, ExportOptions, ExportPayload, SectionKey } from './types';
export { DEFAULT_SECTIONS, SECTION_LABELS, FORMAT_LABELS, FORMAT_DESCRIPTIONS } from './types';

/** True when an error is a stale-deploy chunk-load failure (not a real bug). */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|dynamically imported module/i.test(
    msg
  );
}

/**
 * Dynamic import that self-heals after a deploy. The exporter chunks
 * (pdf/docx/xlsx/pptx) are content-hashed and renamed on every build; a tab
 * still running the previous bundle 404s when it tries to load one →
 * "Failed to fetch dynamically imported module" and the export silently fails
 * (exactly what users hit). On that specific error we reload the page ONCE
 * (sessionStorage guard against loops) to pull the fresh build. Genuine
 * exporter runtime errors are rethrown untouched so they surface normally.
 */
async function importOrReload<T>(factory: () => Promise<T>): Promise<T> {
  const RELOAD_KEY = 'cj-chunk-reload';
  try {
    const mod = await factory();
    try {
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      /* sessionStorage unavailable (private mode) — ignore */
    }
    return mod;
  } catch (err) {
    if (isChunkLoadError(err) && typeof window !== 'undefined') {
      let alreadyReloaded = true;
      try {
        alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === '1';
        if (!alreadyReloaded) sessionStorage.setItem(RELOAD_KEY, '1');
      } catch {
        alreadyReloaded = false;
      }
      if (!alreadyReloaded) {
        window.location.reload();
        return new Promise<T>(() => {}); // hang until the reload happens
      }
    }
    throw err;
  }
}

/**
 * Run an export. Triggers a download in the browser.
 * Throws if the format is unknown or the underlying library fails.
 */
export async function exportReport(
  format: ExportFormat,
  payload: {
    report: Report;
    tasks: Task[];
    users: User[];
    projectNames: Record<string, string>;
    options: ExportOptions;
  }
): Promise<void> {
  const fullPayload: ExportPayload = payload;
  switch (format) {
    case 'pdf': {
      const { exportToPdf } = await importOrReload(() => import('./pdf'));
      return exportToPdf(fullPayload);
    }
    case 'docx': {
      const { exportToDocx } = await importOrReload(() => import('./docx'));
      return exportToDocx(fullPayload);
    }
    case 'xlsx': {
      const { exportToXlsx } = await importOrReload(() => import('./xlsx'));
      return exportToXlsx(fullPayload);
    }
    case 'pptx': {
      const { exportToPptx } = await importOrReload(() => import('./pptx'));
      return exportToPptx(fullPayload);
    }
    case 'html': {
      const { exportToHtml } = await importOrReload(() => import('./html'));
      return exportToHtml(fullPayload);
    }
    default: {
      const exhaustive: never = format;
      throw new Error(`Format d'export inconnu : ${String(exhaustive)}`);
    }
  }
}

/**
 * Render the report to a standalone HTML string — used by the export dialog to
 * show a live WYSIWYG preview before the user commits to a format/download.
 * Reuses the same self-healing dynamic import as the exporters.
 */
export async function previewReportHtml(payload: {
  report: Report;
  tasks: Task[];
  users: User[];
  projectNames: Record<string, string>;
  options: ExportOptions;
}): Promise<string> {
  const { renderReportHtml } = await importOrReload(() => import('./html'));
  return renderReportHtml(payload as ExportPayload);
}
