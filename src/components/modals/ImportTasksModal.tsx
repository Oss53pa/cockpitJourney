import { useMemo, useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, Loader2, ArrowRight } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { FieldLabel, NativeSelect } from '../ui/Field';
import { useApp } from '../../stores/appStore';
import type { Section, TaskStatus } from '../../types';
import {
  parseSpreadsheet,
  autoDetectMapping,
  buildTasks,
  type ParsedSheet,
  type ColumnMapping,
  type ImportField,
} from '../../lib/taskImport';

const FIELD_LABELS: { key: ImportField; label: string; required?: boolean }[] = [
  { key: 'title', label: 'Titre', required: true },
  { key: 'description', label: 'Description' },
  { key: 'status', label: 'Statut' },
  { key: 'priority', label: 'Priorité' },
  { key: 'dueDate', label: 'Échéance' },
  { key: 'tags', label: 'Tags' },
];

/** Choisit la section qui correspond au statut (sinon la première). */
function sectionForStatus(sections: Section[], status?: TaskStatus): Section | undefined {
  if (!sections.length) return undefined;
  if (status) {
    const byStatus = sections.find((s) => {
      const n = s.name.toLowerCase();
      if (status === 'done') return n.includes('termin') || n.includes('livr') || n.includes('fait');
      if (status === 'in_review') return n.includes('revue') || n.includes('validation');
      if (status === 'in_progress') return n.includes('cours');
      if (status === 'blocked') return n.includes('bloqu');
      return n.includes('faire') || n.includes('todo') || n.includes('backlog');
    });
    if (byStatus) return byStatus;
  }
  return [...sections].sort((a, b) => a.position - b.position)[0];
}

export function ImportTasksModal({
  payload,
  onClose,
}: {
  payload: { projectId: string };
  onClose: () => void;
}) {
  const projectId = payload?.projectId;
  const sections = useApp((s) => s.sections.filter((sec) => sec.projectId === projectId));
  const createTask = useApp((s) => s.createTask);
  const pushToast = useApp((s) => s.pushToast);

  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [importing, setImporting] = useState(false);

  const onFile = async (file: File) => {
    setParsing(true);
    setFileName(file.name);
    try {
      const sheet = await parseSpreadsheet(file);
      if (!sheet.rows.length) {
        pushToast({ kind: 'warning', title: 'Fichier vide', body: 'Aucune ligne détectée.' });
        setParsed(null);
        return;
      }
      setParsed(sheet);
      setMapping(autoDetectMapping(sheet.headers));
    } catch (e) {
      pushToast({ kind: 'error', title: 'Lecture impossible', body: (e as Error).message });
      setParsed(null);
    } finally {
      setParsing(false);
    }
  };

  const prepared = useMemo(() => (parsed ? buildTasks(parsed.rows, mapping) : []), [parsed, mapping]);

  const doImport = async () => {
    if (!prepared.length || importing) return;
    setImporting(true);
    try {
      for (const t of prepared) {
        const section = sectionForStatus(sections, t.status);
        if (!section) break;
        createTask({
          projectId,
          sectionId: section.id,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          tags: t.tags,
          source: 'form',
        });
      }
      pushToast({
        kind: 'success',
        title: 'Import terminé',
        body: `${prepared.length} tâche${prepared.length > 1 ? 's' : ''} créée${prepared.length > 1 ? 's' : ''}.`,
      });
      onClose();
    } catch (e) {
      pushToast({ kind: 'error', title: "Échec de l'import", body: (e as Error).message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Importer des tâches"
      description="CSV ou Excel (.xlsx / .xls) — une ligne = une tâche"
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost text-sm px-3 py-1.5">
            Annuler
          </button>
          <button
            onClick={doImport}
            disabled={!prepared.length || importing}
            className="btn-primary text-sm px-3.5 py-1.5 disabled:opacity-50"
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Import…
              </>
            ) : (
              <>
                Importer{' '}
                {prepared.length > 0 ? `${prepared.length} tâche${prepared.length > 1 ? 's' : ''}` : ''}
              </>
            )}
          </button>
        </>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = '';
        }}
      />

      {!parsed ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={parsing}
          className="w-full border-2 border-dashed border-atlas-line rounded-xl px-6 py-12 flex flex-col items-center gap-2 hover:border-atlas-amber/60 text-atlas-fg-3 hover:text-atlas-amber-deep transition-colors bg-white/40"
        >
          {parsing ? <Loader2 className="w-7 h-7 animate-spin" /> : <UploadCloud className="w-7 h-7" />}
          <div className="text-sm font-medium">
            {parsing ? 'Lecture du fichier…' : 'Cliquez pour choisir un fichier CSV / Excel'}
          </div>
          <div className="text-2xs">La première ligne doit contenir les en-têtes de colonnes.</div>
        </button>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-sm text-atlas-fg-2">
            <FileSpreadsheet className="w-4 h-4 text-signal-green" />
            <span className="font-medium text-atlas-fg-1">{fileName}</span>
            <span className="text-2xs text-atlas-fg-3">· {parsed.rows.length} lignes</span>
            <button
              onClick={() => {
                setParsed(null);
                setFileName('');
              }}
              className="btn-ghost text-2xs px-2 py-1 ml-auto"
            >
              Changer
            </button>
          </div>

          {/* Mapping colonnes → champs */}
          <div>
            <div className="text-2xs uppercase tracking-[0.16em] font-medium text-atlas-fg-3 mb-2">
              Correspondance des colonnes
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FIELD_LABELS.map((f) => (
                <div key={f.key}>
                  <FieldLabel>
                    {f.label}
                    {f.required && <span className="text-signal-red ml-0.5">*</span>}
                  </FieldLabel>
                  <NativeSelect
                    value={mapping[f.key] ?? ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}
                  >
                    <option value="">— ignorer —</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ))}
            </div>
          </div>

          {/* Aperçu */}
          <div>
            <div className="text-2xs uppercase tracking-[0.16em] font-medium text-atlas-fg-3 mb-2 inline-flex items-center gap-1.5">
              Aperçu <ArrowRight className="w-3 h-3" /> {prepared.length} tâche
              {prepared.length > 1 ? 's' : ''} prêtes
            </div>
            {prepared.length === 0 ? (
              <div className="panel p-4 text-sm text-atlas-fg-3">
                Aucune tâche : vérifiez que la colonne <strong>Titre</strong> est bien mappée.
              </div>
            ) : (
              <div className="panel divide-y divide-black/[0.05] max-h-52 overflow-y-auto">
                {prepared.slice(0, 8).map((t, i) => (
                  <div key={i} className="px-3 py-2 flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate text-atlas-fg-1">{t.title}</span>
                    {t.priority && (
                      <span className="chip text-[9px] bg-black/[0.04] border border-atlas-line text-atlas-fg-3">
                        P{t.priority}
                      </span>
                    )}
                    {t.status && (
                      <span className="chip text-[9px] bg-atlas-amber/15 text-atlas-amber-deep border border-atlas-amber/30">
                        {t.status.replace('_', ' ')}
                      </span>
                    )}
                    {t.dueDate && (
                      <span className="text-2xs text-atlas-fg-3 font-mono">
                        {new Date(t.dueDate).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                  </div>
                ))}
                {prepared.length > 8 && (
                  <div className="px-3 py-2 text-2xs text-atlas-fg-3 italic">
                    + {prepared.length - 8} autres…
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
