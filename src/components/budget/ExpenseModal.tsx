import { useState } from 'react';
import { useApp } from '../../stores/appStore';
import { Modal } from '../ui/Modal';
import { FieldLabel, TextInput, NativeSelect } from '../ui/Field';
import { formatFCFA } from '../../lib/utils';
import { AttachmentsBlock } from './AttachmentsBlock';
import type { Expense, ExpenseStatus, BudgetLine } from '../../types';

const statusOptions: { value: ExpenseStatus; label: string }[] = [
  { value: 'planned', label: 'Prévue' },
  { value: 'committed', label: 'Engagée' },
  { value: 'invoiced', label: 'Facturée' },
  { value: 'paid', label: 'Payée' },
];

interface Props {
  projectId: string;
  /** Pre-selected budget line (null = non ventilée). */
  defaultLineId?: string | null;
  /** Budget lines of the project (flattened, with tree depth) for the picker. */
  lines: { line: BudgetLine; depth: number }[];
  /** When set, the modal edits this expense instead of creating a new one. */
  initial?: Expense;
  onClose: () => void;
}

/** Non-breaking-space indent so nested lines read as a tree in the <select>. */
function indent(depth: number): string {
  return depth > 0 ? '  '.repeat(depth) + '└ ' : '';
}

export function ExpenseModal({ projectId, defaultLineId, lines, initial, onClose }: Props) {
  const createExpense = useApp((s) => s.createExpense);
  const updateExpense = useApp((s) => s.updateExpense);
  // Live expense row (when editing) so the attachments list re-renders after
  // an upload/delete instead of showing the stale `initial` snapshot.
  const liveExpense = useApp((s) => (initial ? s.expenses.find((e) => e.id === initial.id) : undefined));

  const [label, setLabel] = useState(initial?.label ?? '');
  const [amount, setAmount] = useState<string>(initial ? String(initial.amount) : '');
  const [status, setStatus] = useState<ExpenseStatus>(initial?.status ?? 'paid');
  const [expenseDate, setExpenseDate] = useState(
    initial?.expenseDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  );
  const [vendor, setVendor] = useState(initial?.vendor ?? '');
  const [lineId, setLineId] = useState<string>(initial?.lineId ?? defaultLineId ?? '');

  const amountNum = Number(amount) || 0;
  const valid = label.trim().length > 0 && amountNum > 0;

  const submit = () => {
    if (!valid) return;
    const normalizedLineId = lineId || null;
    if (initial) {
      updateExpense(initial.id, {
        label: label.trim(),
        amount: amountNum,
        status,
        expenseDate,
        vendor: vendor.trim() || null,
        lineId: normalizedLineId,
      });
    } else {
      createExpense(projectId, normalizedLineId, {
        label: label.trim(),
        amount: amountNum,
        status,
        expenseDate,
        vendor: vendor.trim() || null,
      });
    }
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'Modifier la dépense' : 'Nouvelle dépense'}
      description="Enregistrez une dépense rattachée à une ligne budgétaire."
      size="md"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost text-sm px-3 py-1.5">
            Annuler
          </button>
          <button disabled={!valid} onClick={submit} className="btn-primary text-sm px-3.5 py-1.5">
            {initial ? 'Enregistrer' : 'Enregistrer la dépense'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>Libellé</FieldLabel>
          <TextInput
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Facture imprimeur, achat matériel…"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel hint="en FCFA">Montant</FieldLabel>
            <TextInput
              type="number"
              min={0}
              step={1000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="250000"
            />
            {amountNum > 0 && (
              <p className="mt-1.5 text-2xs text-atlas-fg-3 font-mono">{formatFCFA(amountNum)}</p>
            )}
          </div>
          <div>
            <FieldLabel>Date</FieldLabel>
            <TextInput type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
          </div>
          <div>
            <FieldLabel>Statut</FieldLabel>
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as ExpenseStatus)}>
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <FieldLabel>Ligne budgétaire</FieldLabel>
            <NativeSelect value={lineId} onChange={(e) => setLineId(e.target.value)}>
              <option value="">— Non ventilée</option>
              {lines.map(({ line, depth }) => (
                <option key={line.id} value={line.id}>
                  {indent(depth)}
                  {line.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div>
          <FieldLabel hint="optionnel">Fournisseur</FieldLabel>
          <TextInput
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="Nom du prestataire / vendeur"
          />
        </div>
        {/* Pièces jointes — only on an existing expense (needs an id). */}
        {initial && (
          <div className="pt-1 border-t border-atlas-line">
            <AttachmentsBlock
              projectId={projectId}
              target={{ kind: 'expense', id: initial.id }}
              attachments={liveExpense?.attachments ?? initial.attachments}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
