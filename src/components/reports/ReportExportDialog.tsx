/**
 * ReportExportDialog.tsx — visualiseur / customizer d'export rapport.
 *
 * 1. Format selector (PDF / DOCX / XLSX / PPTX)
 * 2. Sections cochables avec descriptions
 * 3. Sélection projets à inclure (par défaut tous)
 * 4. Bouton "Générer & télécharger" → trigger la lib lazy-loadée
 *
 * Le dialog ne touche pas au rapport stocké : il produit juste un export
 * one-shot avec les options choisies. Le rapport en base reste intact.
 */
import { useMemo, useState } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Presentation,
  Globe,
  Sparkles,
  Loader2,
  Check,
  Download,
  X,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useApp, type Report } from '../../stores/appStore';
import { cn } from '../../lib/utils';
import {
  exportReport,
  DEFAULT_SECTIONS,
  FORMAT_DESCRIPTIONS,
  FORMAT_LABELS,
  SECTION_LABELS,
  type ExportFormat,
  type SectionKey,
} from '../../lib/reportExporters';

const FORMAT_ICONS: Record<ExportFormat, React.ComponentType<{ className?: string }>> = {
  pdf: FileText,
  docx: FileText,
  xlsx: FileSpreadsheet,
  pptx: Presentation,
  html: Globe,
};

const FORMAT_ACCENT: Record<ExportFormat, string> = {
  pdf: 'border-signal-red/40 bg-signal-red/[0.06] text-signal-red',
  docx: 'border-signal-blue/40 bg-signal-blue/[0.06] text-signal-blue',
  xlsx: 'border-signal-green/40 bg-signal-green/[0.06] text-signal-green',
  pptx: 'border-signal-yellow/40 bg-signal-yellow/[0.06] text-signal-yellow',
  html: 'border-signal-violet/40 bg-signal-violet/[0.06] text-signal-violet',
};

