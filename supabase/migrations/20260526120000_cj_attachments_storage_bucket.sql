-- Bucket Storage prive pour les pieces jointes des TACHES (et usages generaux).
-- Chemin : <auth.uid()>/tasks/<task_id>/<file>. RLS identique au bucket budget :
-- chaque utilisateur n'accede qu'a ses propres fichiers (1er segment = auth.uid()).
-- Bucket prive -> lecture via signed URLs.

insert into storage.buckets (id, name, public, file_size_limit)
values ('cj-attachments', 'cj-attachments', false, 52428800)
on conflict (id) do nothing;

create policy "cj_attach_owner_read" on storage.objects for select
  using (bucket_id = 'cj-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cj_attach_owner_insert" on storage.objects for insert
  with check (bucket_id = 'cj-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cj_attach_owner_update" on storage.objects for update
  using (bucket_id = 'cj-attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cj-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cj_attach_owner_delete" on storage.objects for delete
  using (bucket_id = 'cj-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
