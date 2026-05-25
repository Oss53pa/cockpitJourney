-- Bucket Storage prive pour les pieces jointes du module Budget
-- (devis, factures, recus). Chemin : <auth.uid()>/<project>/<entity>/<file>.
-- RLS : chaque utilisateur n'accede qu'a ses propres fichiers (1er segment
-- du chemin = son auth.uid()). Bucket prive -> lecture via signed URLs.

insert into storage.buckets (id, name, public, file_size_limit)
values ('cj-budget', 'cj-budget', false, 10485760)
on conflict (id) do nothing;

create policy "cj_budget_owner_read" on storage.objects for select
  using (bucket_id = 'cj-budget' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cj_budget_owner_insert" on storage.objects for insert
  with check (bucket_id = 'cj-budget' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cj_budget_owner_update" on storage.objects for update
  using (bucket_id = 'cj-budget' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cj-budget' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cj_budget_owner_delete" on storage.objects for delete
  using (bucket_id = 'cj-budget' and (storage.foldername(name))[1] = auth.uid()::text);
