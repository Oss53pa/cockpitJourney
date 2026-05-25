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
  Download,
  Filter,
} from 'lucide-react';
import { useApp } from '../../stores/appStore';
import { cn, formatFCFA, formatDate } from '../../lib/utils';
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu';
import { NativeSelect, TextInput } from '../ui/Field';
import { BudgetLineModal } from './BudgetLineModal';
import { ExpenseModal } from './ExpenseModal';
import { AttachmentsBlock } from './AttachmentsBlock';
import type { BudgetLine, Expense, ExpenseStatus } from '../../types';

type StatusFilter = 'all' | ExpenseStatus;

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

  // Expense filters — affect ONLY the expense tables shown in expanded
  // rows (and the "filtré" summary). Budget rollups below stay on ALL
  // expenses (the source of truth).
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const filtersActive = statusFilter !== 'all' || dateFrom !== '' || dateTo !== '';

  const matchesFilter = (e: Expense): boolean => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    const d = e.expenseDate.slice(0, 10);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  };

  const filteredExpenses = useMemo(
    () => expenses.filter(matchesFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses, statusFilter, dateFrom, dateTo]
  );
  const filteredCount = filteredExpenses.length;
  const filteredSum = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Derived totals — never stored. Always computed on ALL expenses.
  const totalAllocated = lines.reduce((sum, l) => sum + l.allocatedAmount, 0);
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalRemaining = totalAllocated - totalSpent;
  const totalPct = totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0;

  // Spend per line + unallocated ("non ventilées") — on ALL expenses.
  const spentByLine = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const key = e.lineId ?? '__none__';
      map.set(key, (map.get(key) ?? 0) + e.amount);
    }
    return map;
  }, [expenses]);

  const unallocatedSpent = spentByLine.get('__none__') ?? 0;

  const project = useApp((s) => s.projects.find((p) => p.id === projectId));
  const onExport = () => {
    const csv = buildBudgetCsv(lines, expenses, spentByLine);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-${project?.slug || projectId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

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
          <button onClick={onExport} className="btn-ghost text-sm px-3 py-1.5">
            <Download className="w-3.5 h-3.5" /> Exporter
          </button>
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

      {/* Filter bar — affects only the expense tables shown when a line is
          expanded, not the budget rollups. */}
      <div className="panel p-3 flex flex-wrap items-end gap-3">
        <div className="inline-flex items-center gap-1.5 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium self-center">
          <Filter className="w-3.5 h-3.5" /> Filtres
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">Statut</span>
          <NativeSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-9 w-36"
          >
            <option value="all">Tous</option>
            <option value="planned">Prévu</option>
            <option value="committed">Engagé</option>
            <option value="paid">Payé</option>
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">Du</span>
          <TextInput
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 w-40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">Au</span>
          <TextInput
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 w-40"
          />
        </label>
        {filtersActive && (
          <button
            onClick={() => {
              setStatusFilter('all');
              setDateFrom('');
              setDateTo('');
            }}
            className="btn-ghost text-xs px-2.5 py-1.5 self-center"
          >
            Réinitialiser
          </button>
        )}
        {filtersActive && (
          <span className="ml-auto self-center text-2xs text-atlas-fg-2 font-mono">
            filtré : {filteredCount} dépense{filteredCount > 1 ? 's' : ''} · {formatFCFA(filteredSum)}
          </span>
        )}
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
              projectId={projectId}
              line={line}
              spent={spentByLine.get(line.id) ?? 0}
              expenseCount={expenses.filter((e) => e.lineId === line.id).length}
              expenses={filteredExpenses.filter((e) => e.lineId === line.id)}
              onEdit={() => setModal({ kind: 'line-edit', line })}
              onAddExpense={() => setModal({ kind: 'expense-create', defaultLineId: line.id })}
              onEditExpense={(expense) => setModal({ kind: 'expense-edit', expense })}
            />
          ))}

          {/* Unallocated expenses bucket — shown only when present. */}
          {unallocatedSpent > 0 && (
            <UnallocatedRow
              spent={unallocatedSpent}
              expenseCount={expenses.filter((e) => !e.lineId).length}
              expenses={filteredExpenses.filter((e) => !e.lineId)}
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
  projectId,
  line,
  spent,
  expenseCount,
  expenses,
  onEdit,
  onAddExpense,
  onEditExpense,
}: {
  projectId: string;
  line: BudgetLine;
  spent: number;
  /** Total expenses on this line (unfiltered) — for the count badge. */
  expenseCount: number;
  /** Filtered expenses shown in the expanded table. */
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
            <span className="text-2xs font-mono text-atlas-fg-3">{expenseCount} dép.</span>
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
              <p className="text-2xs text-atlas-fg-3 italic py-2">
                {expenseCount === 0
                  ? 'Aucune dépense sur cette ligne.'
                  : 'Aucune dépense ne correspond aux filtres.'}
              </p>
            ) : (
              <ExpenseTable expenses={expenses} onEditExpense={onEditExpense} />
            )}
          </div>

          {/* Notes */}
          <NotesBlock notes={line.notes} draft={noteDraft} setDraft={setNoteDraft} onSubmit={submitNote} />

          {/* Pièces jointes */}
          <AttachmentsBlock
            projectId={projectId}
            target={{ kind: 'line', id: line.id }}
            attachments={line.attachments}
          />
        </div>
      )}
    </div>
  );
}

