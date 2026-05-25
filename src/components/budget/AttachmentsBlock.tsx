import { useRef, useState } from 'react';
import { Paperclip, Download, Trash2, Loader2 } from 'lucide-react';
import { useApp } from '../../stores/appStore';
import { uploadBudgetFile, signedBudgetUrl, removeBudgetFile } from '../../lib/budgetStorage';
import type { BudgetAttachment } from '../../types';

/** Human-readable file size (1 234 → "1.2 Ko"). */
function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

interface Props {
  projectId: string;
  target: { kind: 'line' | 'expense'; id: string };
  attachments: BudgetAttachment[];
}

/**
 * Pièces jointes for a budget line or expense. Uploads to the private
 * `cj-budget` Storage bucket, then records the metadata on the entity via
 * the store. Download mints a fresh signed URL on click.
 */
export function AttachmentsBlock({ projectId, target, attachments }: Props) {
  const addBudgetAttachment = useApp((s) => s.addBudgetAttachment);
  const removeBudgetAttachment = useApp((s) => s.removeBudgetAttachment);
  const pushToast = useApp((s) => s.pushToast);

  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const att = await uploadBudgetFile({
        projectId,
        kind: target.kind,
        entityId: target.id,
        file,
      });
      addBudgetAttachment(target, att);
      pushToast({ kind: 'success', title: 'Pièce jointe ajoutée', body: file.name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      pushToast({ kind: 'error', title: 'Échec upload', body: msg });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDownload = async (att: BudgetAttachment) => {
    setBusyId(att.id);
    try {
      const url = await signedBudgetUrl(att.path);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        pushToast({ kind: 'error', title: 'Téléchargement impossible', body: att.name });
      }
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (att: BudgetAttachment) => {
    setBusyId(att.id);
    try {
      await removeBudgetFile(att.path);
      removeBudgetAttachment(target, att.id);
      pushToast({ kind: 'info', title: 'Pièce jointe supprimée', body: att.name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      pushToast({ kind: 'error', title: 'Échec suppression', body: msg });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium mb-2 inline-flex items-center gap-1.5">
        <Paperclip className="w-3.5 h-3.5" /> Pièces jointes
      </div>
      {attachments.length > 0 && (
        <ul className="space-y-1.5 mb-2">
          {attachments.map((att) => {
            const busy = busyId === att.id;
            const size = formatSize(att.size);
            return (
              <li
                key={att.id}
                className="flex items-center gap-2 bg-white border border-atlas-line rounded-lg px-3 py-2"
              >
                <Paperclip className="w-3.5 h-3.5 text-atlas-fg-3 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-atlas-fg-1 truncate">{att.name}</span>
                  {size && <span className="block text-2xs text-atlas-fg-3 font-mono">{size}</span>}
                </span>
                <button
                  onClick={() => onDownload(att)}
                  disabled={busy}
                  className="btn-ghost !p-1.5 shrink-0 disabled:opacity-50"
                  aria-label="Télécharger"
                  title="Télécharger"
                >
                  {busy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={() => onDelete(att)}
                  disabled={busy}
                  className="btn-ghost !p-1.5 shrink-0 text-signal-red disabled:opacity-50"
                  aria-label="Supprimer"
                  title="Supprimer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => void onPick(e.target.files?.[0])}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-60"
      >
        {uploading ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" /> Envoi…
          </>
        ) : (
          <>
            <Paperclip className="w-3 h-3" /> Pièce jointe
          </>
        )}
      </button>
    </div>
  );
}
