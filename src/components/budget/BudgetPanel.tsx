import { useMemo, useState } from 'react';
import {
  Plus,
  Wallet,
  TrendingDown,
  PiggyBank,
  ChevronRight,
  Edit3,
  Trash2,
  StickyNote,
  Receipt,
} from 'lucide-react';
import { useApp } from '../../stores/appStore';
import { cn, formatFCFA, formatDate } from '../../lib/utils';
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu';
import { BudgetLineModal } from './BudgetLineModal';
import { ExpenseModal } from './ExpenseModal';
import type { BudgetLine, Expense, ExpenseStatus } from '../../types';

const statusCfg: Record<ExpenseStatus, { label: string; cls: string }> = {
  planned: { label: 'Prévu', cls: 'bg-black/[0.04] text-atlas-fg-2 border-atlas-line' },
  committed: { label: 'Engagé', cls: 'bg-signal-blue/15 text-signal-blue border-signal-blue/30' },
  paid: { label: 'Payé', cls: 'bg-signal-green/15 text-signal-green border-signal-green/30' },
};

/** Tailwind classes for the spend progress bar fill, by usage ratio. */
function barColor(pct: number): string {
  if (pct > 100) return 'bg-signal-red';
  if (pct > 90) return 'bg-signal-yellow';
  return 'bg-atlas-sage';
}

function pctText(pct: number): string {
  if (pct > 100) return 'text-signal-red';
  if (pct > 90) return 'text-signal-yellow';
  return 'text-atlas-fg-2';
}

interface ModalState {
  kind: 'line-create' | 'line-edit' | 'expense-create' | 'expense-edit';
  line?: BudgetLine;
  expense?: Expense;
  defaultLineId?: string | null;
}

