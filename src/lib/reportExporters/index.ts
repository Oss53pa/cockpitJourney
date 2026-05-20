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
      const { exportToPdf } = await import('./pdf');
      return exportToPdf(fullPayload);
    }
    case 'docx': {
      const { exportToDocx } = await import('./docx');
      return exportToDocx(fullPayload);
    }
    case 'xlsx': {
      const { exportToXlsx } = await import('./xlsx');
      return exportToXlsx(fullPayload);
    }
    case 'pptx': {
      const { exportToPptx } = await import('./pptx');
      return exportToPptx(fullPayload);
    }
    case 'html': {
      const { exportToHtml } = await import('./html');
      return exportToHtml(fullPayload);
    }
    default: {
      const exhaustive: never = format;
      throw new Error(`Format d'export inconnu : ${String(exhaustive)}`);
    }
  }
}
