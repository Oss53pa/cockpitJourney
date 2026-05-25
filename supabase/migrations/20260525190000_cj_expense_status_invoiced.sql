-- Ajoute le 4e statut de dépense « facturée » (invoiced) au cycle de vie :
--   prévue (planned) → engagée (committed) → facturée (invoiced) → payée (paid)
-- La contrainte CHECK inline est nommée par défaut <table>_<colonne>_check.
-- On la remplace pour autoriser la nouvelle valeur, sans toucher au défaut.

alter table public.cj_expenses
  drop constraint if exists cj_expenses_status_check;

alter table public.cj_expenses
  add constraint cj_expenses_status_check
  check (status in ('planned', 'committed', 'invoiced', 'paid'));
