# CockpitJourney

> Pilotez votre journée. Compagnon quotidien de gestion de tâches et de projets, propulsé par PROPH3T (Atlas Studio).

Backend cloud Supabase · Auth magic-link · IA gratuite (Groq).

---

## 🚀 Mise en route

### 1. Configurer Supabase

CockpitJourney utilise un projet Supabase pour la persistance et l'authentification (magic link e-mail).

```bash
cp .env.example .env.local
```

Puis remplissez `.env.local` avec **vos** valeurs :

```
VITE_SUPABASE_URL=https://<votre-projet>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...   # ou la legacy anon key
```

> Le schéma cloud (`cj_*`) est appliqué via les migrations Supabase de ce dépôt — voir `supabase/migrations/` (à créer pour un nouveau projet) ou réutilisez le projet Atlas Studio existant si vous y avez accès.

### 2. Lancer

**Windows** — double-cliquez sur `start-cockpitjourney.cmd`.
**macOS/Linux** — `./start-cockpitjourney.sh`.

**Manuel** :
```bash
npm install        # première fois seulement
npm run dev        # mode dev avec HMR sur http://localhost:5400
# OU
npm run build && npm run start   # mode production
```

### 3. Se connecter

À la première ouverture, vous arrivez sur l'écran de login → entrez votre adresse e-mail → Supabase vous envoie un **lien magique**. Cliquez dessus, vous êtes connectée. Aucun mot de passe à retenir.

> Sur la première connexion, la base est automatiquement peuplée avec un jeu de données démo (Pamela, projets Cockpit/Cosmos/SOAP/Brand, ~30 tâches, goals, automations…). Vous reprenez le contrôle de cette identité de démonstration et tout devient persistant côté Supabase.

---

## 📦 Scripts disponibles

| Commande | Effet |
|---|---|
| `npm run dev` | Mode développement avec HMR (port 5400) |
| `npm run dev:host` | Mode développement accessible sur le réseau local (LAN) |
| `npm run build` | Compile la version production dans `dist/` |
| `npm run preview` | Sert `dist/` sur le port 5400 |
| `npm run preview:host` | Idem mais accessible sur le LAN |
| `npm run start` | Sert `dist/` et ouvre le navigateur |
| `npm run start:fresh` | Rebuild + start (à utiliser après mise à jour du code) |
| `npm run type-check` | Vérifie les types TypeScript |
| `npm run lint` | Lance ESLint |
| `npm run test` | Lance les tests unitaires (Vitest) |

---

## ✨ Activer PROPH3T (IA)

PROPH3T est l'IA d'Atlas Studio — par défaut elle fonctionne en mode mock (toasts simulés). Pour activer la vraie génération :

