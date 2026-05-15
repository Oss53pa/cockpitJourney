# Mise en place d'un environnement de staging

> **Pourquoi maintenant ?** Tant que tu es seule sur la prod, tu peux casser
> et réparer en direct. Le jour où tu auras 5+ utilisateurs payants, casser
> la prod = perdre du chiffre. Un staging te laisse tester les migrations,
> les nouvelles features et les changements d'email avant de toucher à la
> vraie base de données.

## Architecture cible

```
┌──────────────────────┐         ┌──────────────────────┐
│  Vercel preview      │         │  Vercel production   │
│  (branche staging)   │         │  (branche main)      │
│                      │         │                      │
│  VITE_SUPABASE_URL = │         │  VITE_SUPABASE_URL = │
│  staging-project.    │         │  vgtmljfayiysuvrcmunt│
│  supabase.co         │         │  .supabase.co        │
└──────────┬───────────┘         └──────────┬───────────┘
           │                                │
           ▼                                ▼
┌──────────────────────┐         ┌──────────────────────┐
│ Supabase staging     │         │ Supabase prod        │
│ projet dédié         │         │ projet partagé Atlas │
│ — tes données test   │         │ — données réelles    │
│ — tu peux wiper      │         │ — sacré              │
└──────────────────────┘         └──────────────────────┘
```

## Étape 1 — Créer le projet Supabase staging

1. Va sur https://supabase.com/dashboard → **New project**
2. Organisation : **Atlas Studio** (celle qui héberge déjà la prod)
3. Nom : `cockpitjourney-staging`
4. Database password : génère et stocke dans 1Password / Bitwarden
5. Région : **Frankfurt (eu-central-1)** — même que la prod pour éviter les écarts de latence
6. Plan : **Free** (suffit, tu peux upgrade plus tard)
7. Attends la création (~2 min)

Une fois créé, note dans tes variables d'env locales :
- **Project URL** : `https://<staging-ref>.supabase.co`
- **anon public key** : Settings → API → Project API keys → `anon` `public`
- **Project ref** : les 20 caractères dans l'URL

## Étape 2 — Rejouer toutes les migrations sur staging

Deux options :

### Option A — Via la CLI Supabase (recommandé long-terme)

```bash
npm install -g supabase
supabase login                                  # 1 fois par machine
supabase link --project-ref <staging-ref>      # link le repo au projet staging
supabase db push                                # rejoue supabase/migrations/*.sql
```

### Option B — Via l'éditeur SQL Supabase (rapide, manuel)

Pour chaque fichier dans `supabase/migrations/` (par ordre alphabétique) :
1. Ouvre le SQL Editor du projet staging
2. Copie le contenu du fichier
3. Run

Aujourd'hui ça représente :
- `20260514161923_backfill_project_section_folder.sql`
- `20260515054829_mark_onboarding_done_for_existing_users.sql`

Et les **migrations initiales** créant les tables `cj_*` — qui n'existent
pas encore dans `supabase/migrations/` parce qu'elles ont été créées
directement via le dashboard Supabase quand on a démarré le projet. Tu
peux les exporter en `pg_dump` du projet prod :

```bash
# Export le schéma de prod (pas les données)
supabase db dump --linked --schema public --schema-only > supabase/migrations/00000000000000_initial_schema.sql
```

Et tu commits ce dump. Maintenant `supabase db push` sur staging recrée
toute la structure depuis zéro.

## Étape 3 — Configurer Vercel

1. Va sur https://vercel.com/dashboard → projet `cockpit-journey`
2. **Settings → Git → Production branch** : reste sur `main`
3. **Settings → Domains** : ajoute `staging.cockpit-journey.atlas-studio.org` lié à la branche `staging`
4. **Settings → Environment Variables** :
   - **Production** (branche `main`) :
     - `VITE_SUPABASE_URL` = `https://vgtmljfayiysuvrcmunt.supabase.co`
     - `VITE_SUPABASE_ANON_KEY` = (la clé prod existante)
   - **Preview** (branche `staging` + toutes les PR) :
     - `VITE_SUPABASE_URL` = `https://<staging-ref>.supabase.co`
     - `VITE_SUPABASE_ANON_KEY` = la clé staging du Step 1
5. Crée la branche `staging` localement et push :

```bash
git checkout -b staging
git push -u origin staging
```

Vercel détecte la nouvelle branche → build automatique → déploie sur
`staging.cockpit-journey.atlas-studio.org`.

## Étape 4 — Workflow

À partir de là :
1. Tu codes sur `main` localement → tu testes en `localhost:5400` qui pointe sur staging (mets-toi un `.env.local` avec les credentials staging)
2. Quand c'est bon, tu pushes sur `staging` pour que les autres puissent tester :
   ```bash
   git push origin main:staging --force-with-lease
   ```
3. Tu valides sur `staging.cockpit-journey.atlas-studio.org`
4. Tu merges `staging` → `main` pour déclencher le déploiement prod :
   ```bash
   git checkout main
   git merge staging
   git push origin main
   ```

## Étape 5 — Auth emails séparés

Le projet staging va envoyer des emails Supabase Auth (signup, recovery,
magic link) → tu vas recevoir ces mails sur ton vrai inbox.

Deux options :
- **Garder l'inbox réel** pour pouvoir tester le flow complet
- **Configurer un SMTP de test** type Mailtrap : Settings → Auth → SMTP
  Settings dans le dashboard staging Supabase. Les mails sont capturés
  dans une inbox Mailtrap au lieu d'être envoyés.

## Étape 6 — Données de test

Pour éviter de créer un compte manuellement à chaque test, tu peux :

```sql
-- À runner dans le SQL Editor du projet STAGING uniquement (jamais prod)
INSERT INTO cj_profiles (id, auth_user_id, data) VALUES (
  'test_u_demo',
  '00000000-0000-0000-0000-000000000001',
  '{"id":"test_u_demo","name":"Test User","initials":"TU","email":"test@staging.local","role":"admin","color":"#6E8B58"}'::jsonb
);
-- ... + folder + project + tasks selon ce que tu veux tester
```

Mais c'est plus simple de juste passer le flow d'inscription une fois et
de tout reseeder via `wipeDatabase()` / `resetSeed()` quand tu veux
nettoyer.

## Coût

- **Supabase staging Free** : 0 € / mois (limites : 500 MB DB, 1 GB
  bandwidth, 50 MAU — large pour du staging)
- **Vercel staging** : 0 € (inclus dans le Hobby plan jusqu'à ~6000 build
  min/mois)

Donc **0 € de coût supplémentaire**. La seule chose qui coûte = ton temps
de setup (~1h une bonne fois).

## Quand le faire ?

Le seuil que je te recommande : **dès que tu signes ton 3e client payant**
(particulier ou entreprise). En dessous, le risque < le coût de setup.
Au-dessus, l'absence de staging te fera perdre plus en bugs prod qu'une
heure de config.