export function ReportExportDialog({
  report,
  open,
  onClose,
}: {
  report: Report;
  open: boolean;
  onClose: () => void;
}) {
  const tasks = useApp((s) => s.tasks);
  const users = useApp((s) => s.users);
  const projects = useApp((s) => s.projects);
  const pushToast = useApp((s) => s.pushToast);

  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [sections, setSections] = useState<Set<SectionKey>>(() => new Set(DEFAULT_SECTIONS));
  const [projectFilter, setProjectFilter] = useState<Set<string>>(
    () => new Set((report.projects ?? []).map((p) => p.projectId))
  );
  const [busy, setBusy] = useState(false);

  // Map project_id → name (for tasks where projectId is the only ref).
  const projectNames = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const p of projects) out[p.id] = p.name;
    for (const p of report.projects ?? []) out[p.projectId] = p.name;
    return out;
  }, [projects, report.projects]);

  const toggleSection = (k: SectionKey) => {
    setSections((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };
  const toggleProject = (id: string) => {
    setProjectFilter((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    if (sections.size === 0) {
      pushToast({ kind: 'info', title: 'Sélectionnez au moins une section' });
      return;
    }
    setBusy(true);
    try {
      // Order sections per DEFAULT_SECTIONS so the doc stays canonical
      const orderedSections = DEFAULT_SECTIONS.filter((s) => sections.has(s));
      const projectIds = projectFilter.size === 0 ? undefined : Array.from(projectFilter);
      await exportReport(format, {
        report,
        tasks,
        users,
        projectNames,
        options: { sections: orderedSections, projectIds },
      });
      pushToast({
        kind: 'success',
        title: `Export ${FORMAT_LABELS[format]} prêt`,
        body: 'Le fichier a été téléchargé.',
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushToast({ kind: 'error', title: 'Échec de l’export', body: msg });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const sectionKeys = Object.keys(SECTION_LABELS) as SectionKey[];

  return (
    <Modal
      open
      onClose={onClose}
      title="Exporter le rapport"
      description="Choisissez le format et les sections à inclure."
      size="xl"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost text-sm px-3 py-1.5" disabled={busy}>
            Annuler
          </button>
          <button
            onClick={handleExport}
            disabled={busy || sections.size === 0}
            className="btn-primary text-sm px-3.5 py-1.5"
          >
            {busy ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Génération…
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                Générer & télécharger {FORMAT_LABELS[format]}
              </>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-7">
        {/* ─── Format selector ─── */}
        <section>
          <SectionTitle>Format de sortie</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map((f) => {
              const Icon = FORMAT_ICONS[f];
              const active = format === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={cn(
                    'p-4 rounded-2xl border text-left transition-all',
                    active
                      ? 'border-atlas-amber bg-atlas-amber/[0.06] shadow-amber-glow'
                      : 'border-atlas-line bg-white hover:border-atlas-amber/40'
                  )}
                >
                  <div
                    className={cn(
                      'w-9 h-9 rounded-xl border flex items-center justify-center mb-3',
                      FORMAT_ACCENT[f]
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="font-medium text-sm text-atlas-fg-1">{FORMAT_LABELS[f]}</div>
                  <p className="text-2xs text-atlas-fg-3 mt-1 leading-relaxed">{FORMAT_DESCRIPTIONS[f]}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ─── Sections to include ─── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle inline>Sections à inclure</SectionTitle>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSections(new Set(DEFAULT_SECTIONS))}
                className="text-2xs uppercase tracking-wider text-atlas-fg-3 hover:text-atlas-amber-deep px-2 py-1 transition"
              >
                Tout cocher
              </button>
              <span className="text-atlas-line">·</span>
              <button
                type="button"
                onClick={() => setSections(new Set())}
                className="text-2xs uppercase tracking-wider text-atlas-fg-3 hover:text-atlas-amber-deep px-2 py-1 transition"
              >
                Tout décocher
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {sectionKeys.map((k) => {
              const checked = sections.has(k);
              return (
                <label
                  key={k}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition',
                    checked
                      ? 'border-atlas-amber/40 bg-atlas-amber/[0.05]'
                      : 'border-atlas-line bg-white hover:border-atlas-amber/30'
                  )}
                >
                  <span
                    className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center mt-0.5 shrink-0 transition',
                      checked
                        ? 'border-atlas-amber-deep bg-atlas-amber-deep text-white'
                        : 'border-atlas-line bg-white'
                    )}
                  >
                    {checked && <Check className="w-3 h-3" strokeWidth={3} />}
                  </span>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggleSection(k)}
                  />
                  <span className="text-sm font-medium text-atlas-fg-1">{SECTION_LABELS[k]}</span>
                </label>
              );
            })}
          </div>
        </section>

        {/* ─── Project filter (only if the report has projects) ─── */}
        {(report.projects?.length ?? 0) > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <SectionTitle inline>
                Projets à inclure · {projectFilter.size}/{report.projects?.length}
              </SectionTitle>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setProjectFilter(new Set((report.projects ?? []).map((p) => p.projectId)))}
                  className="text-2xs uppercase tracking-wider text-atlas-fg-3 hover:text-atlas-amber-deep px-2 py-1 transition"
                >
                  Tout cocher
                </button>
                <span className="text-atlas-line">·</span>
                <button
                  type="button"
                  onClick={() => setProjectFilter(new Set())}
                  className="text-2xs uppercase tracking-wider text-atlas-fg-3 hover:text-atlas-amber-deep px-2 py-1 transition"
                >
                  Tout décocher
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(report.projects ?? []).map((p) => {
                const checked = projectFilter.has(p.projectId);
                return (
                  <button
                    key={p.projectId}
                    type="button"
                    onClick={() => toggleProject(p.projectId)}
                    className={cn(
                      'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition',
                      checked
                        ? 'border-atlas-amber/40 bg-atlas-amber/[0.08] text-atlas-fg-1'
                        : 'border-atlas-line bg-white text-atlas-fg-3 hover:border-atlas-amber/30'
                    )}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
                    {p.name}
                    {!checked && <X className="w-3 h-3 opacity-40" />}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-2xs text-atlas-fg-3 font-light leading-relaxed">
              Les sections "Avancement par projet" et "Détail des tâches" seront filtrées sur ces projets.
            </p>
          </section>
        )}

        {/* ─── Recap ─── */}
        <section className="rounded-2xl border border-atlas-amber/25 bg-gradient-to-br from-atlas-amber/[0.06] to-transparent p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-atlas-amber-deep mt-0.5 shrink-0" />
            <div className="text-2xs text-atlas-fg-2 font-light leading-relaxed">
              <strong className="text-atlas-fg-1 font-medium">{sections.size}</strong> section
              {sections.size > 1 ? 's' : ''} sélectionnée{sections.size > 1 ? 's' : ''} ·{' '}
              <strong className="text-atlas-fg-1 font-medium">{FORMAT_LABELS[format]}</strong> ·{' '}
              {projectFilter.size === 0
                ? 'tous les projets'
                : `${projectFilter.size} projet${projectFilter.size > 1 ? 's' : ''}`}
              . Le fichier est généré dans votre navigateur ; aucune donnée ne quitte votre poste.
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}

function SectionTitle({ children, inline = false }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <h3
      className={cn(
        'inline-flex items-center gap-2 text-2xs uppercase tracking-[0.18em] font-medium text-atlas-fg-3',
        !inline && 'mb-3'
      )}
    >
      {children}
    </h3>
  );
}
