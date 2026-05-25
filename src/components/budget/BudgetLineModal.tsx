import { useState } from 'react';
import { useApp } from '../../stores/appStore';
import { Modal } from '../ui/Modal';
import { FieldLabel, TextInput } from '../ui/Field';
import { formatFCFA } from '../../lib/utils';
import type { BudgetLine } from '../../types';

interface Props {
  projectId: string;
  /** When set, the modal edits this line instead of creating a new one. */
  initial?: BudgetLine;
  /** When set (and not editing), the new line is created as a sub-line of this parent. */
  parentLineId?: string | null;
  /** Display name of the parent line, for the modal description. */
  parentName?: string;
  onClose: () => void;
}

export function BudgetLineModal({ projectId, initial, parentLineId, parentName, onClose }: Props) {
  const createBudgetLine = useApp((s) => s.createBudgetLine);
  const updateBudgetLine = useApp((s) => s.updateBudgetLine);

  const [name, setName] = useState(initial?.name ?? '');
  const [allocated, setAllocated] = useState<string>(initial ? String(initial.allocatedAmount) : '');

  const allocatedNum = Number(allocated) || 0;
  const valid = name.trim().length > 0;
  const isSub = !initial && (parentLineId ?? null) !== null;

  const submit = () => {
    if (!valid) return;
    if (initial) {
      updateBudgetLine(initial.id, { name: name.trim(), allocatedAmount: allocatedNum });
    } else {
      createBudgetLine(projectId, {
        name: name.trim(),
        allocatedAmount: allocatedNum,
        parentLineId: parentLineId ?? null,
      });
    }
    onClose();
  };

  const title = initial
    ? 'Modifier la ligne budgétaire'
    : isSub
      ? 'Nouvelle sous-ligne'
      : 'Nouvelle ligne budgétaire';

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={
        isSub && parentName
          ? `Sous-ligne de « ${parentName} » — son budget remonte dans le total parent.`
          : 'Définissez un poste de dépense et son budget alloué (FCFA).'
      }
      size="md"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost text-sm px-3 py-1.5">
            Annuler
          </button>
          <button disabled={!valid} onClick={submit} className="btn-primary text-sm px-3.5 py-1.5">
            {initial ? 'Enregistrer' : 'Créer'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>Nom de la ligne</FieldLabel>
          <TextInput
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Marketing, Logistique, Salaires…"
          />
        </div>
        <div>
          <FieldLabel hint="en FCFA, sans décimales">Budget alloué</FieldLabel>
          <TextInput
            type="number"
            min={0}
            step={1000}
            value={allocated}
            onChange={(e) => setAllocated(e.target.value)}
            placeholder="1500000"
          />
          {allocatedNum > 0 && (
            <p className="mt-1.5 text-2xs text-atlas-fg-3 font-mono">{formatFCFA(allocatedNum)}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
