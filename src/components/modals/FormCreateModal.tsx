import { useState } from 'react';
import { useApp } from '../../stores/appStore';
import { Modal } from '../ui/Modal';
import { FieldLabel, NativeSelect, TextInput, Textarea } from '../ui/Field';

export function FormCreateModal({ onClose }: { onClose: () => void }) {
  const projects = useApp((s) => s.projects);
  const create = useApp((s) => s.createForm);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');

  const submit = () => {
    if (!name.trim()) return;
    create({
      name: name.trim(),
      description: description.trim() || undefined,
      projectId,
      enabled: true,
      fields: [
        {
          id: 'ff_seed_1',
          type: 'short_text',
          label: 'Votre nom',
          required: true,
          placeholder: 'Prénom Nom',
        },
        { id: 'ff_seed_2', type: 'email', label: 'E-mail', required: true, placeholder: '@…' },
        {
          id: 'ff_seed_3',
          type: 'long_text',
          label: 'Votre demande',
          required: true,
          placeholder: 'Décrivez en quelques lignes…',
        },
      ],
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouveau formulaire d'intake"
      description="Crée un formulaire public · 3 champs par défaut · personnalisable ensuite"
      size="md"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost text-sm px-3 py-1.5">
            Annuler
          </button>
          <button disabled={!name.trim()} onClick={submit} className="btn-primary text-sm px-3.5 py-1.5">
            Créer le form
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <FieldLabel>Nom du form</FieldLabel>
          <TextInput
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Demande de support · Inscription webinar…"
          />
        </div>
        <div>
          <FieldLabel>Description (optionnel)</FieldLabel>
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Visible par les soumissionnaires"
          />
        </div>
        <div>
          <FieldLabel hint="les soumissions y créent des tâches">Projet cible</FieldLabel>
          <NativeSelect value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
    </Modal>
  );
}