1. Créez un compte gratuit sur **[console.groq.com](https://console.groq.com/keys)** (30 secondes, sans carte bancaire)
2. Générez une clé API (`gsk_...`)
3. Dans CockpitJourney, ouvrez **Paramètres → IA → Clé API**, collez la clé
4. Le modèle par défaut est `llama-3.3-70b-versatile` (gratuit, très rapide)

Capacités IA actives :
- **Daily Brief** (TodayView · "Régénérer le brief")
- **Parsing langage naturel** (capture rapide TodayView)
- **Reformulation description** (drawer tâche → menu PROPH3T)
- **Suggestion tâches contributrices** (Goals → "Suggérer tâches PROPH3T")
- **Narration de rapport** (visionneuse rapport → "Générer narration IA")

Alternatives gratuites supportées : OpenRouter (free models) ou Ollama auto-hébergé.

---

## 💾 Données

Toutes les données (tâches, projets, goals, notes, paramètres) sont stockées dans **Supabase Postgres** (préfixe `cj_*` du schéma `public` du projet Atlas Studio). 18 tables, RLS activée, accès limité aux utilisateurs authentifiés.

Architecture :
- **Auth** — Supabase magic-link (email OTP, sans mot de passe)
- **Persistance** — chaque table `cj_*` est un schéma hybride : colonnes indexées (id, project_id, status…) + colonne `data jsonb` contenant l'entité complète
- **Bootstrap** — au login, le store Zustand charge tout en mémoire (`loadSnapshot`) puis chaque mutation est write-through vers Supabase
- **Seed** — déclenché une seule fois (cj_profiles vide), populate ~30 tâches / 4 projets / goals / automations

Réinitialiser : **Paramètres → Données → Réinitialiser** vide les tables `cj_*` et relance le seed.

---

## 📱 Installation comme application (PWA)

Une fois `npm run start` lancé :

- **Chrome / Edge** : icône d'installation dans la barre d'URL → "Installer CockpitJourney"
- **Safari iOS** : Partager → Ajouter à l'écran d'accueil
- L'app fonctionne **hors ligne** une fois installée (Service Worker actif en mode prod)

---

## ⌨️ Raccourcis clavier

| Combinaison | Action |
|---|---|
| `⌘ K` / `Ctrl K` | Palette de commandes |
| `⌘ ⇧ T` / `Ctrl ⇧ T` | Capture rapide d'une tâche |
| `?` | Afficher tous les raccourcis |
| `Esc` | Fermer modale / drawer / palette |

---

## 🛠️ Pile technique

- **React 18** + **TypeScript 5** + **Vite 5**
- **Tailwind CSS 3** (charte Atlas : sage `#6E8B58` + cream `#F4F2E9`)
- **Zustand** (cache mémoire, hydraté depuis Supabase)
- **Supabase** (Postgres + Auth magic-link + RLS)
- **dnd-kit** (drag & drop Kanban)
- **Lucide React** (iconographie)
- **Service Worker** (PWA installable)
- **Groq / OpenRouter / Ollama** (PROPH3T — optionnel)

---

## 📂 Architecture

```
src/
├── App.tsx                 # Shell + auth gate + routing + lazy-load des vues
├── main.tsx                # Bootstrap + SW + error handlers
├── stores/appStore.ts      # État global Zustand (tasks, projects, goals, ...)
├── lib/
│   ├── supabase.ts         # Client Supabase + helpers auth (magic link)
│   ├── repo.ts             # Repo Supabase (loadSnapshot + persist write-through)
│   ├── seed.ts             # Seed first-login + linkAuthUserToProfile
│   ├── proph3t.ts          # Client IA (Groq/OpenRouter/Ollama)
│   └── utils.ts            # Helpers (cn, format dates, ...)
├── components/
│   ├── layout/             # Sidebar, TopBar, CommandMenu
│   ├── views/              # TodayView, ProjectView, LoginView, ...
│   ├── modals/             # ModalRoot + 10 modales métier
│   ├── ui/                 # Primitives (Modal, Menu, Field, Toast, ...)
│   └── TaskDetailDrawer.tsx
├── data/mockData.ts        # Données seed initiales (un seul shot)
└── types/index.ts          # Types TypeScript
```

---

## 🐛 Dépannage

**Le port 5400 est occupé :**
Modifiez `vite.config.ts` ligne `port: 5400` → un autre port libre.

**Les fonts ne se chargent pas :**
Le navigateur a besoin d'accès Internet pour Google Fonts (Dosis + Grand Hotel + JetBrains Mono). Pour 100% offline, hébergez les fonts en local.

**PROPH3T ne répond pas :**
- Vérifiez votre clé API dans Paramètres → IA
- Vérifiez votre connexion Internet (Groq est cloud)
- Ouvrez la console navigateur (F12) pour voir l'erreur exacte

**Réinitialiser complètement :**
```
Paramètres → Données → Réinitialiser
```
(Vide les tables `cj_*` côté Supabase, puis relance le seed initial.)

**Le login ne marche pas :**
- Vérifiez que `.env.local` est bien rempli et que vous avez **redémarré** le serveur Vite (les variables `VITE_*` sont lues au démarrage)
- Vérifiez que l'email de magic link n'est pas dans vos spams
- Côté Supabase, vérifiez que le redirect URL `http://localhost:5400` est autorisé : Authentication → URL Configuration → Redirect URLs

---

## 📜 Licence

Propriétaire — Atlas Studio · Pamela Atokouna · 2026.
13e produit du catalogue Atlas Studio.