function UnallocatedRow({
  spent,
  expenseCount,
  expenses,
  onEditExpense,
}: {
  spent: number;
  /** Total unallocated expenses (unfiltered) — for the count badge. */
  expenseCount: number;
  /** Filtered unallocated expenses shown in the expanded table. */
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
          <span className="ml-2 text-2xs font-mono text-atlas-fg-3">{expenseCount} dép.</span>
        </div>
        <span className="text-sm font-medium tabular-nums text-atlas-fg-1 shrink-0">{formatFCFA(spent)}</span>
      </div>
      {open && (
        <div className="border-t border-black/[0.05] bg-black/[0.015] px-4 py-3">
          {expenses.length === 0 ? (
            <p className="text-2xs text-atlas-fg-3 italic py-2">
              {expenseCount === 0
                ? 'Aucune dépense non ventilée.'
                : 'Aucune dépense ne correspond aux filtres.'}
            </p>
          ) : (
            <ExpenseTable expenses={expenses} onEditExpense={onEditExpense} />
          )}
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

/** Quote a single CSV cell — wrap in double-quotes and escape inner quotes. */
function csvCell(value: string | number): string {
  const s = String(value ?? '');
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Build the project budget CSV (two sections: lignes, then dépenses).
 * Numbers are written raw (no thousands separator) so Excel parses them as
 * numbers; the caller prepends a UTF-8 BOM so accents render in Excel.
 */
function buildBudgetCsv(lines: BudgetLine[], expenses: Expense[], spentByLine: Map<string, number>): string {
  const rows: string[] = [];
  const lineNameById = new Map(lines.map((l) => [l.id, l.name]));

  rows.push(csvCell('Lignes budgétaires'));
  rows.push(['Nom', 'Alloué', 'Dépensé', 'Reste'].map(csvCell).join(';'));
  for (const l of lines) {
    const spent = spentByLine.get(l.id) ?? 0;
    rows.push([l.name, l.allocatedAmount, spent, l.allocatedAmount - spent].map(csvCell).join(';'));
  }

  rows.push('');
  rows.push(csvCell('Dépenses'));
  rows.push(['Date', 'Ligne', 'Libellé', 'Montant', 'Statut', 'Fournisseur'].map(csvCell).join(';'));
  const sortedExpenses = [...expenses].sort((a, b) => a.expenseDate.localeCompare(b.expenseDate));
  for (const e of sortedExpenses) {
    rows.push(
      [
        e.expenseDate.slice(0, 10),
        e.lineId ? (lineNameById.get(e.lineId) ?? '') : 'Non ventilée',
        e.label,
        e.amount,
        statusCfg[e.status].label,
        e.vendor ?? '',
      ]
        .map(csvCell)
        .join(';')
    );
  }

  return rows.join('\r\n');
}
