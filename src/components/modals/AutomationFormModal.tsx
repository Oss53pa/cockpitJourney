import { useState } from 'react';
import { useApp } from '../../stores/appStore';
import { Modal } from '../ui/Modal';
import { FieldLabel, NativeSelect, TextInput, Textarea } from '../ui/Field';
import type { AutomationRule } from '../../stores/appStore';

const triggers = [
  { value: 'status_changed', label: 'Statut changé' },
  { value: 'task_created', label: 'Tâche créée' },
  { value: 'due_overdue', label: 'Échéance dépassée' },
  { value: 'recurrence', label: 'Récurrence (cron)' },
] as const;

const actionsCatalog = [
  { kind: 'whatsapp', label: 'Envoyer WhatsApp' },
  { kind: 'push', label: 'Notification push' },
  { kind: 'email', label: 'Envoyer email' },
  { kind: 'tag', label: 'Ajouter un tag' },
  { kind: 'subtasks', label: 'Créer des sous-tâches' },
  { kind: 'report', label: 'Générer un rapport' },
] as const;

export function AutomationFormModal({ onClose }: { onClose: () => void }) {
  const create = useApp((s) => s.createAutomation);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [triggerKey, setTriggerKey] = useState<AutomationRule['triggerKey']>('status_changed');
  const [conditions, setConditions] = useState<number>(1);
  const [selected, setSelected] = useState<Record<string, boolean>>({ push: true });

  const submit = () => {
    if (!name.trim()) return;
    const actions = actionsCatalog
      .filter((a) => selected[a.kind])
      .map((a) => ({ kind: a.kind, label: a.label }));
    if (!actions.length) return;
    create({ name: name.trim(), desc: desc.trim(), enabled: true, triggerKey, conditions, actions });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouvelle automation"
      description="Trigger → Conditions → Actions"
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost text-sm px-3 py-1.5">
            Annuler
          </button>
          <button onClick={submit} disabled={!name.trim()} className="btn-primary text-sm px-3.5 py-1.5">
            Activer la règle
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>Nom de la règle</FieldLabel>
          <TextInput
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Approbation hebdomadaire client X"
          />
        </div>
        <div>
          <FieldLabel>Description</FieldLabel>
          <Textarea
            rows={2}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Quand…, alors…"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Déclencheur (Trigger)</FieldLabel>
            <NativeSelect value={triggerKey} onChange={(e) => setTriggerKey(e.target.value as any)}>
              {triggers.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <FieldLabel hint="combinables ET/OU">Nb. de conditions</FieldLabel>
            <TextInput
              type="number"
              min={0}
              max={5}
              value={conditions}
              onChange={(e) => setConditions(Number(e.target.value))}
            />
          </div>
        </div>
        <div>
          <FieldLabel>Actions à exécuter</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {actionsCatalog.map((a) => (
              <label
                key={a.kind}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-atlas-line bg-white cursor-pointer hover:border-atlas-line-2"
              >
                <input
                  type="checkbox"
                  checked={!!selected[a.kind]}
                  onChange={(e) => setSelected({ ...selected, [a.kind]: e.target.checked })}
                  className="accent-atlas-amber"
                />
                <span className="text-sm text-atlas-fg-1">{a.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
