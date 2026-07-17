import { useMemo, useState } from 'react';
import { useApp, useCurrentUser } from '../../stores/appStore';
import { Modal } from '../ui/Modal';
import { FieldLabel, NativeSelect, Switch, TextInput, Textarea } from '../ui/Field';
import { Search, Link2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Goal } from '../../types';

interface Props {
  initial?: Goal;
  onClose: () => void;
}

export function GoalFormModal({ initial, onClose }: Props) {
  const users = useApp((s) => s.users);
  const goals = useApp((s) => s.goals);
  const allTasks = useApp((s) => s.tasks);
  const allProjects = useApp((s) => s.projects);
  const create = useApp((s) => s.createGoal);
  const update = useApp((s) => s.updateGoal);
  const recompute = useApp((s) => s.recomputeGoalFromTasks);
  const updateTask = useApp((s) => s.updateTask);
  const me = useCurrentUser();

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [level, setLevel] = useState<Goal['level']>(initial?.level ?? 'team');
  const [parentGoalId, setParentGoalId] = useState(initial?.parentGoalId ?? '');
  const [ownerId, setOwnerId] = useState(initial?.ownerId ?? me?.id ?? '');
  const [period, setPeriod] = useState<Goal['period']>(initial?.period ?? 'quarterly');
  const [metricType, setMetricType] = useState<Goal['metricType']>(initial?.metricType ?? 'percentage');
  // Auto = piloté par les actions liées (défaut). Manuel = saisie libre.
  const [autoProgress, setAutoProgress] = useState<boolean>((initial?.progressMode ?? 'auto') !== 'manual');
  const [unit, setUnit] = useState(initial?.unit ?? '%');
  const [targetValue, setTargetValue] = useState<number>(initial?.targetValue ?? 100);
  const [currentValue, setCurrentValue] = useState<number>(initial?.currentValue ?? 0);
  const [startDate, setStartDate] = useState(
    initial?.startDate ? initial.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(
    initial?.endDate
      ? initial.endDate.slice(0, 10)
      : new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
  );

  // Liaison tâches ↔ goal : on garde un Set des taskId qui pointent ce goal.
  // À la sauvegarde, on diff vs l'état initial pour ne toucher QUE les
  // tâches qui ont changé (évite N writes inutiles pour les goals avec
  // beaucoup de tâches contributives).
  const initialLinkedIds = useMemo(
    () => new Set(allTasks.filter((t) => initial?.id && t.goalId === initial.id).map((t) => t.id)),
    // Snapshot une seule fois à l'ouverture pour ne pas perdre les modifs
    // en cours si une autre tab modifie un task.goalId en parallèle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [linkedIds, setLinkedIds] = useState<Set<string>>(() => new Set(initialLinkedIds));
  const [taskSearch, setTaskSearch] = useState('');

  const projectsById = useMemo(() => new Map(allProjects.map((p) => [p.id, p])), [allProjects]);

  // Tâches affichables : par défaut on montre uniquement celles liées (pour
  // garder la liste courte). Quand l'utilisateur tape une recherche, on
  // étend à toutes les tâches matchant le terme (titre ou projet).
  const visibleTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase();
    if (!q) {
      return allTasks.filter((t) => linkedIds.has(t.id));
    }
    return allTasks
      .filter((t) => {
        if (linkedIds.has(t.id)) return true;
        const pName = projectsById.get(t.projectId)?.name ?? '';
        return (
          t.title.toLowerCase().includes(q) ||
          pName.toLowerCase().includes(q) ||
          (t.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
        );
      })
      .slice(0, 60);
  }, [allTasks, linkedIds, taskSearch, projectsById]);

  const toggleLink = (taskId: string) => {
    setLinkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const submit = () => {
    if (!title.trim()) return;
    const payload: Omit<Goal, 'id'> = {
      title: title.trim(),
      description: description.trim() || undefined,
      level,
      parentGoalId: parentGoalId || undefined,
      ownerId,
      period,
      metricType,
      progressMode: autoProgress ? 'auto' : 'manual',
      unit,
      targetValue,
      // En auto, `currentValue` sera recalculé depuis les actions — la valeur
      // saisie n'est conservée que comme point de départ en mode manuel.
      currentValue,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      status: 'on_track',
      health: 'green',
    };
    let goalId: string;
    if (initial?.id) {
      update(initial.id, payload);
      goalId = initial.id;
    } else {
      goalId = create(payload).id;
    }

    // Diff des liaisons : on applique uniquement les changements (link/unlink).
    // updateTask déclenche recomputeGoalFromTasks → le goal se met à jour
    // automatiquement après les modifs de liaison.
    for (const tid of linkedIds) {
      if (!initialLinkedIds.has(tid)) updateTask(tid, { goalId });
    }
    for (const tid of initialLinkedIds) {
      if (!linkedIds.has(tid)) updateTask(tid, { goalId: undefined });
    }
    // Recale aussi quand aucune liaison n'a changé (ex. bascule manuel → auto,
    // ou changement de cible) — sinon la valeur resterait celle d'avant.
    if (autoProgress) recompute(goalId);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'Modifier le Goal' : 'Nouveau Goal'}
      description="Liez votre travail quotidien à un objectif mesurable."
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost text-sm px-3 py-1.5">
            Annuler
          </button>
          <button disabled={!title.trim()} onClick={submit} className="btn-primary text-sm px-3.5 py-1.5">
            {initial ? 'Enregistrer' : 'Créer'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>Titre</FieldLabel>
          <TextInput
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Atteindre 50K MAU…"
          />
        </div>
        <div>
          <FieldLabel>Description</FieldLabel>
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Contexte, raisonnement, succès attendu"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Niveau</FieldLabel>
            <NativeSelect value={level} onChange={(e) => setLevel(e.target.value as Goal['level'])}>
              <option value="workspace">Entreprise</option>
              <option value="team">Équipe</option>
              <option value="personal">Personnel</option>
            </NativeSelect>
          </div>
          <div>
            <FieldLabel>Goal parent</FieldLabel>
            <NativeSelect value={parentGoalId} onChange={(e) => setParentGoalId(e.target.value)}>
              <option value="">— aucun</option>
              {goals
                .filter((g) => g.id !== initial?.id)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
            </NativeSelect>
          </div>
          <div>
            <FieldLabel>Propriétaire</FieldLabel>
            <NativeSelect value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <FieldLabel>Période</FieldLabel>
            <NativeSelect value={period} onChange={(e) => setPeriod(e.target.value as Goal['period'])}>
              <option value="monthly">Mensuelle</option>
              <option value="quarterly">Trimestrielle</option>
              <option value="semestrial">Semestrielle</option>
              <option value="annual">Annuelle</option>
            </NativeSelect>
          </div>
          <div>
            <FieldLabel>Type métrique</FieldLabel>
            <NativeSelect
              value={metricType}
              onChange={(e) => setMetricType(e.target.value as Goal['metricType'])}
            >
              <option value="percentage">Pourcentage</option>
              <option value="number">Nombre</option>
              <option value="currency">Devise</option>
              <option value="boolean">Booléen</option>
            </NativeSelect>
          </div>
          <div>
            <FieldLabel>Unité</FieldLabel>
            <TextInput value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="%, MAU, M FCFA…" />
          </div>
          <div>
            <FieldLabel>Valeur cible</FieldLabel>
            <TextInput
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(Number(e.target.value))}
            />
          </div>
          <div>
            <FieldLabel hint={autoProgress ? 'calculée depuis les actions' : undefined}>
              Valeur actuelle
            </FieldLabel>
            <TextInput
              type="number"
              value={currentValue}
              disabled={autoProgress}
              onChange={(e) => setCurrentValue(Number(e.target.value))}
            />
          </div>
          <div>
            <FieldLabel>Début</FieldLabel>
            <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <FieldLabel>Fin</FieldLabel>
            <TextInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between panel p-3">
          <div className="pr-3">
            <div className="text-sm text-atlas-fg-1">Progression automatique</div>
            <div className="text-2xs text-atlas-fg-3 mt-0.5">
              {autoProgress
                ? 'Calculée depuis les actions liées et leurs sous-actions (crédit partiel). La valeur actuelle est verrouillée.'
                : 'Vous saisissez la valeur à la main — elle ne sera jamais écrasée par les actions.'}
            </div>
          </div>
          <Switch checked={autoProgress} onChange={setAutoProgress} />
        </div>

        {/* Liaison tâches ↔ goal */}
        <div className="pt-4 border-t border-atlas-line/60">
          <FieldLabel
            hint={`${linkedIds.size} tâche${linkedIds.size > 1 ? 's' : ''} liée${linkedIds.size > 1 ? 's' : ''}`}
          >
            Tâches contributrices
          </FieldLabel>
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 text-atlas-fg-3 absolute left-3 top-1/2 -translate-y-1/2" />
            <TextInput
              value={taskSearch}
              onChange={(e) => setTaskSearch(e.target.value)}
              placeholder="Chercher une tâche par titre, projet ou tag…"
              className="pl-9"
            />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-atlas-line bg-atlas-cream/40">
            {visibleTasks.length === 0 ? (
              <div className="py-6 px-4 text-center text-2xs text-atlas-fg-3">
                {taskSearch
                  ? `Aucune tâche ne matche « ${taskSearch} ».`
                  : "Aucune tâche liée pour l'instant. Tapez ci-dessus pour en chercher."}
              </div>
            ) : (
              <ul className="divide-y divide-atlas-line/40">
                {visibleTasks.map((t) => {
                  const isLinked = linkedIds.has(t.id);
                  const proj = projectsById.get(t.projectId);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => toggleLink(t.id)}
                        className={cn(
                          'w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-atlas-sage/5 transition-colors',
                          isLinked && 'bg-atlas-sage/10'
                        )}
                      >
                        <span
                          className={cn(
                            'shrink-0 w-4 h-4 rounded border flex items-center justify-center mt-0.5 transition-colors',
                            isLinked
                              ? 'bg-atlas-sage-deep border-atlas-sage-deep text-white'
                              : 'border-atlas-line bg-white text-transparent'
                          )}
                        >
                          {isLinked && <Link2 className="w-2.5 h-2.5" strokeWidth={3} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-atlas-fg-1 truncate">{t.title}</div>
                          {proj && (
                            <div className="text-2xs text-atlas-fg-3 flex items-center gap-1.5">
                              <span
                                className="inline-block w-1.5 h-1.5 rounded-full"
                                style={{ background: proj.color }}
                              />
                              {proj.name}
                              {t.status === 'done' && <span className="text-signal-green">· livrée</span>}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {linkedIds.size > 0 && taskSearch && (
            <p className="text-2xs text-atlas-fg-3 mt-1.5">
              Astuce : videz la recherche pour ne voir que les tâches déjà liées.
            </p>
          )}
        </div>

        {linkedIds.size > 0 && (
          <div className="rounded-xl border border-atlas-sage/30 bg-atlas-sage/5 px-3 py-2 text-2xs text-atlas-fg-2 inline-flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5 text-atlas-sage-deep" />
            La progression du goal sera recalculée automatiquement à partir des tâches liées (et de leurs
            sous-tâches).
          </div>
        )}
      </div>
    </Modal>
  );
}
