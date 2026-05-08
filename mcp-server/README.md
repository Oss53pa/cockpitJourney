# @atlas-studio/cockpit-journey-mcp

MCP server qui expose **CockpitJourney** comme **18 outils** à n'importe quel client MCP : Claude Cowork, Claude Desktop, Claude Code, runtimes custom.

```
┌─────────────────┐         ┌──────────────────┐         ┌──────────────┐
│  Claude Cowork  │  MCP    │  cockpit-journey │  REST   │   Supabase   │
│  (utilisateur)  │ ◄────►  │     -mcp server  │ ◄────►  │ (cj_* tables)│
└─────────────────┘         └──────────────────┘         └──────────────┘
                                       ↑
                                       │ Auth : Personal Access Token
                                       │ (CockpitJourney → Settings → Integrations)
```

## Installation

```bash
npm install -g @atlas-studio/cockpit-journey-mcp
```

Ou via `npx -y` à la volée — c'est ce que fait Claude Cowork par défaut.

## Configuration

1. Connectez-vous sur [cockpitjourney.app](https://cockpitjourney.app) → **Paramètres → Intégrations** → **Nouveau token**.
2. Copiez le PAT (préfixé `cj_…`) — il ne sera affiché qu'une seule fois.
3. Ajoutez le serveur MCP à votre config Claude :

```json
{
  "mcpServers": {
    "cockpit-journey": {
      "command": "npx",
      "args": ["-y", "@atlas-studio/cockpit-journey-mcp"],
      "env": {
        "CJ_PAT": "cj_xxxxxxxxxxxxxxxx",
        "SUPABASE_URL": "https://vgtmljfayiysuvrcmunt.supabase.co",
        "SUPABASE_ANON_KEY": "<atlas-studio-anon-key>"
      }
    }
  }
}
```

`SUPABASE_URL` et `SUPABASE_ANON_KEY` ont des valeurs par défaut qui pointent sur l'environnement Atlas Studio production — vous n'avez à les surcharger que pour un déploiement self-hosted.

## Architecture d'auth

Le MCP server **ne reçoit jamais** votre session Supabase. Au démarrage il échange le PAT contre un **JWT Supabase temporaire** via la fonction Edge `cj-auth-pat` :

1. PAT → SHA-256 → lookup dans `cj_personal_access_tokens`
2. Validation (pas révoqué, pas expiré, scope demandé OK)
3. Génération d'un magic link admin pour l'user → `verifyOtp` → JWT
4. Le JWT est utilisé pour toutes les queries Supabase côté MCP (RLS appliqué normalement)
5. Refresh automatique 5 min avant expiration

## Les 18 outils

### 🗂️ Projets (4)
| Tool | Description |
|---|---|
| `cj_list_projects` | Lister les projets avec filtres status/folder |
| `cj_get_project` | Détails complets : projet + sections + tâches + counts |
| `cj_create_project` | Créer un projet (génère slug + id namespaced) |
| `cj_update_project` | Modifier un projet (patch mergé sur `data` jsonb) |

### ✅ Tâches (5)
| Tool | Description |
|---|---|
| `cj_list_tasks` | Lister avec filtres status/projet/échéance/priorité |
| `cj_create_task` | Créer une tâche (project_id optionnel = inbox) |
| `cj_update_task` | Patch sur les champs (priority, due_date, etc.) |
| `cj_complete_task` | Raccourci : status=done + completed_at |
| `cj_add_subtasks` | Ajouter N sous-tâches en lot (bulk insert) |

### 🎯 OKR (3)
| Tool | Description |
|---|---|
| `cj_list_goals` | Lister les OKR + progression calculée (%) |
| `cj_create_goal` | Définir un nouvel OKR (target, unit, due_date, level) |
| `cj_update_goal_progress` | Update current_value + progress_history |

### 💬 Communication (2)
| Tool | Description |
|---|---|
| `cj_add_comment` | Commentaire sur une tâche (+ @mentions) |
| `cj_add_note` | Note markdown attachée à une tâche |

### 👥 Équipe (2)
| Tool | Description |
|---|---|
| `cj_list_team_members` | Liste les seats `licence_seats` avec rôles + stats |
| `cj_invite_member` | Invite un nouveau membre via `invite-user` Edge Function |

### 📊 Vue d'ensemble (2)
| Tool | Description |
|---|---|
| `cj_get_dashboard` | Synthèse exécutive : retards, du jour, OKR on-track, projets actifs |
| `cj_search` | Recherche globale ILIKE sur projets/tâches/notes |

## Permissions par scope

Chaque PAT a un ou plusieurs scopes (`read`, `write`, `admin`) choisis lors de sa création :

| Tool catégorie | `read` seul | `write` | `admin` |
|---|---|---|---|
| `cj_list_*`, `cj_get_*`, `cj_search` | ✅ | ✅ | ✅ |
| `cj_create_*`, `cj_update_*`, `cj_complete_*`, `cj_add_*` | ❌ | ✅ | ✅ |
| `cj_invite_member` | ❌ | ❌ | ✅ |

Ces scopes sont vérifiés par le MCP server avant chaque appel mutant. Les RLS Postgres font une 2e vérification au niveau de la base : un PAT issu d'un `licence_seats.role = 'viewer'` ne pourra pas écrire même si son scope dit `write`.

## Cas d'usage typiques

**Productivité personnelle :**
> *« Claude, qu'est-ce que j'ai à faire aujourd'hui ? »*
→ `cj_get_dashboard()` → top du jour avec priorités

**Préparation de réunion :**
> *« Résume les tâches en retard du projet Refonte site »*
→ `cj_list_tasks({ project_id, due_before: today })` → synthèse

**Capture rapide :**
> *« Crée un projet Lancement v2 avec 6 tâches Backend/Frontend/QA »*
→ `cj_create_project()` puis 6× `cj_create_task()`

**Suivi OKR :**
> *« Mes objectifs trimestriels et leur avancement »*
→ `cj_list_goals({ status: 'active' })` → liste avec progress_pct

## Développement

```bash
git clone https://github.com/Oss53pa/cockpitJourney.git
cd cockpitJourney/mcp-server
npm install
npm run build
CJ_PAT=cj_xxx SUPABASE_ANON_KEY=eyJ... node dist/index.js
```

Pour tester avec un Claude local en pointant sur le build local plutôt que sur npm :

```json
{
  "mcpServers": {
    "cockpit-journey": {
      "command": "node",
      "args": ["/chemin/absolu/vers/cockpitJourney/mcp-server/dist/index.js"],
      "env": { "CJ_PAT": "cj_xxx", "SUPABASE_ANON_KEY": "eyJ..." }
    }
  }
}
```

## Licence

MIT © Atlas Studio
