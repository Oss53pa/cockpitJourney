import { useState } from 'react';
import { useApp } from '../../stores/appStore';
import { Modal } from '../ui/Modal';
import { FieldLabel, NativeSelect, TextInput, Textarea } from '../ui/Field';
import type { Goal } from '../../types';

interface Props {
  initial?: Goal;
  onClose: () => void;
}

export function GoalFormModal({ initial, onClose }: Props) {
  const users = useApp((s) => s.users);
  const goals = useApp((s) => s.goals);
  const create = useApp((s) => s.createGoal);
  const update = useApp((s) => s.updateGoal);

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [level, setLevel] = useState<Goal['level']>(initial?.level ?? 'team');
  const [parentGoalId, setParentGoalId] = useState(initial?.parentGoalId ?? '');
  const [ownerId, setOwnerId] = useState(initial?.ownerId ?? 'u_pame');
  const [period, setPeriod] = useState<Goal['period']>(initial?.period ?? 'quarterly');
  const [metricType, setMetricType] = useState<Goal['metricType']>(initial?.metricType ?? 'percentage');
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
      unit,
      targetValue,
      currentValue,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      status: 'on_track',
      health: 'green',
    };
    if (initial?.id) update(initial.id, payload);
    else create(payload);
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
            <FieldLabel>Valeur actuelle</FieldLabel>
            <TextInput
              type="number"
              value={currentValue}
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
      </div>
    </Modal>
  );
}