export function BudgetPanel({ projectId }: { projectId: string }) {
  const allLines = useApp((s) => s.budgetLines);
  const allExpenses = useApp((s) => s.expenses);

  const lines = useMemo(
    () => allLines.filter((l) => l.projectId === projectId).sort((a, b) => a.sortOrder - b.sortOrder),
    [allLines, projectId]
  );
  const expenses = useMemo(
    () => allExpenses.filter((e) => e.projectId === projectId),
    [allExpenses, projectId]
  );

  const [modal, setModal] = useState<ModalState | null>(null);

  // Derived totals — never stored.
  const totalAllocated = lines.reduce((sum, l) => sum + l.allocatedAmount, 0);
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalRemaining = totalAllocated - totalSpent;
  const totalPct = totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0;

  // Spend per line + unallocated ("non ventilées").
  const spentByLine = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const key = e.lineId ?? '__none__';
      map.set(key, (map.get(key) ?? 0) + e.amount);
    }
    return map;
  }, [expenses]);

  const unallocatedSpent = spentByLine.get('__none__') ?? 0;

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi icon={Wallet} label="Budget total" value={formatFCFA(totalAllocated)} tone="neutral" />
        <Kpi icon={TrendingDown} label="Dépensé" value={formatFCFA(totalSpent)} tone="spent" />
        <Kpi
          icon={PiggyBank}
          label="Reste"
          value={formatFCFA(totalRemaining)}
          tone={totalRemaining < 0 ? 'over' : 'ok'}
        />
      </div>

      <div className="panel p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
            Consommation du budget
          </span>
          <span className={cn('text-sm font-medium font-mono tabular-nums', pctText(totalPct))}>
            {Math.round(totalPct)}%
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-black/[0.06] overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', barColor(totalPct))}
            style={{ width: `${Math.min(100, totalPct)}%` }}
          />
        </div>
      </div>

      {/* Lines */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-atlas-fg-1">
          Lignes budgétaires <span className="text-atlas-fg-3 font-mono">({lines.length})</span>
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModal({ kind: 'expense-create', defaultLineId: null })}
            className="btn-secondary text-sm px-3 py-1.5"
          >
            <Receipt className="w-3.5 h-3.5" /> Dépense
          </button>
          <button
            onClick={() => setModal({ kind: 'line-create' })}
            className="btn-primary text-sm px-3 py-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Ligne budgétaire
          </button>
        </div>
      </div>

      {lines.length === 0 && unallocatedSpent === 0 ? (
        <div className="panel p-10 text-center">
          <Wallet className="w-8 h-8 mx-auto mb-2 text-atlas-fg-3 opacity-40" />
          <p className="text-sm text-atlas-fg-3">
            Aucune ligne budgétaire pour ce projet.
            <br />
            <button
              onClick={() => setModal({ kind: 'line-create' })}
              className="text-atlas-amber-deep hover:underline mt-2"
            >
              Créer la première ligne
            </button>
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {lines.map((line) => (
            <BudgetLineRow
              key={line.id}
              line={line}
              spent={spentByLine.get(line.id) ?? 0}
              expenses={expenses.filter((e) => e.lineId === line.id)}
              onEdit={() => setModal({ kind: 'line-edit', line })}
              onAddExpense={() => setModal({ kind: 'expense-create', defaultLineId: line.id })}
              onEditExpense={(expense) => setModal({ kind: 'expense-edit', expense })}
            />
          ))}

          {/* Unallocated expenses bucket — shown only when present. */}
          {unallocatedSpent > 0 && (
            <UnallocatedRow
              spent={unallocatedSpent}
              expenses={expenses.filter((e) => !e.lineId)}
              onEditExpense={(expense) => setModal({ kind: 'expense-edit', expense })}
            />
          )}
        </div>
      )}

      {/* Totals row */}
      {(lines.length > 0 || unallocatedSpent > 0) && (
        <div className="panel p-4 grid grid-cols-3 gap-3 text-center">
          <TotalCell label="Alloué" value={formatFCFA(totalAllocated)} />
          <TotalCell label="Dépensé" value={formatFCFA(totalSpent)} />
          <TotalCell
            label="Reste"
            value={formatFCFA(totalRemaining)}
            tone={totalRemaining < 0 ? 'over' : 'ok'}
          />
        </div>
      )}

      {/* Modals */}
      {(modal?.kind === 'line-create' || modal?.kind === 'line-edit') && (
        <BudgetLineModal projectId={projectId} initial={modal.line} onClose={() => setModal(null)} />
      )}
      {(modal?.kind === 'expense-create' || modal?.kind === 'expense-edit') && (
        <ExpenseModal
          projectId={projectId}
          lines={lines}
          defaultLineId={modal.defaultLineId}
          initial={modal.expense}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone: 'neutral' | 'spent' | 'ok' | 'over';
}) {
  const toneCls =
    tone === 'over'
      ? 'text-signal-red'
      : tone === 'ok'
        ? 'text-atlas-sage'
        : tone === 'spent'
          ? 'text-atlas-fg-1'
          : 'text-atlas-fg-1';
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className={cn('mt-1.5 text-xl font-display font-medium tabular-nums', toneCls)}>{value}</div>
    </div>
  );
}

function TotalCell({ label, value, tone }: { label: string; value: string; tone?: 'over' | 'ok' }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">{label}</div>
      <div
        className={cn(
          'mt-0.5 text-sm font-medium tabular-nums',
          tone === 'over' ? 'text-signal-red' : tone === 'ok' ? 'text-atlas-sage' : 'text-atlas-fg-1'
        )}
      >
        {value}
      </div>
    </div>
  );
}

