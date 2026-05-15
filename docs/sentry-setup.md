# Sentry — error monitoring setup

> Pourquoi Sentry : sans ça, quand un client paie 15 000 FCFA/mois et que
> l'app crashe chez lui, **tu ne le sais pas**. Il râle, il churn, tu
> perds un client. Avec Sentry, tu reçois la stack trace en 30 sec et tu
> peux corriger avant qu'il s'en rende compte.

## Étape 1 — Créer le compte Sentry

1. https://sentry.io/signup/ → compte gratuit (5 000 events / mois, large pour démarrer)
2. **Create Project** → **React** comme platform
3. Project name : `cockpit-journey-web`
4. Note la **DSN** affichée à la fin (format `https://abc...@o123.ingest.sentry.io/456`)

## Étape 2 — Configurer Vercel

Aller dans https://vercel.com/dashboard → `cockpit-journey` → **Settings → Environment Variables**

Ajouter pour **Production** :

| Variable | Valeur |
|---|---|
| `VITE_SENTRY_DSN` | (la DSN copiée à l'étape 1) |
| `VITE_RELEASE_SHA` | `$VERCEL_GIT_COMMIT_SHA` |

`$VERCEL_GIT_COMMIT_SHA` est une variable d'env injectée automatiquement par Vercel à chaque build — chaque déploiement aura un tag unique dans Sentry. Tu pourras filtrer les crashes "post-deploy v1.2.3".

Optionnel : ajouter aussi sur **Preview** (branches non-`main`) si tu veux capturer les crashes des PR.

Redéployer (un nouveau commit suffit, ou « Redeploy » manuel) pour que les env vars soient prises en compte.

## Étape 3 — Vérifier que ça remonte

Une fois redéployé, ouvre l'app, fais un truc qui crashait avant (par
ex. wipe puis ouvre un projet). Si rien ne crashe, force un test :

Dans la console DevTools :
```js
throw new Error('test sentry from production');
```

Va sur Sentry.io → **Issues**. Tu devrais voir le test arriver en ~10 sec
avec :
- La stack trace minifiée
- Le navigateur, OS, URL, viewport
- Le tag `user.id` = les 8 premiers caractères de ton auth_user_id (pas l'email — RGPD-safe)
- Le tag `release` = ton SHA de commit

## Comment c'est intégré dans le code

| Endroit | Comportement |
|---|---|
| `src/lib/monitoring.ts` | Init unique, scrub des secrets (`gsk_*`, `sk-*`, JWTs, PATs), filtre du bruit (refresh tokens, ResizeObserver…) |
| `src/main.tsx` | `initMonitoring()` appelé au boot. `window.error` + `unhandledrejection` forwarded |
| `src/components/ErrorBoundary.tsx` | Chaque crash React → Sentry avec component stack + pathname |
| `src/stores/appStore.ts` (`hydrate`) | `setMonitoringUser(authUserId)` au signin, `setMonitoringUser(null)` au signout |
| `src/stores/appStore.ts` (`goOffline`) | Erreur explicite remontée quand Supabase est unreachable en prod |

## Filtres anti-bruit (déjà actifs)

Ces patterns sont **silencés** avant d'arriver à Sentry — n'encombrent
pas le dashboard :

- `Refresh Token Not Found` / `Invalid Refresh Token` (tokens expirés, déjà géré par `supabase-js`)
- `ResizeObserver loop limit exceeded` (Chrome interne, pas un vrai bug)
- `Failed to fetch dynamically imported module` (stale chunks pendant un deploy, auto-recover dans `ErrorBoundary`)
- Toute erreur originaire de `chrome-extension:` / `moz-extension:` / `safari-extension:` (extensions tierces)

Si une autre source de bruit apparaît, l'ajouter dans `NOISE_PATTERNS`
dans `src/lib/monitoring.ts`.

## Sécurité : scrub des secrets

Avant tout envoi à Sentry, on regex-replace les secrets dans l'event :
- `gsk_*` (clés Groq)
- `sk-*` (clés OpenRouter / Anthropic)
- `eyJ*` (JWT — anon keys Supabase, tokens auth)
- `sbp_*` (PATs Cockpit)

Donc même si une exception capture en stack trace un objet `{ apiKey:
'gsk_xxx' }`, Sentry voit `[REDACTED]`.

## Coût

- **0 €** jusqu'à 5 000 events / mois
- **26 € / mois** (Team plan) pour 50 000 events / mois si tu dépasses

Pour CockpitJourney commercial avec disons 50 utilisateurs actifs, tu
seras très très loin du free tier (sauf si tu déploies une régression
qui crashe tout le monde — et là tu seras bien content d'avoir Sentry
pour t'en rendre compte).

## Désactiver Sentry en local

Si tu veux tester sans envoyer d'events depuis `localhost` :

```bash
# .env.local
VITE_SENTRY_DSN=
```

Vide = Sentry no-op. La DSN n'est lue qu'au boot, donc redémarrer le
`npm run dev`.

## Tracing / Replay (désactivés par défaut)

Le SDK supporte aussi :
- **Performance tracing** — mesure les requêtes Supabase, render React
- **Session Replay** — vidéo de la session juste avant le crash

Les deux sont à **0 % de sampling** par défaut dans `monitoring.ts`
parce que :
- Tracing : on n'a pas encore les ressources pour analyser les traces
- Replay : risque de capturer la clé API Groq tapée dans Settings, à
  configurer prudemment quand on activera

Quand tu voudras les activer, modifier les options `tracesSampleRate` /
`replaysOnErrorSampleRate` dans `src/lib/monitoring.ts`.
