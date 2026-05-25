import { useMemo } from 'react';
import { Wallet } from 'lucide-react';
import { useApp } from '../../stores/appStore';
import { cn, formatFCFA } from '../../lib/utils';
import type { ViewKey } from '../../types';

/** Bar fill color by usage ratio (mirrors BudgetPanel). */
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

interface ProjectRow {
  projectId: string;
  name: string;
  color: string;
  allocated: number;
  spent: number;
  remaining: number;
  pct: number;
}

/**
 * Portfolio budget view: every project that has budget lines OR expenses,
 * with allocated / spent / remaining / % and a colored progress bar.
 * Clicking a row opens that project (same state-based nav as the sidebar).
 */
export function BudgetOverview({ onNavigate }: { onNavigate: (v: ViewKey, projectId?: string) => void }) {
  const projects = useApp((s) => s.projects);
  const budgetLines = useApp((s) => s.budgetLines);
  const expenses = useApp((s) => s.expenses);

  const rows = useMemo<ProjectRow[]>(() => {
    const allocByProject = new Map<string, number>();
    for (const l of budgetLines) {
      allocByProject.set(l.projectId, (allocByProject.get(l.projectId) ?? 0) + l.allocatedAmount);
    }
    const spentByProject = new Map<string, number>();
    for (const e of expenses) {
      spentByProject.set(e.projectId, (spentByProject.get(e.projectId) ?? 0) + e.amount);
    }
    const projectIds = new Set<string>([...allocByProject.keys(), ...spentByProject.keys()]);

    const out: ProjectRow[] = [];
    for (const pid of projectIds) {
      const project = projects.find((p) => p.id === pid);
      const allocated = allocByProject.get(pid) ?? 0;
      const spent = spentByProject.get(pid) ?? 0;
      const pct = allocated > 0 ? (spent / allocated) * 100 : spent > 0 ? 100 : 0;
      out.push({
        projectId: pid,
        name: project?.name ?? 'Projet supprimé',
        color: project?.color ?? '#95B07D',
        allocated,
        spent,
        remaining: allocated - spent,
        pct,
      });
    }
    out.sort((a, b) => b.pct - a.pct);
    return out;
  }, [projects, budgetLines, expenses]);

  const totalAllocated = rows.reduce((s, r) => s + r.allocated, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const totalRemaining = totalAllocated - totalSpent;
  const totalPct = totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0;

  return (
    <div className="px-6 sm:px-8 py-7 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-display font-medium text-atlas-fg-1">Budget — portefeuille</h1>
        <p className="mt-1 text-sm text-atlas-fg-3">
          Vue consolidée des budgets de tous vos projets. Cliquez sur un projet pour ouvrir son budget.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="panel p-10 text-center">
          <Wallet className="w-8 h-8 mx-auto mb-2 text-atlas-fg-3 opacity-40" />
          <p className="text-sm text-atlas-fg-3">
            Aucun projet n’a encore de budget. Ouvrez un projet puis l’onglet Budget pour commencer.
          </p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_140px_60px] gap-3 px-4 py-2.5 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium bg-black/[0.02] border-b border-atlas-line">
            <span>Projet</span>
            <span className="text-right">Budget</span>
            <span className="text-right">Dépensé</span>
            <span className="text-right">Reste</span>
            <span>Consommation</span>
            <span className="text-right">%</span>
          </div>
          <div className="divide-y divide-atlas-line">
            {rows.map((r) => (
              <button
                key={r.projectId}
                onClick={() => onNavigate('project', r.projectId)}
                className="w-full grid grid-cols-[1.6fr_1fr_1fr_1fr_140px_60px] gap-3 px-4 py-3 items-center text-left hover:bg-black/[0.02] transition-colors"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: r.color }}
                    aria-hidden
                  />
                  <span className="text-sm font-medium text-atlas-fg-1 truncate">{r.name}</span>
                </span>
                <span className="text-sm tabular-nums text-atlas-fg-1 text-right">
                  {formatFCFA(r.allocated)}
                </span>
                <span className="text-sm tabular-nums text-atlas-fg-1 text-right">{formatFCFA(r.spent)}</span>
                <span
                  className={cn(
                    'text-sm tabular-nums text-right',
                    r.remaining < 0 ? 'text-signal-red' : 'text-atlas-sage'
                  )}
                >
                  {formatFCFA(r.remaining)}
                </span>
                <span className="h-2 rounded-full bg-black/[0.06] overflow-hidden">
                  <span
                    className={cn('block h-full rounded-full transition-all', barColor(r.pct))}
                    style={{ width: `${Math.min(100, r.pct)}%` }}
                  />
                </span>
                <span className={cn('text-sm font-medium font-mono tabular-nums text-right', pctText(r.pct))}>
                  {Math.round(r.pct)}%
                </span>
              </button>
            ))}
          </div>
          {/* TOTAL */}
          <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_140px_60px] gap-3 px-4 py-3 items-center border-t-2 border-atlas-line bg-black/[0.02]">
            <span className="text-sm font-semibold text-atlas-fg-1">TOTAL</span>
            <span className="text-sm font-semibold tabular-nums text-atlas-fg-1 text-right">
              {formatFCFA(totalAllocated)}
            </span>
            <span className="text-sm font-semibold tabular-nums text-atlas-fg-1 text-right">
              {formatFCFA(totalSpent)}
            </span>
            <span
              className={cn(
                'text-sm font-semibold tabular-nums text-right',
                totalRemaining < 0 ? 'text-signal-red' : 'text-atlas-sage'
              )}
            >
              {formatFCFA(totalRemaining)}
            </span>
            <span className="h-2 rounded-full bg-black/[0.06] overflow-hidden">
              <span
                className={cn('block h-full rounded-full', barColor(totalPct))}
                style={{ width: `${Math.min(100, totalPct)}%` }}
              />
            </span>
            <span
              className={cn('text-sm font-semibold font-mono tabular-nums text-right', pctText(totalPct))}
            >
              {Math.round(totalPct)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
