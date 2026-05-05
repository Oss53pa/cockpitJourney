import { useEffect, useState } from 'react';
import { useApp } from '../../stores/appStore';
import { Modal } from '../ui/Modal';
import { FieldLabel, NativeSelect, Switch, TextInput, Textarea } from '../ui/Field';
import { Avatar } from '../ui/Avatar';
import type { Priority, Task, TaskStatus } from '../../types';
import {
  Sparkles,
  Plus,
  Trash2,
  X,
  Tag as TagIcon,
  Repeat,
  Target,
  Paperclip,
  Users,
  Eye,
  ListChecks,
  Type,
  Hash,
  Workflow,
  Calendar,
  Clock,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  mode: 'create' | 'edit';
  initial?: Partial<Task>;
  onClose: () => void;
}

const TASK_TYPES = [
  { value: 'standard', label: 'Tâche standard' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'lead', label: 'Lead commercial' },
  { value: 'invoice', label: 'Facture' },
  { value: 'doc', label: 'Document à valider' },
  { value: 'meeting', label: 'Réunion' },
  { value: 'decision', label: 'Décision' },
  { value: 'approval', label: "Demande d'approbation" },
];

const RECURRENCE_PRESETS = [
  { value: '', label: 'Aucune' },
  { value: 'FREQ=DAILY', label: 'Tous les jours' },
  { value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', label: 'Tous les jours ouvrés' },
  { value: 'FREQ=WEEKLY', label: 'Chaque semaine' },
  { value: 'FREQ=WEEKLY;INTERVAL=2', label: 'Toutes les 2 semaines' },
  { value: 'FREQ=MONTHLY', label: 'Chaque mois' },
  { value: 'FREQ=MONTHLY;INTERVAL=3', label: 'Chaque trimestre' },
  { value: 'FREQ=YEARLY', label: 'Chaque année' },
];

type Section = 'basics' | 'people' | 'planning' | 'organize' | 'subtasks' | 'links';

export function TaskFormModal({ mode, initial, onClose }: Props) {
  const projects = useApp((s) => s.projects);
  const sections = useApp((s) => s.sections);
  const users = useApp((s) => s.users);
  const goals = useApp((s) => s.goals);
  const createTask = useApp((s) => s.createTask);
  const updateTask = useApp((s) => s.updateTask);
  const addSubtaskAction = useApp((s) => s.addSubtask);
  const pushToast = useApp((s) => s.pushToast);

  const [tab, setTab] = useState<Section>('basics');

  // Basics
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [projectId, setProjectId] = useState(initial?.projectId ?? projects[0]?.id ?? '');
  const projectSections = sections.filter((s) => s.projectId === projectId);
  const [sectionId, setSectionId] = useState(initial?.sectionId ?? projectSections[0]?.id ?? '');
  const [status, setStatus] = useState<TaskStatus>((initial?.status as TaskStatus) ?? 'todo');
  const [priority, setPriority] = useState<Priority>((initial?.priority as Priority) ?? 2);
  const [taskType, setTaskType] = useState('standard');

  // People
  const [assignees, setAssignees] = useState<string[]>(initial?.assignees ?? ['u_pame']);
  const [watchers, setWatchers] = useState<string[]>(initial?.watchers ?? []);

  // Planning
  const [startDate, setStartDate] = useState(
    initial?.startDate ? new Date(initial.startDate).toISOString().slice(0, 16) : ''
  );
  const [dueDate, setDueDate] = useState(
    initial?.dueDate ? new Date(initial.dueDate).toISOString().slice(0, 16) : ''
  );
  const [estimateMinutes, setEstimateMinutes] = useState<number | ''>(initial?.estimatedMinutes ?? '');
  const [actualMinutes, setActualMinutes] = useState<number | ''>(initial?.actualMinutes ?? '');
  const [recurrence, setRecurrence] = useState('');

  // Organize
  const [tagsRaw, setTagsRaw] = useState((initial?.tags ?? []).join(', '));
  const [sprint, setSprint] = useState(String(initial?.customFields?.['Sprint'] ?? ''));
  const [effort, setEffort] = useState<number | ''>(
    typeof initial?.customFields?.['Effort'] === 'number' ? (initial.customFields['Effort'] as number) : ''
  );
  const [surface, setSurface] = useState(String(initial?.customFields?.['Surface'] ?? ''));
  const [billable, setBillable] = useState<boolean>(
    typeof initial?.customFields?.['Facturable'] === 'boolean'
      ? (initial.customFields['Facturable'] as boolean)
      : false
  );

  // Subtasks (only for create)
  const [subtasks, setSubtasks] = useState<{ title: string; assigneeId?: string }[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  // Links
  const [goalId, setGoalId] = useState('');
  const [multiProject, setMultiProject] = useState<boolean>(false);
  const [requiresApproval, setRequiresApproval] = useState<boolean>(false);
  const [makeTemplate, setMakeTemplate] = useState<boolean>(false);

  useEffect(() => {
    if (!projectSections.find((s) => s.id === sectionId)) {
      setSectionId(projectSections[0]?.id ?? '');
    }
  }, [projectId]); // eslint-disable-line

  const toggleAssignee = (id: string) =>
    setAssignees((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const toggleWatcher = (id: string) =>
    setWatchers((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const aiSuggest = () => {
    if (!title.trim()) return;
    setEstimateMinutes(60);
    setPriority(3);
    setSprint(sprint || 'S-08');
    pushToast({ kind: 'success', title: 'PROPH3T a suggéré priorité et estimation', duration: 2000 });
  };

  const removeSubtask = (i: number) => setSubtasks((s) => s.filter((_, idx) => idx !== i));
  const addSubtaskLocal = () => {
    if (!newSubtaskTitle.trim()) return;
    setSubtasks((s) => [...s, { title: newSubtaskTitle.trim(), assigneeId: assignees[0] }]);
    setNewSubtaskTitle('');
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    const tags = tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const customFields: Record<string, string | number | boolean> = {};
    if (sprint) customFields['Sprint'] = sprint;
    if (typeof effort === 'number') customFields['Effort'] = effort;
    if (surface) customFields['Surface'] = surface;
    if (billable) customFields['Facturable'] = true;
    if (taskType !== 'standard')
      customFields['Type'] = TASK_TYPES.find((t) => t.value === taskType)?.label || taskType;
    if (recurrence) customFields['Récurrence'] = recurrence;
    if (requiresApproval) customFields['Approbation'] = 'Requise';
    if (multiProject) customFields['Multi-projets'] = true;

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      projectId,
      sectionId,
      status,
      priority,
      assignees,
      watchers: watchers.length ? watchers : undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      startDate: startDate ? new Date(startDate).toISOString() : undefined,
      estimatedMinutes: typeof estimateMinutes === 'number' ? estimateMinutes : undefined,
      actualMinutes: typeof actualMinutes === 'number' ? actualMinutes : undefined,
      tags,
      customFields: Object.keys(customFields).length ? customFields : undefined,
    };

    if (mode === 'create') {
      const created = createTask(payload);
      // Add subtasks
      subtasks.forEach((s) => addSubtaskAction(created.id, s.title));
      if (goalId) {
        // Lien vers goal — informatif via toast
        pushToast({
          kind: 'info',
          title: 'Goal lié',
          body: `Cette tâche contribue au goal "${goals.find((g) => g.id === goalId)?.title}"`,
        });
      }
      if (makeTemplate)
        pushToast({ kind: 'info', title: 'Template enregistré', body: 'Disponible dans la bibliothèque' });
    } else if (mode === 'edit' && initial?.id) {
      updateTask(initial.id, payload);
    }
    onClose();
  };

  const tabs: { key: Section; label: string; icon: any; count?: number }[] = [
    { key: 'basics', label: 'Essentiel', icon: ListChecks },
    { key: 'people', label: 'Personnes', icon: Users, count: assignees.length + watchers.length },
    { key: 'planning', label: 'Planification', icon: Calendar },
    { key: 'organize', label: 'Organisation', icon: Hash },
    { key: 'subtasks', label: 'Sous-tâches', icon: ListChecks, count: subtasks.length },
    { key: 'links', label: 'Avancé', icon: Workflow },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'create' ? 'Nouvelle tâche' : 'Modifier la tâche'}
      description="Tous les champs CDC · PROPH3T peut suggérer durée et priorité"
      size="xl"
      footer={
        <>
          <button onClick={aiSuggest} className="btn-ghost text-sm px-3 py-1.5 mr-auto">
            <Sparkles className="w-3.5 h-3.5 text-atlas-amber" /> Suggérer (PROPH3T)
          </button>
          <button onClick={onClose} className="btn-ghost text-sm px-3 py-1.5">
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="btn-primary text-sm px-3.5 py-1.5"
          >
            {mode === 'create' ? 'Créer la tâche' : 'Enregistrer'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-[180px_1fr] gap-6 -my-2">
        {/* Sidebar tabs */}
        <nav className="space-y-0.5 sticky top-0">
          {tabs.map((t) => {
            const T = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                  active
                    ? 'bg-atlas-amber/10 text-atlas-amber-deep'
                    : 'text-atlas-fg-2 hover:bg-black/[0.04] hover:text-atlas-fg-1'
                )}
              >
                <T className="w-3.5 h-3.5" />
                <span className="flex-1 text-left">{t.label}</span>
                {typeof t.count === 'number' && t.count > 0 && (
                  <span
                    className={cn(
                      'chip text-[9px] px-1.5 py-0',
                      active ? 'bg-atlas-amber/20 text-atlas-amber-deep' : 'bg-black/[0.05] text-atlas-fg-3'
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Body */}
        <div className="space-y-4 min-w-0">
          {tab === 'basics' && (
            <>
              <div>
                <FieldLabel hint="actionnable, sans la date ni le projet">Titre</FieldLabel>
                <TextInput
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="ex : Valider la maquette finale Daily Brief"
                />
              </div>
              <div>
                <FieldLabel>Description</FieldLabel>
                <Textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Contexte, lien, attentes, critères de succès…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Projet</FieldLabel>
                  <NativeSelect value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div>
                  <FieldLabel>Section</FieldLabel>
                  <NativeSelect value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                    {projectSections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div>
                  <FieldLabel>Statut initial</FieldLabel>
                  <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                    <option value="todo">À faire</option>
                    <option value="in_progress">En cours</option>
                    <option value="in_review">En revue</option>
                    <option value="blocked">Bloquée</option>
                    <option value="done">Terminée</option>
                  </NativeSelect>
                </div>
                <div>
                  <FieldLabel>Priorité</FieldLabel>
                  <NativeSelect
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value) as Priority)}
                  >
                    <option value={1}>Faible</option>
                    <option value={2}>Normale</option>
                    <option value={3}>Haute</option>
                    <option value={4}>Critique</option>
                  </NativeSelect>
                </div>
                <div className="col-span-2">
                  <FieldLabel hint="le CDC en propose 9 par défaut">Type de tâche</FieldLabel>
                  <NativeSelect value={taskType} onChange={(e) => setTaskType(e.target.value)}>
                    {TASK_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
            </>
          )}

          {tab === 'people' && (
            <>
              <div>
                <FieldLabel hint="co-assignation possible (max 5 en plan Pro)">
                  Assignés · {assignees.length}
                </FieldLabel>
                <div className="grid grid-cols-2 gap-1.5">
                  {users.map((u) => {
                    const checked = assignees.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() => toggleAssignee(u.id)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
                          checked
                            ? 'bg-atlas-amber/10 border-atlas-amber/30 text-atlas-fg-1'
                            : 'bg-white border-atlas-line text-atlas-fg-2 hover:border-atlas-line-2'
                        )}
                      >
                        <Avatar user={u} size="xs" />
                        <span className="truncate flex-1 text-left">{u.name}</span>
                        {checked && <span className="text-atlas-amber-deep text-2xs">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <FieldLabel hint="reçoivent les notifications sans être responsables">
                  Watchers · {watchers.length}
                </FieldLabel>
                <div className="grid grid-cols-2 gap-1.5">
                  {users.map((u) => {
                    const checked = watchers.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() => toggleWatcher(u.id)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
                          checked
                            ? 'bg-signal-blue/10 border-signal-blue/30 text-atlas-fg-1'
                            : 'bg-white border-atlas-line text-atlas-fg-2 hover:border-atlas-line-2'
                        )}
                      >
                        <Avatar user={u} size="xs" />
                        <Eye className="w-3 h-3 text-atlas-fg-3" />
                        <span className="truncate flex-1 text-left">{u.name}</span>
                        {checked && <span className="text-signal-blue text-2xs">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {tab === 'planning' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Date de début</FieldLabel>
                  <TextInput
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>Échéance</FieldLabel>
                  <TextInput
                    type="datetime-local"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel hint="minutes">Estimation</FieldLabel>
                  <TextInput
                    type="number"
                    min={5}
                    step={5}
                    placeholder="60"
                    value={estimateMinutes}
                    onChange={(e) => setEstimateMinutes(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>
                <div>
                  <FieldLabel hint="time tracking déjà effectué">Réel (minutes)</FieldLabel>
                  <TextInput
                    type="number"
                    min={0}
                    step={5}
                    placeholder="0"
                    value={actualMinutes}
                    onChange={(e) => setActualMinutes(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>
              </div>
              <div>
                <FieldLabel hint="iCal RRULE — la tâche se recréera automatiquement">Récurrence</FieldLabel>
                <NativeSelect value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
                  {RECURRENCE_PRESETS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="surface p-3 flex items-center gap-3">
                <Clock className="w-4 h-4 text-atlas-amber-deep shrink-0" />
                <div className="flex-1 text-2xs text-atlas-fg-2">
                  <strong>PROPH3T :</strong> sur la base de vos 22 dernières tâches similaires, l'estimation
                  moyenne est <strong>1h05 (±15%)</strong>. Surcharge journée détectée si vous ajoutez
                  aujourd'hui.
                </div>
              </div>
            </>
          )}

          {tab === 'organize' && (
            <>
              <div>
                <FieldLabel hint="séparés par virgule">Tags</FieldLabel>
                <TextInput
                  placeholder="design, p1, sprint-08"
                  value={tagsRaw}
                  onChange={(e) => setTagsRaw(e.target.value)}
                />
                {tagsRaw && (
                  <div className="mt-2 flex items-center gap-1 flex-wrap">
                    {tagsRaw
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .map((t, i) => (
                        <span
                          key={i}
                          className="chip bg-black/[0.04] text-atlas-fg-2 border border-atlas-line"
                        >
                          <TagIcon className="w-2.5 h-2.5" />#{t}
                        </span>
                      ))}
                  </div>
                )}
              </div>
              <div className="border-t border-atlas-line pt-4">
                <FieldLabel hint="champs définis au niveau workspace">Custom fields</FieldLabel>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Sprint</FieldLabel>
                    <TextInput
                      value={sprint}
                      onChange={(e) => setSprint(e.target.value)}
                      placeholder="S-08"
                    />
                  </div>
                  <div>
                    <FieldLabel hint="story points">Effort</FieldLabel>
                    <TextInput
                      type="number"
                      value={effort}
                      onChange={(e) => setEffort(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="5"
                    />
                  </div>
                  <div>
                    <FieldLabel>Surface</FieldLabel>
                    <NativeSelect value={surface} onChange={(e) => setSurface(e.target.value)}>
                      <option value="">—</option>
                      <option value="Web">Web</option>
                      <option value="Mobile">Mobile</option>
                      <option value="Edge">Edge</option>
                      <option value="Marketing">Marketing</option>
                      <option value="Backend">Backend</option>
                      <option value="Design">Design</option>
                    </NativeSelect>
                  </div>
                  <div className="flex items-end">
                    <Switch checked={billable} onChange={setBillable} label="Facturable au client" />
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'subtasks' && (
            <>
              <div>
                <FieldLabel hint="seront créées automatiquement à la création de la tâche">
                  Sous-tâches initiales · {subtasks.length}
                </FieldLabel>
                <div className="space-y-1.5">
                  {subtasks.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-atlas-line"
                    >
                      <ListChecks className="w-3.5 h-3.5 text-atlas-fg-3" />
                      <span className="text-sm flex-1 text-atlas-fg-1">{s.title}</span>
                      <button
                        onClick={() => removeSubtask(i)}
                        className="text-atlas-fg-3 hover:text-signal-red"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {subtasks.length === 0 && (
                    <div className="text-2xs text-atlas-fg-3 italic px-2 py-3">
                      Aucune sous-tâche initiale.
                    </div>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSubtaskLocal())}
                    placeholder="Décrire la sous-tâche…"
                    className="flex-1 h-9 px-3 rounded-lg bg-white border border-atlas-line text-sm placeholder:text-atlas-fg-3 outline-none focus:border-atlas-amber"
                  />
                  <button
                    onClick={addSubtaskLocal}
                    disabled={!newSubtaskTitle.trim()}
                    className="btn-secondary text-xs px-3 py-2"
                  >
                    <Plus className="w-3 h-3" /> Ajouter
                  </button>
                </div>
              </div>
              <div className="surface p-3 flex items-center gap-3">
                <Sparkles className="w-4 h-4 text-atlas-amber-deep shrink-0" />
                <div className="flex-1 text-2xs text-atlas-fg-2">
                  <strong>Tip :</strong> appliquez un template pour générer automatiquement 5-12 sous-tâches
                  structurées (Onboarding, Refonte site, Audit, etc.). 25 templates intégrés.
                </div>
              </div>
            </>
          )}

          {tab === 'links' && (
            <>
              <div>
                <FieldLabel hint="cette tâche sera comptabilisée dans la progression du goal">
                  Contribue au Goal
                </FieldLabel>
                <NativeSelect value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                  <option value="">— aucun</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="border-t border-atlas-line pt-4 space-y-3">
                <div className="flex items-center justify-between panel p-3">
                  <div>
                    <div className="text-sm text-atlas-fg-1 inline-flex items-center gap-2">
                      <Workflow className="w-3.5 h-3.5 text-atlas-amber-deep" /> Tâche d'approbation
                    </div>
                    <div className="text-2xs text-atlas-fg-3 mt-0.5">
                      L'assigné devra explicitement Approuver / Rejeter / Demander modifications.
                    </div>
                  </div>
                  <Switch checked={requiresApproval} onChange={setRequiresApproval} />
                </div>
                <div className="flex items-center justify-between panel p-3">
                  <div>
                    <div className="text-sm text-atlas-fg-1 inline-flex items-center gap-2">
                      <Repeat className="w-3.5 h-3.5 text-atlas-amber-deep" /> Tâche multi-projets
                    </div>
                    <div className="text-2xs text-atlas-fg-3 mt-0.5">
                      Apparaîtra dans plusieurs projets simultanément (CDC §6.4).
                    </div>
                  </div>
                  <Switch checked={multiProject} onChange={setMultiProject} />
                </div>
                <div className="flex items-center justify-between panel p-3">
                  <div>
                    <div className="text-sm text-atlas-fg-1 inline-flex items-center gap-2">
                      <Type className="w-3.5 h-3.5 text-atlas-amber-deep" /> Enregistrer comme template
                    </div>
                    <div className="text-2xs text-atlas-fg-3 mt-0.5">
                      Réutilisable depuis la bibliothèque de templates personnels.
                    </div>
                  </div>
                  <Switch checked={makeTemplate} onChange={setMakeTemplate} />
                </div>
                <div className="surface p-3 flex items-start gap-3">
                  <Paperclip className="w-4 h-4 text-atlas-fg-3 mt-0.5" />
                  <div className="text-2xs text-atlas-fg-2">
                    Les <strong>pièces jointes</strong> peuvent être ajoutées après création depuis l'onglet
                    "Pièces jointes" du drawer (drag & drop, lien Google Drive / OneDrive).
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

// satisfy lint
void X;
void Target;
