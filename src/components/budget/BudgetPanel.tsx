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
  CornerDownRight,
  LayoutDashboard,
  ListTree,
  MessageSquare,
  Paperclip,
  Loader2,
} from 'lucide-react';
import { useApp } from '../../stores/appStore';
import { cn, formatFCFA, formatDate } from '../../lib/utils';
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu';
import { signedBudgetUrl } from '../../lib/budgetStorage';
import { BudgetLineModal } from './BudgetLineModal';
import { ExpenseModal } from './ExpenseModal';
import { AttachmentsBlock } from './AttachmentsBlock';
import { buildBudgetTree, computeBudgetTotals, flattenTree, type BudgetTreeNode } from './rollups';
import type { BudgetLine, BudgetAttachment, BudgetNote, Expense, ExpenseStatus } from '../../types';

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

/** Export the budget (lines + expenses) to a CSV file (UTF-8 BOM, ; separator → Excel). */
function downloadBudgetCsv(flatLines: { line: BudgetLine; depth: number }[], expenses: Expense[]): void {
  const spentByLine = new Map<string, number>();
  for (const e of expenses)
    if (e.lineId) spentByLine.set(e.lineId, (spentByLine.get(e.lineId) ?? 0) + e.amount);
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineName = (id: string | null | undefined) =>
    flatLines.find((f) => f.line.id === id)?.line.name ?? '(non ventilée)';
  const rows: string[] = [];
  rows.push('LIGNES BUDGÉTAIRES');
  rows.push(['Ligne', 'Alloué (FCFA)', 'Dépensé direct (FCFA)', 'Reste (FCFA)'].join(';'));
  for (const { line, depth } of flatLines) {
    const sp = spentByLine.get(line.id) ?? 0;
    rows.push(
      [esc('  '.repeat(depth) + line.name), line.allocatedAmount, sp, line.allocatedAmount - sp].join(';')
    );
  }
  rows.push('');
  rows.push('DÉPENSES');
  rows.push(['Date', 'Ligne', 'Libellé', 'Montant (FCFA)', 'Statut', 'Fournisseur'].join(';'));
  for (const e of [...expenses].sort((a, b) => b.expenseDate.localeCompare(a.expenseDate))) {
    rows.push(
      [
        esc(e.expenseDate?.slice(0, 10)),
        esc(lineName(e.lineId)),
        esc(e.label),
        e.amount,
        e.status,
        esc(e.vendor ?? ''),
      ].join(';')
    );
  }
  const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'budget.csv';
  a.click();
  URL.revokeObjectURL(url);
}

type SubTab = 'overview' | 'lines' | 'notes' | 'files';

interface ModalState {
  kind: 'line-create' | 'line-edit' | 'sub-create' | 'expense-create' | 'expense-edit';
  line?: BudgetLine;
  expense?: Expense;
  parentLineId?: string | null;
  parentName?: string;
  defaultLineId?: string | null;
}

const subTabs: { key: SubTab; label: string; icon: typeof Wallet }[] = [
  { key: 'overview', label: "Vue d'ensemble", icon: LayoutDashboard },
  { key: 'lines', label: 'Lignes & dépenses', icon: ListTree },
  { key: 'notes', label: 'Notes', icon: MessageSquare },
  { key: 'files', label: 'Pièces jointes', icon: Paperclip },
];