function BudgetLineRow({
  line,
  spent,
  expenses,
  onEdit,
  onAddExpense,
  onEditExpense,
}: {
  line: BudgetLine;
  spent: number;
  expenses: Expense[];
  onEdit: () => void;
  onAddExpense: () => void;
  onEditExpense: (e: Expense) => void;
}) {
  const [open, setOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const deleteBudgetLine = useApp((s) => s.deleteBudgetLine);
  const addBudgetNote = useApp((s) => s.addBudgetNote);

  const remaining = line.allocatedAmount - spent;
  const pct = line.allocatedAmount > 0 ? (spent / line.allocatedAmount) * 100 : spent > 0 ? 100 : 0;

  const submitNote = () => {
    if (!noteDraft.trim()) return;
    addBudgetNote({ kind: 'line', id: line.id }, noteDraft);
    setNoteDraft('');
  };

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-atlas-fg-3 hover:text-atlas-fg-1 shrink-0"
          aria-label={open ? 'Replier' : 'Déplier'}
        >
          <ChevronRight className={cn('w-4 h-4 transition-transform', open && 'rotate-90')} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-atlas-fg-1 truncate">{line.name}</span>
            <span className="text-2xs font-mono text-atlas-fg-3">{expenses.length} dép.</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', barColor(pct))}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>
        <div className="hidden sm:grid grid-cols-3 gap-4 text-right shrink-0 w-[360px]">
          <Cell label="Alloué" value={formatFCFA(line.allocatedAmount)} />
          <Cell label="Dépensé" value={formatFCFA(spent)} />
          <Cell label="Reste" value={formatFCFA(remaining)} tone={remaining < 0 ? 'over' : 'ok'} />
        </div>
        <span
          className={cn('text-sm font-medium font-mono tabular-nums shrink-0 w-12 text-right', pctText(pct))}
        >
          {Math.round(pct)}%
        </span>
        <Menu
          trigger={
            <button className="btn-ghost !p-1.5 shrink-0" aria-label="Actions">
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          }
          width={180}
        >
          {(close) => (
            <>
              <MenuItem
                icon={Receipt}
                onClick={() => {
                  close();
                  onAddExpense();
                }}
              >
                Ajouter une dépense
              </MenuItem>
              <MenuItem
                icon={Edit3}
                onClick={() => {
                  close();
                  onEdit();
                }}
              >
                Modifier la ligne
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                danger
                icon={Trash2}
                onClick={() => {
                  close();
                  deleteBudgetLine(line.id);
                }}
              >
                Supprimer
              </MenuItem>
            </>
          )}
        </Menu>
      </div>

      {open && (
        <div className="border-t border-black/[0.05] bg-black/[0.015] px-4 py-3 space-y-4">
          {/* Expenses table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">Dépenses</span>
              <button
                onClick={onAddExpense}
                className="text-2xs text-atlas-fg-3 hover:text-atlas-fg-1 inline-flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Dépense
              </button>
            </div>
            {expenses.length === 0 ? (
              <p className="text-2xs text-atlas-fg-3 italic py-2">Aucune dépense sur cette ligne.</p>
            ) : (
              <ExpenseTable expenses={expenses} onEditExpense={onEditExpense} />
            )}
          </div>

          {/* Notes */}
          <NotesBlock notes={line.notes} draft={noteDraft} setDraft={setNoteDraft} onSubmit={submitNote} />
        </div>
      )}
    </div>
  );
}

function UnallocatedRow({
  spent,
  expenses,
  onEditExpense,
}: {
  spent: number;
  expenses: Expense[];
  onEditExpense: (e: Expense) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel overflow-hidden border-dashed">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-atlas-fg-3 hover:text-atlas-fg-1 shrink-0"
          aria-label={open ? 'Replier' : 'Déplier'}
        >
          <ChevronRight className={cn('w-4 h-4 transition-transform', open && 'rotate-90')} />
        </button>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-atlas-fg-2 italic">Dépenses non ventilées</span>
          <span className="ml-2 text-2xs font-mono text-atlas-fg-3">{expenses.length} dép.</span>
        </div>
        <span className="text-sm font-medium tabular-nums text-atlas-fg-1 shrink-0">{formatFCFA(spent)}</span>
      </div>
      {open && (
        <div className="border-t border-black/[0.05] bg-black/[0.015] px-4 py-3">
          <ExpenseTable expenses={expenses} onEditExpense={onEditExpense} />
        </div>
      )}
    </div>
  );
}

