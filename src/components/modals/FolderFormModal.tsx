/**
 * FolderFormModal — create / edit a project folder (category).
 *
 * Folders group projects in the sidebar (e.g. "Personnel", "Entreprise",
 * "Famille", "Cosmos Group"). They have a name, color, icon, and an
 * ordered list of project ids.
 */
import { useState } from 'react';
import { useApp } from '../../stores/appStore';
import { Modal } from '../ui/Modal';
import { FieldLabel, NativeSelect, TextInput } from '../ui/Field';
import { cn } from '../../lib/utils';
import type { Folder, FolderSphere } from '../../types';

const COLORS = [
  '#6E8B58', // sage-deep
  '#8AA6C4', // soft blue
  '#A290C2', // muted violet
  '#7AC388', // green
  '#D58FA7', // soft pink
  '#D77564', // warm coral
  '#D6B868', // amber
  '#95B07D', // sage-light
];

const ICONS: { key: string; label: string }[] = [
  { key: 'briefcase', label: 'Briefcase (Personnel / Pro)' },
  { key: 'building-2', label: 'Building (Entreprise)' },
  { key: 'home', label: 'Home (Famille)' },
  { key: 'folder', label: 'Folder (Générique)' },
  { key: 'rocket', label: 'Rocket (Lancement)' },
  { key: 'compass', label: 'Compass (Stratégie)' },
  { key: 'graduation-cap', label: 'Cap (Formation)' },
  { key: 'heart', label: 'Heart (Perso / Santé)' },
];

interface Props {
  onClose: () => void;
  /** Either an existing folder (edit mode) OR a payload to pre-fill
   *  fields when creating from a specific sphere section. */
  initial?: Folder | { sphere?: FolderSphere };
}

function isExistingFolder(x: Props['initial']): x is Folder {
  return !!x && typeof (x as Folder).id === 'string';
}

export function FolderFormModal({ onClose, initial }: Props) {
  const createFolder = useApp((s) => s.createFolder);
  const updateFolder = useApp((s) => s.updateFolder);
  const deleteFolder = useApp((s) => s.deleteFolder);
  const moveFolderToSphere = useApp((s) => s.moveFolderToSphere);
  const folders = useApp((s) => s.folders);
  const projects = useApp((s) => s.projects);
  const editingFolder = isExistingFolder(initial) ? initial : undefined;
  const isEdit = !!editingFolder;

  const [name, setName] = useState(editingFolder?.name ?? '');
  const [color, setColor] = useState(editingFolder?.color ?? COLORS[0]);
  const [icon, setIcon] = useState(editingFolder?.icon ?? ICONS[0].key);
  const [sphere, setSphere] = useState<FolderSphere>(
    editingFolder?.sphere ?? (initial as { sphere?: FolderSphere } | undefined)?.sphere ?? 'personnel'
  );

  // For the delete confirmation: count projects that would be orphaned.
  const projectsInFolder = editingFolder ? projects.filter((p) => p.folderId === editingFolder.id).length : 0;

  const submit = () => {
    if (!name.trim()) return;
    if (isEdit && editingFolder) {
      updateFolder(editingFolder.id, { name: name.trim(), color, icon });
      // If the user changed the sphere while editing, sync it through
      // the dedicated action so the order rank gets recomputed.
      if ((editingFolder.sphere ?? 'personnel') !== sphere) {
        moveFolderToSphere(editingFolder.id, sphere);
      }
    } else {
      createFolder({ name: name.trim(), color, icon, sphere });
    }
    onClose();
  };

  const handleDelete = () => {
    if (!editingFolder) return;
    const msg =
      projectsInFolder > 0
        ? `Supprimer le dossier "${editingFolder.name}" ? Les ${projectsInFolder} projet${
            projectsInFolder > 1 ? 's' : ''
          } qu'il contient ne ${
            projectsInFolder > 1 ? 'seront pas supprimés' : 'sera pas supprimé'
          }, ${projectsInFolder > 1 ? 'ils' : 'il'} ${
            projectsInFolder > 1 ? 'deviendront' : 'deviendra'
          } sans dossier.`
        : `Supprimer le dossier "${editingFolder.name}" ?`;
    if (!confirm(msg)) return;
    deleteFolder(editingFolder.id);
    onClose();
  };

  // Don't allow deleting the last folder — UX guard, since projects need
  // at least one folder to be created in.
  const canDelete = isEdit && folders.length > 1;

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Modifier le dossier' : 'Nouveau dossier'}
      description={
        isEdit
          ? 'Regroupez vos projets par contexte (perso, pro, famille…).'
          : 'Créez une nouvelle catégorie pour regrouper vos projets.'
      }
      size="md"
      footer={
        <>
          {canDelete && (
            <button
              onClick={handleDelete}
              className="btn-ghost text-xs text-signal-red hover:bg-signal-red/10 mr-auto"
            >
              Supprimer
            </button>
          )}
          <button onClick={onClose} className="btn-ghost text-sm px-3 py-1.5">
            Annuler
          </button>
          <button disabled={!name.trim()} onClick={submit} className="btn-primary text-sm px-3.5 py-1.5">
            {isEdit ? 'Enregistrer' : 'Créer le dossier'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>Sphère</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {(['personnel', 'professionnel'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSphere(s)}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium border transition',
                  sphere === s
                    ? 'border-atlas-amber-deep bg-atlas-amber/15 text-atlas-amber-deep shadow-amber-deep'
                    : 'border-atlas-line text-atlas-fg-2 hover:border-atlas-line/80 hover:bg-black/[0.03]'
                )}
              >
                {s === 'personnel' ? 'Personnel' : 'Professionnel'}
              </button>
            ))}
          </div>
          <p className="text-2xs text-atlas-fg-3 mt-1.5">
            La sphère détermine sous quelle grande famille le dossier apparaît dans la sidebar.
          </p>
        </div>
        <div>
          <FieldLabel>Nom du dossier</FieldLabel>
          <TextInput
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex : Personnel, Entreprise, Famille, Cosmos Group…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) submit();
            }}
          />
        </div>
        <div>
          <FieldLabel>Couleur</FieldLabel>
          <div className="flex items-center gap-2 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Couleur ${c}`}
                className={`w-7 h-7 rounded-lg border-2 transition-transform ${
                  color === c ? 'border-atlas-fg-1 scale-110' : 'border-transparent hover:scale-105'
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>Icône</FieldLabel>
          <NativeSelect value={icon} onChange={(e) => setIcon(e.target.value)}>
            {ICONS.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
    </Modal>
  );
}