export function BudgetPanel({ projectId }: { projectId: string }) {
  const allLines = useApp((s) => s.budgetLines);
  const allExpenses = useApp((s) => s.expenses);

  const lines = useMemo(() => allLines.filter((l) => l.projectId === projectId), [allLines, projectId]);
  const expenses = useMemo(
    () => allExpenses.filter((e) => e.projectId === projectId),
    [allExpenses, projectId]
  );

  const tree = useMemo(() => buildBudgetTree(lines, expenses), [lines, expenses]);
  const totals = useMemo(() => computeBudgetTotals(lines, expenses), [lines, expenses]);
  const flatLines = useMemo(() => flattenTree(tree), [tree]);

  const [tab, setTab] = useState<SubTab>('overview');
  const [modal, setModal] = useState<ModalState | null>(null);

  return (
    <div className="space-y-5">
      {/* Sub-tab bar — pill tabs matching the project view toggles + export. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <nav className="flex items-center gap-1 p-1 bg-black/[0.03] border border-atlas-line rounded-xl w-fit">
          {subTabs.map((st) => {
            const T = st.icon;
            const active = tab === st.key;
            return (
              <button
                key={st.key}
                onClick={() => setTab(st.key)}
                className={cn('tab-base', active && 'tab-active')}
              >
                <T className="w-3.5 h-3.5" />
                {st.label}
              </button>
            );
          })}
        </nav>
        <button
          onClick={() => downloadBudgetCsv(flatLines, expenses)}
          disabled={lines.length === 0 && expenses.length === 0}
          className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5" /> Exporter
        </button>
      </div>

      {tab === 'overview' && <OverviewTab tree={tree} totals={totals} />}
      {tab === 'lines' && (
        <LinesTab
          projectId={projectId}
          tree={tree}
          expenses={expenses}
          onCreateRoot={() => setModal({ kind: 'line-create' })}
          onCreateSub={(parent) =>
            setModal({ kind: 'sub-create', parentLineId: parent.id, parentName: parent.name })
          }
          onEditLine={(line) => setModal({ kind: 'line-edit', line })}
          onAddExpense={(lineId) => setModal({ kind: 'expense-create', defaultLineId: lineId })}
          onEditExpense={(expense) => setModal({ kind: 'expense-edit', expense })}
        />
      )}
      {tab === 'notes' && <NotesTab lines={lines} expenses={expenses} />}
      {tab === 'files' && <FilesTab lines={lines} expenses={expenses} />}

      {/* Modals */}
      {(modal?.kind === 'line-create' || modal?.kind === 'line-edit' || modal?.kind === 'sub-create') && (
        <BudgetLineModal
          projectId={projectId}
          initial={modal.line}
          parentLineId={modal.parentLineId}
          parentName={modal.parentName}
          onClose={() => setModal(null)}
        />
      )}
      {(modal?.kind === 'expense-create' || modal?.kind === 'expense-edit') && (
        <ExpenseModal
          projectId={projectId}
          lines={flatLines}
          defaultLineId={modal.defaultLineId}
          initial={modal.expense}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

/* ─────────── 1. Vue d'ensemble ─────────── */

function OverviewTab({
  tree,
  totals,
}: {
  tree: BudgetTreeNode[];
  totals: ReturnType<typeof computeBudgetTotals>;
}) {
  const { totalAllocated, totalSpent, totalRemaining, pct, byStatus } = totals;

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Wallet} label="Budget total" value={formatFCFA(totalAllocated)} tone="neutral" />
        <Kpi icon={TrendingDown} label="Dépensé" value={formatFCFA(totalSpent)} tone="spent" />
        <Kpi
          icon={PiggyBank}
          label="Reste"
          value={formatFCFA(totalRemaining)}
          tone={totalRemaining < 0 ? 'over' : 'ok'}
        />
        <Kpi
          icon={TrendingDown}
          label="Consommé"
          value={`${Math.round(pct)}%`}
          tone={pct > 100 ? 'over' : pct > 90 ? 'spent' : 'ok'}
        />
      </div>

      {/* Global consumption bar */}
      <div className="panel p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
            Consommation du budget
          </span>
          <span className={cn('text-sm font-medium font-mono tabular-nums', pctText(pct))}>
            {Math.round(pct)}%
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-black/[0.06] overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', barColor(pct))}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>

      {/* Status breakdown */}
      <div className="panel p-4">
        <span className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
          Répartition par statut
        </span>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <StatusCell label="Prévu" value={byStatus.planned} cls="text-atlas-fg-2" />
          <StatusCell label="Engagé" value={byStatus.committed} cls="text-signal-blue" />
          <StatusCell label="Payé" value={byStatus.paid} cls="text-signal-green" />
        </div>
      </div>

      {/* Top-level lines with rolled-up spend */}
      <div className="panel p-4">
        <span className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
          Lignes principales
        </span>
        {tree.length === 0 ? (
          <p className="mt-3 text-sm text-atlas-fg-3 italic">Aucune ligne budgétaire pour ce projet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {tree.map((node) => {
              const linePct =
                node.line.allocatedAmount > 0
                  ? (node.subtreeSpent / node.line.allocatedAmount) * 100
                  : node.subtreeSpent > 0
                    ? 100
                    : 0;
              return (
                <div key={node.line.id}>
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <span className="text-sm font-medium text-atlas-fg-1 truncate">{node.line.name}</span>
                    <span className="text-2xs font-mono text-atlas-fg-3 shrink-0">
                      {formatFCFA(node.subtreeSpent)} / {formatFCFA(node.line.allocatedAmount)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', barColor(linePct))}
                      style={{ width: `${Math.min(100, linePct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusCell({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="rounded-lg border border-atlas-line bg-white px-3 py-2.5 text-center">
      <div className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">{label}</div>
      <div className={cn('mt-1 text-sm font-medium tabular-nums', cls)}>{formatFCFA(value)}</div>
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
  const toneCls = tone === 'over' ? 'text-signal-red' : tone === 'ok' ? 'text-atlas-sage' : 'text-atlas-fg-1';
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

/* ─────────── 2. Lignes & dépenses (arborescence) ─────────── */

function LinesTab({
  projectId,
  tree,
  expenses,
  onCreateRoot,
  onCreateSub,
  onEditLine,
  onAddExpense,
  onEditExpense,
}: {
  projectId: string;
  tree: BudgetTreeNode[];
  expenses: Expense[];
  onCreateRoot: () => void;
  onCreateSub: (parent: BudgetLine) => void;
  onEditLine: (line: BudgetLine) => void;
  onAddExpense: (lineId: string) => void;
  onEditExpense: (e: Expense) => void;
}) {
  // Unallocated expenses (no line) — shown as a special bucket.
  const unallocated = useMemo(() => expenses.filter((e) => !e.lineId), [expenses]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-atlas-fg-1">Arborescence budgétaire</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => onAddExpense('')} className="btn-secondary text-sm px-3 py-1.5">
            <Receipt className="w-3.5 h-3.5" /> Dépense
          </button>
          <button onClick={onCreateRoot} className="btn-primary text-sm px-3 py-1.5">
            <Plus className="w-3.5 h-3.5" /> Ligne
          </button>
        </div>
      </div>

      {tree.length === 0 && unallocated.length === 0 ? (
        <div className="panel p-10 text-center">
          <Wallet className="w-8 h-8 mx-auto mb-2 text-atlas-fg-3 opacity-40" />
          <p className="text-sm text-atlas-fg-3">
            Aucune ligne budgétaire pour ce projet.
            <br />
            <button onClick={onCreateRoot} className="text-atlas-amber-deep hover:underline mt-2">
              Créer la première ligne
            </button>
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tree.map((node) => (
            <BudgetLineRow
              key={node.line.id}
              projectId={projectId}
              node={node}
              expenses={expenses}
              onCreateSub={onCreateSub}
              onEditLine={onEditLine}
              onAddExpense={onAddExpense}
              onEditExpense={onEditExpense}
            />
          ))}

          {unallocated.length > 0 && <UnallocatedRow expenses={unallocated} onEditExpense={onEditExpense} />}
        </div>
      )}
    </div>
  );
}

function BudgetLineRow({
  projectId,
  node,
  expenses,
  onCreateSub,
  onEditLine,
  onAddExpense,
  onEditExpense,
}: {
  projectId: string;
  node: BudgetTreeNode;
  expenses: Expense[];
  onCreateSub: (parent: BudgetLine) => void;
  onEditLine: (line: BudgetLine) => void;
  onAddExpense: (lineId: string) => void;
  onEditExpense: (e: Expense) => void;
}) {
  const { line, depth, subtreeSpent, remaining } = node;
  const [open, setOpen] = useState(depth === 0);
  const [noteDraft, setNoteDraft] = useState('');
  const deleteBudgetLine = useApp((s) => s.deleteBudgetLine);
  const addBudgetNote = useApp((s) => s.addBudgetNote);
  const liveLine = useApp((s) => s.budgetLines.find((l) => l.id === line.id));

  const pct =
    line.allocatedAmount > 0 ? (subtreeSpent / line.allocatedAmount) * 100 : subtreeSpent > 0 ? 100 : 0;
  const directExpenses = expenses.filter((e) => e.lineId === line.id);

  const submitNote = () => {
    if (!noteDraft.trim()) return;
    addBudgetNote({ kind: 'line', id: line.id }, noteDraft);
    setNoteDraft('');
  };

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-3" style={{ paddingLeft: 12 + depth * 22 }}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-atlas-fg-3 hover:text-atlas-fg-1 shrink-0"
          aria-label={open ? 'Replier' : 'Déplier'}
        >
          <ChevronRight className={cn('w-4 h-4 transition-transform', open && 'rotate-90')} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {depth > 0 && <CornerDownRight className="w-3 h-3 text-atlas-fg-3 shrink-0" />}
            <span className="text-sm font-medium text-atlas-fg-1 truncate">{line.name}</span>
            {node.children.length > 0 && (
              <span className="text-2xs font-mono text-atlas-fg-3">
                {node.children.length} sous-ligne{node.children.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', barColor(pct))}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>
        <div className="hidden md:grid grid-cols-3 gap-4 text-right shrink-0 w-[340px]">
          <Cell label="Alloué" value={formatFCFA(line.allocatedAmount)} />
          <Cell label="Dépensé" value={formatFCFA(subtreeSpent)} />
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
          width={190}
        >
          {(close) => (
            <>
              <MenuItem
                icon={CornerDownRight}
                onClick={() => {
                  close();
                  onCreateSub(line);
                }}
              >
                Ajouter une sous-ligne
              </MenuItem>
              <MenuItem
                icon={Receipt}
                onClick={() => {
                  close();
                  onAddExpense(line.id);
                }}
              >
                Ajouter une dépense
              </MenuItem>
              <MenuItem
                icon={Edit3}
                onClick={() => {
                  close();
                  onEditLine(line);
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
        <div className="border-t border-black/[0.05] bg-black/[0.015]">
          {/* Recursive sub-lines */}
          {node.children.length > 0 && (
            <div className="space-y-2 px-3 py-3">
              {node.children.map((child) => (
                <BudgetLineRow
                  key={child.line.id}
                  projectId={projectId}
                  node={child}
                  expenses={expenses}
                  onCreateSub={onCreateSub}
                  onEditLine={onEditLine}
                  onAddExpense={onAddExpense}
                  onEditExpense={onEditExpense}
                />
              ))}
            </div>
          )}

          <div className="px-4 py-3 space-y-4">
            {/* Direct expenses */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
                  Dépenses directes
                </span>
                <button
                  onClick={() => onAddExpense(line.id)}
                  className="text-2xs text-atlas-fg-3 hover:text-atlas-fg-1 inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Dépense
                </button>
              </div>
              {directExpenses.length === 0 ? (
                <p className="text-2xs text-atlas-fg-3 italic py-1">
                  Aucune dépense directe sur cette ligne.
                </p>
              ) : (
                <ExpenseTable expenses={directExpenses} onEditExpense={onEditExpense} />
              )}
            </div>

            {/* Notes */}
            <NotesBlock
              notes={liveLine?.notes ?? line.notes}
              draft={noteDraft}
              setDraft={setNoteDraft}
              onSubmit={submitNote}
            />

            {/* Pièces jointes */}
            <AttachmentsBlock
              projectId={projectId}
              target={{ kind: 'line', id: line.id }}
              attachments={liveLine?.attachments ?? line.attachments}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function UnallocatedRow({
  expenses,
  onEditExpense,
}: {
  expenses: Expense[];
  onEditExpense: (e: Expense) => void;
}) {
  const [open, setOpen] = useState(false);
  const spent = expenses.reduce((sum, e) => sum + e.amount, 0);
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

/* ─────────── 3. Notes / Communication (aggregated timeline) ─────────── */

interface AggregatedNote {
  note: BudgetNote;
  source: string;
}

function NotesTab({ lines, expenses }: { lines: BudgetLine[]; expenses: Expense[] }) {
  const users = useApp((s) => s.users);
  const items = useMemo<AggregatedNote[]>(() => {
    const out: AggregatedNote[] = [];
    for (const l of lines) {
      for (const n of l.notes) out.push({ note: n, source: `Ligne · ${l.name}` });
    }
    for (const e of expenses) {
      for (const n of e.notes) out.push({ note: n, source: `Dépense · ${e.label}` });
    }
    return out.sort((a, b) => b.note.at.localeCompare(a.note.at));
  }, [lines, expenses]);

  const authorName = (id: string | null) => users.find((u) => u.id === id)?.name ?? 'Inconnu';

  if (items.length === 0) {
    return (
      <div className="panel p-10 text-center">
        <MessageSquare className="w-8 h-8 mx-auto mb-2 text-atlas-fg-3 opacity-40" />
        <p className="text-sm text-atlas-fg-3">Aucune note budgétaire pour ce projet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map(({ note, source }) => (
        <div key={note.id} className="panel p-4">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <span className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium truncate">
              {source}
            </span>
            <span className="text-2xs font-mono text-atlas-fg-3 shrink-0">
              {new Date(note.at).toLocaleString('fr-FR')}
            </span>
          </div>
          <p className="text-sm text-atlas-fg-1 whitespace-pre-wrap">{note.text}</p>
          <span className="block mt-1.5 text-2xs text-atlas-fg-3">{authorName(note.authorId)}</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────── 4. Pièces jointes (aggregated gallery) ─────────── */

interface AggregatedAttachment {
  att: BudgetAttachment;
  source: string;
}

/** Human-readable file size. */
function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function FilesTab({ lines, expenses }: { lines: BudgetLine[]; expenses: Expense[] }) {
  const pushToast = useApp((s) => s.pushToast);
  const [busyId, setBusyId] = useState<string | null>(null);

  const items = useMemo<AggregatedAttachment[]>(() => {
    const out: AggregatedAttachment[] = [];
    for (const l of lines) {
      for (const a of l.attachments) out.push({ att: a, source: `Ligne · ${l.name}` });
    }
    for (const e of expenses) {
      for (const a of e.attachments) out.push({ att: a, source: `Dépense · ${e.label}` });
    }
    return out.sort((a, b) => b.att.uploadedAt.localeCompare(a.att.uploadedAt));
  }, [lines, expenses]);

  const onDownload = async (att: BudgetAttachment) => {
    setBusyId(att.id);
    try {
      const url = await signedBudgetUrl(att.path);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else pushToast({ kind: 'error', title: 'Téléchargement impossible', body: att.name });
    } finally {
      setBusyId(null);
    }
  };

  if (items.length === 0) {
    return (
      <div className="panel p-10 text-center">
        <Paperclip className="w-8 h-8 mx-auto mb-2 text-atlas-fg-3 opacity-40" />
        <p className="text-sm text-atlas-fg-3">Aucune pièce jointe budgétaire pour ce projet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map(({ att, source }) => {
        const busy = busyId === att.id;
        const size = formatSize(att.size);
        return (
          <div key={att.id} className="group panel p-3 flex items-center gap-3 hover:border-atlas-line-2">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center border bg-atlas-amber/15 text-atlas-amber-deep border-atlas-amber/30 shrink-0">
              <Paperclip className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-atlas-fg-1 truncate">{att.name}</div>
              <div className="text-2xs text-atlas-fg-3 truncate">
                {size && `${size} · `}
                {source}
              </div>
            </div>
            <button
              onClick={() => onDownload(att)}
              disabled={busy}
              className="btn-ghost !p-1.5 shrink-0 disabled:opacity-50"
              aria-label="Télécharger"
              title="Télécharger"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