function ExpenseTable({
  expenses,
  onEditExpense,
}: {
  expenses: Expense[];
  onEditExpense: (e: Expense) => void;
}) {
  const deleteExpense = useApp((s) => s.deleteExpense);
  const sorted = [...expenses].sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
  return (
    <div className="rounded-lg overflow-hidden border border-atlas-line bg-white">
      <div className="grid grid-cols-[90px_1fr_120px_90px_40px] px-3 py-2 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium bg-black/[0.02]">
        <span>Date</span>
        <span>Libellé</span>
        <span className="text-right">Montant</span>
        <span className="text-center">Statut</span>
        <span></span>
      </div>
      <div className="divide-y divide-atlas-line">
        {sorted.map((e) => {
          const sc = statusCfg[e.status];
          return (
            <div
              key={e.id}
              className="grid grid-cols-[90px_1fr_120px_90px_40px] items-center px-3 py-2 hover:bg-black/[0.02]"
            >
              <span className="text-2xs font-mono text-atlas-fg-3">{formatDate(e.expenseDate)}</span>
              <div className="min-w-0">
                <div className="text-sm text-atlas-fg-1 truncate">{e.label}</div>
                {e.vendor && <div className="text-2xs text-atlas-fg-3 truncate">{e.vendor}</div>}
              </div>
              <span className="text-sm font-medium tabular-nums text-atlas-fg-1 text-right">
                {formatFCFA(e.amount)}
              </span>
              <span className="flex justify-center">
                <span
                  className={cn(
                    'inline-flex items-center border rounded-md font-medium uppercase tracking-wider text-[9px] px-1.5 py-0.5',
                    sc.cls
                  )}
                >
                  {sc.label}
                </span>
              </span>
              <Menu
                trigger={
                  <button className="btn-ghost !p-1 justify-self-end" aria-label="Actions dépense">
                    <Edit3 className="w-3 h-3" />
                  </button>
                }
                width={160}
              >
                {(close) => (
                  <>
                    <MenuItem
                      icon={Edit3}
                      onClick={() => {
                        close();
                        onEditExpense(e);
                      }}
                    >
                      Modifier
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem
                      danger
                      icon={Trash2}
                      onClick={() => {
                        close();
                        deleteExpense(e.id);
                      }}
                    >
                      Supprimer
                    </MenuItem>
                  </>
                )}
              </Menu>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NotesBlock({
  notes,
  draft,
  setDraft,
  onSubmit,
}: {
  notes: { id: string; text: string; at: string }[];
  draft: string;
  setDraft: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium mb-2 inline-flex items-center gap-1.5">
        <StickyNote className="w-3.5 h-3.5" /> Notes
      </div>
      {notes.length > 0 && (
        <ul className="space-y-1.5 mb-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className="text-sm text-atlas-fg-2 bg-white border border-atlas-line rounded-lg px-3 py-2"
            >
              <p className="whitespace-pre-wrap">{n.text}</p>
              <span className="block mt-1 text-2xs text-atlas-fg-3 font-mono">
                {new Date(n.at).toLocaleString('fr-FR')}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
          }}
          placeholder="Ajouter une note…"
          className="flex-1 h-9 px-3 rounded-lg bg-white border border-atlas-line text-sm text-atlas-fg-1 placeholder:text-atlas-fg-3 outline-none focus:border-atlas-amber focus:ring-2 focus:ring-atlas-amber/20 transition-colors"
        />
        <button onClick={onSubmit} disabled={!draft.trim()} className="btn-secondary text-xs px-3 py-1.5">
          <Plus className="w-3 h-3" /> Note
        </button>
      </div>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'over' | 'ok' }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">{label}</div>
      <div
        className={cn(
          'text-xs font-medium tabular-nums',
          tone === 'over' ? 'text-signal-red' : tone === 'ok' ? 'text-atlas-sage' : 'text-atlas-fg-1'
        )}
      >
        {value}
      </div>
    </div>
  );
}
