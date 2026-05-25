-- Remappe les statuts de tâche en français (saisis via le connecteur Claude /
-- import en masse) vers l'énumération canonique anglaise TaskStatus de l'app :
--   a_faire → todo · en_cours → in_progress · en_validation → in_review ·
--   termine → done · bloque → blocked
-- Sans cela, ces tâches ne correspondent à AUCUNE colonne du board Kanban et ne
-- s'affichent jamais. On corrige le `data` jsonb (lu par l'app) ET la colonne
-- indexée `status` (utilisée par les filtres MCP).
update public.cj_tasks
set data = jsonb_set(data, '{status}', to_jsonb(m.en)),
    status = m.en
from (values
  ('a_faire', 'todo'),
  ('en_cours', 'in_progress'),
  ('en_validation', 'in_review'),
  ('en_revue', 'in_review'),
  ('termine', 'done'),
  ('terminé', 'done'),
  ('fait', 'done'),
  ('bloque', 'blocked'),
  ('bloqué', 'blocked'),
  ('annule', 'done'),
  ('annulé', 'done')
) as m(fr, en)
where lower(data->>'status') = m.fr or lower(status) = m.fr;
