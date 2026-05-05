import { useState } from 'react';
import { useApp } from '../../stores/appStore';
import { Modal } from '../ui/Modal';
import { FieldLabel, NativeSelect, TextInput, Textarea } from '../ui/Field';

const COLORS = ['#95B07D', '#8AA6C4', '#A290C2', '#7AC388', '#D58FA7', '#D77564', '#D6B868', '#6E8B58'];
const ICONS = ['Compass', 'FileText', 'Wallet', 'Sparkles', 'TrendingUp', 'Sunrise', 'BookOpen'];

export function ProjectFormModal({ onClose }: { onClose: () => void }) {
  const folders = useApp((s) => s.folders);
  const createProject = useApp((s) => s.createProject);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [folderId, setFolderId] = useState(folders[0]?.id ?? '');
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState(ICONS[0]);
  const [endDate, setEndDate] = useState('');

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouveau projet"
      description="Définit la structure : 4 sections par défaut, 7 onglets, dashboards et goals."
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost text-sm px-3 py-1.5">
            Annuler
          </button>
          <button
            disabled={!name.trim()}
            onClick={() => {
              createProject({
                name: name.trim(),
                description: description.trim() || undefined,
                folderId,
                color,
                icon,
                endDate: endDate || undefined,
              });
              onClose();
            }}
            className="btn-primary text-sm px-3.5 py-1.5"
          >
            Créer le projet
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>Nom du projet</FieldLabel>
          <TextInput
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Lancement campagne T3…"
          />
        </div>
        <div>
          <FieldLabel>Description</FieldLabel>
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Objectif, périmètre, contraintes…"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Dossier</FieldLabel>
            <NativeSelect value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <FieldLabel>Échéance cible</FieldLabel>
            <TextInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div>
          <FieldLabel>Couleur</FieldLabel>
          <div className="flex items-center gap-2 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-lg border-2 transition-transform ${color === c ? 'border-atlas-fg-1 scale-110' : 'border-transparent hover:scale-105'}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>Icône</FieldLabel>
          <NativeSelect value={icon} onChange={(e) => setIcon(e.target.value)}>
            {ICONS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
    </Modal>
  );
}
