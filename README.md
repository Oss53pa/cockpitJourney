# CockpitJourney

> Pilotez votre journée. Compagnon quotidien de gestion de tâches et de projets, propulsé par PROPH3T (Atlas Studio).

Version locale prête à l'emploi · Aucun service tiers payant requis · Données stockées dans votre navigateur.

---

## 🚀 Lancer CockpitJourney en local

### Windows
Double-cliquez sur **`start-cockpitjourney.cmd`**.
Il installera les dépendances si nécessaire, compilera l'app, puis ouvrira l'app dans votre navigateur sur `http://localhost:5400`.

### macOS / Linux
```bash
./start-cockpitjourney.sh
```
(Si la première fois : `chmod +x start-cockpitjourney.sh`.)

### Manuel
```bash
npm install        # première fois seulement
npm run build      # compile l'app
npm run start      # ouvre http://localhost:5400 dans le navigateur
```

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

Toutes les données (tâches, projets, goals, notes, paramètres, clé API) sont stockées **dans le `localStorage` de votre navigateur**, pas sur un serveur.

- Refresh navigateur = données conservées
- Vider le cache navigateur ou cliquer **Paramètres → Réinitialiser** = retour aux données seed par défaut
- Données isolées par navigateur et par profil (un Chrome ≠ un Firefox ≠ un mode incognito)

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
- **Zustand** + persist middleware (localStorage)
- **dnd-kit** (drag & drop Kanban)
- **Lucide React** (iconographie)
- **Service Worker** (offline-first)
- **Groq / OpenRouter / Ollama** (PROPH3T — optionnel)

---

## 📂 Architecture

```
src/
├── App.tsx                 # Shell + routing + lazy-load des vues
├── main.tsx                # Bootstrap + SW + error handlers
├── stores/appStore.ts      # État global Zustand (tasks, projects, goals, ...)
├── lib/
│   ├── proph3t.ts          # Client IA (Groq/OpenRouter/Ollama)
│   └── utils.ts            # Helpers (cn, format dates, ...)
├── components/
│   ├── layout/             # Sidebar, TopBar, CommandMenu
│   ├── views/              # TodayView, ProjectView, GoalsView, ...
│   ├── modals/             # ModalRoot + 10 modales métier
│   ├── ui/                 # Primitives (Modal, Menu, Field, Toast, ...)
│   └── TaskDetailDrawer.tsx
├── data/mockData.ts        # Données seed (utilisateurs, projets, tâches)
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
Ou en cas de blocage : ouvrez la console (F12) → `localStorage.clear(); location.reload();`

---

## 📜 Licence

Propriétaire — Atlas Studio · Pamela Atokouna · 2026.
13e produit du catalogue Atlas Studio.
