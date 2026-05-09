# Branding Auth e-mails — multi-app Atlas Studio

> Ce que les apps **Cockpit F&A**, **TableSmart**, **Advist**, **AtlasBanx**, **Liass'Pilot**, **Atlas F&A** doivent ajouter pour que leurs e-mails de connexion / signup / reset password portent leur propre branding au lieu de "Atlas Studio" générique.

## Contexte

Le projet Supabase `vgtmljfayiysuvrcmunt` est partagé par les **7 apps Atlas Studio**. Les templates Auth (magic_link, confirmation, recovery, email_change, reauthentication) sont **uniques au niveau du projet** — pas configurables par app.

Solution : les templates Go-template branchent sur `{{ .Data.app }}` qui pointe sur `auth.users.raw_user_meta_data.app`. Chaque app doit garantir que ce champ soit à jour pour ses users.

```
{{ if eq .Data.app "CockpitJourney" }}
  → wordmark Grand Hotel + box PROPH3T
{{ else if .Data.app }}
  → header "ATLAS STUDIO · {{ .Data.app }}" + nom de l'app en Grand Hotel
{{ else }}
  → fallback "Atlas Studio" générique
{{ end }}
```

## Mapping apps Atlas Studio

Valeurs à passer dans `data.app` / `data.app_id` / `data.app_tagline` (alignées sur la table `public.apps`) :

| `app_id` (slug) | `app` (nom complet à afficher) | `app_tagline` |
|---|---|---|
| `cockpit-journey` | `CockpitJourney` | `Pilotez votre journée` |
| `cockpit-fa` | `Cockpit F&A` | `Pilotage financier & reporting SYSCOHADA` |
| `atlas-compta` | `Atlas F&A` | `Finance & Administration` |
| `tablesmart` | `TableSmart` | `Digitalisation complète pour la restauration` |
| `advist` | `Advist` | `Workflow documentaire & signature electronique` |
| `atlasbanx` | `AtlasBanx` | `Audit bancaire intelligent CEMAC / UEMOA` |
| `taxpilot` | `Liass'Pilot` | `Liasse fiscale SYSCOHADA` |

## À ajouter dans chaque app

### 1. Constantes (`lib/supabase.ts` ou équivalent)

```ts
// À adapter selon l'app — ces valeurs DOIVENT correspondre à la table public.apps
export const APP_ID = 'CockpitFnA';      // nom complet (column `apps.name`)
export const APP_SLUG = 'cockpit-fa';    // slug (column `apps.id`)
export const APP_TAGLINE = 'Pilotage financier & reporting SYSCOHADA';
```

### 2. Au signup (passer `data` dans `signUp`)

```ts
await supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      app: APP_ID,
      app_id: APP_SLUG,
      app_tagline: APP_TAGLINE,
      full_name: fullName,
    },
  },
});
```

Si signup OTP :

```ts
await supabase.auth.signInWithOtp({
  email,
  options: {
    shouldCreateUser: true,
    data: { app: APP_ID, app_id: APP_SLUG, app_tagline: APP_TAGLINE },
  },
});
```

### 3. Après chaque login réussi (resync l'app meta)

C'est important pour les users qui jonglent entre plusieurs apps Atlas Studio — sinon le mail suivant peut être taggué pour la mauvaise app.

```ts
const { error } = await supabase.auth.signInWithPassword({ email, password });
if (!error) {
  // Best-effort, ne bloque pas la redirection
  void supabase.auth.updateUser({
    data: { app: APP_ID, app_id: APP_SLUG, app_tagline: APP_TAGLINE },
  });
}
```

### 4. Helper réutilisable (optionnel)

```ts
// lib/atlasAppMeta.ts
import { supabase } from './supabase';

const META = {
  app: APP_ID,
  app_id: APP_SLUG,
  app_tagline: APP_TAGLINE,
};

/** Assure que raw_user_meta_data contient l'identité de l'app courante. */
export async function syncAppMeta(): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    if (data.user?.user_metadata?.app === APP_ID) return; // déjà sync
    await supabase.auth.updateUser({ data: META });
  } catch {
    /* ignore — le mail aura le branding générique tant que pas resync */
  }
}
```

À appeler dans le bootstrap après détection d'une session active.

## Backfill (déjà fait au 2026-05-09)

Ce SQL a été exécuté une fois pour backfiller tous les users existants. **À ne pas re-run** sauf si de nouveaux users restent sans `data.app` :

```sql
UPDATE auth.users u
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
  'app',         sub.app_name,
  'app_id',      sub.app_id,
  'app_tagline', sub.app_tagline
)
FROM (
  SELECT DISTINCT ON (ls.user_id)
    ls.user_id,
    a.name AS app_name, a.id AS app_id, a.tagline AS app_tagline
  FROM public.licence_seats ls
  JOIN public.licences l ON l.id = ls.licence_id
  JOIN public.products p ON p.id = l.product_id
  JOIN public.apps a ON a.id = p.slug
  WHERE ls.user_id IS NOT NULL AND ls.status = 'active'
  ORDER BY ls.user_id, ls.last_login DESC NULLS LAST, ls.created_at DESC
) sub
WHERE u.id = sub.user_id;
```

## Test

Après avoir déployé les snippets dans une app sister, demande un nouveau code OTP :

```sql
-- Avant : user encore en raw_user_meta_data.app = "Cockpit F&A"
SELECT email, raw_user_meta_data->>'app' FROM auth.users WHERE email = '<test>';

-- Login dans l'app concernée → updateUser fire en arrière-plan
-- Re-query :
SELECT email, raw_user_meta_data->>'app' FROM auth.users WHERE email = '<test>';
```

Le mail suivant aura le bon sujet : `🔐 {App} · Code : 123456`.

## Limitations connues

1. **Multi-app simultané** : si un user login dans Cockpit F&A puis demande un reset password dans CockpitJourney sans refaire login, le reset email partira avec le branding **Cockpit F&A** (le dernier app meta posé). Pour résoudre proprement → Send Email Hook (Edge Function qui intercepte, lit `redirect_to`, brande). Hors scope pour l'instant.

2. **Apps qui n'utilisent pas Supabase Auth** : ce mécanisme ne s'applique qu'aux flows passant par GoTrue (`signUp`, `signInWithOtp`, `signInWithPassword`, `resetPasswordForEmail`). Si une app envoie ses propres mails via Resend en bypassant Supabase Auth, elle gère son branding indépendamment.
