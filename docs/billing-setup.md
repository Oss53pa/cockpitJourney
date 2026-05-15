# Facturation — architecture centralisée Atlas Studio

> CockpitJourney ne **gère pas** la facturation directement. Tout est
> centralisé sur le **portail Atlas Studio** (`atlas-studio.org/portal`)
> qui sert AUSSI Cockpit F&A, Atlas Compta, TableSmart, et les autres
> produits de l'écosystème.

## Architecture

```
┌─────────────────────────────────┐
│  CockpitJourney (cette app)    │
│  ──────────────────────────────│
│  - LIT subscriptions table     │
│  - REDIRIGE vers Atlas portal  │
│    pour souscrire / gérer      │
│  - GATE les features payantes  │
│    selon `isSubscriptionActive`│
└──────────────┬──────────────────┘
               │ Lecture seule
               ▼
┌─────────────────────────────────┐
│  Supabase: `subscriptions`     │
│  table partagée Atlas Studio   │
│  - RLS: auth.uid() = user_id   │
│  - app_id filtre par produit   │
└──────────────▲──────────────────┘
               │ Insert / Update
               │ via webhooks
┌──────────────┴──────────────────┐
│  Atlas Studio portal           │
│  (atlas-studio.org/portal)     │
│  - Checkout (Stripe + CinetPay)│
│  - Customer portal             │
│  - Changement de plan          │
│  - Annulation                  │
│  - Factures + reçus            │
│  - Codes promo                 │
└─────────────────────────────────┘
```

## Côté CockpitJourney — surface minimale

Tout est dans `src/lib/billing.ts` + `src/components/modals/BillingSection.tsx` :

| Fonction | Rôle |
|---|---|
| `getCurrentSubscription()` | SELECT depuis `subscriptions` filtré par `app_id='cockpit-journey'` |
| `isSubscriptionActive(s)` | Booléen pour gater des features (`active` ou `trialing`) |
| `atlasPortalUrl(action)` | Construit l'URL `atlas-studio.org/portal?app=cockpit-journey&action=subscribe\|manage` |
| `formatXof(amount)` | Affiche `15 000 FCFA` (espace fine entre milliers) |
| `PLANS` | Liste statique des 3 plans (Particulier / Équipe / Entreprise) — info only |

**Pas** de `startCheckout`, `openCustomerPortal`, `changePlan`,
`cancelSubscription` — ces actions sont déléguées au portail externe.

## Côté Atlas Studio — déjà déployé

Edge Functions sur le projet `vgtmljfayiysuvrcmunt` :
- `create-checkout` (Stripe, en XOF natif)
- `cinetpay-checkout` (Orange Money / Wave / MTN / Moov + cartes, `channels: "ALL"`)
- `stripe-webhook` (active la sub à `checkout.session.completed`)
- `cinetpay-webhook` (active la sub à confirmation CinetPay)
- `portal-session` (Stripe Customer Portal)
- `change-plan` (pro-raté serveur)
- `cancel-subscription` (annulation fin de période)
- `subscription-cron` (lifecycle: expirations, renouvellements, notifs)

Toutes prennent `appId='cockpit-journey'` pour scoper.

## Pricing (config dans `apps` table)

| Plan | Tarif | Période | Cible |
|---|---|---|---|
| Particulier | **15 000 FCFA** | / mois | 1 user — solo |
| Équipe | **15 000 FCFA** | / mois forfait | ≤10 collaborateurs |
| Entreprise | **Sur devis** | 10 000 FCFA / user > 10 / mois | Au-delà 10 |

Modifier :
```sql
UPDATE apps SET pricing = '{...}'::jsonb WHERE id = 'cockpit-journey';
```

## Flow utilisateur

```
1. User ouvre Settings → Facturation
2. CockpitJourney lit `subscriptions` table (RLS = sa propre row)
3. Affiche son état :
   ─ Pas de sub → "Voir les plans sur Atlas Studio"
   ─ Sub active → "Plan actuel · Particulier · prochain prélèvement 15/06"
                  + bouton "Gérer sur Atlas Studio"
   ─ Past_due → bandeau rouge + bouton "Mettre à jour sur Atlas Studio"
4. Click sur le bouton → window.open(atlasPortalUrl(), '_blank')
5. Sur Atlas Studio portal :
   ─ User choisit Stripe ou CinetPay
   ─ User choisit son moyen de paiement (CB / Orange Money / Wave / ...)
   ─ User paie
   ─ Webhook met à jour `subscriptions` table
6. User revient dans CockpitJourney
   ─ Au prochain reload, BillingSection lit la sub mise à jour
```

## Moyens de paiement supportés (côté Atlas Studio)

Via **Stripe XOF** :
- Visa, Mastercard internationales

Via **CinetPay** (`channels: "ALL"`) :
- Orange Money (Côte d'Ivoire, Sénégal, Burkina, Mali…)
- Wave (Côte d'Ivoire, Sénégal)
- MTN Mobile Money
- Moov Money
- Free Money
- Cartes Visa / Mastercard locales (CIB, etc.)

Via **virement / activation manuelle** :
- L'admin Atlas Studio active manuellement via SQL ou la console admin

## Quand un nouveau user veut souscrire

```sql
-- L'INSERT vient du webhook Atlas Studio, pas de CockpitJourney :
INSERT INTO subscriptions (
  user_id, app_id, plan, status, payment_method,
  current_period_start, current_period_end, activated_at
) VALUES (
  '<user-uuid>', 'cockpit-journey', 'particulier', 'active',
  'stripe', -- ou 'cinetpay' ou 'manual'
  now(), now() + interval '1 month', now()
);
```

Si tu dois activer manuellement (paiement par virement reçu hors-app) :

```sql
-- Activation manuelle pour un user qui a payé par virement bancaire
INSERT INTO subscriptions (
  user_id, app_id, plan, status, payment_method,
  current_period_start, current_period_end, activated_at,
  is_granted, granted_by
) VALUES (
  '<user-uuid>',
  'cockpit-journey',
  'equipe',
  'active',
  'manual',
  now(),
  now() + interval '1 month',
  now(),
  true,
  '<your-admin-uuid>'
);
```

## Côtés à surveiller

1. **`atlas-studio.org/portal` doit accepter `?app=cockpit-journey`** —
   le portail centralisé doit savoir router vers les plans CockpitJourney
   quand on lui passe cet `app_id`. Vérifier côté frontend Atlas Studio.

2. **Cookies / SSO** — l'user est censé être connecté sur Atlas Studio
   via le même `auth.users` que CockpitJourney (même projet Supabase).
   Si le SSO Atlas Studio (Edge Function `atlas-sso` existante) est
   bien en place, l'user n'a pas à se reconnecter sur le portail.

3. **Retour vers CockpitJourney** — le portail Atlas Studio doit
   permettre à l'user de revenir sur `cockpit-journey.atlas-studio.org`
   après son paiement. À configurer dans le `success_url` du checkout
   Atlas Studio.

## Pourquoi cette architecture ?

- **Single source of truth** : 1 endroit pour gérer les abonnements à
  tous les produits Atlas
- **1 facture, plusieurs apps** : un client qui prend CockpitJourney +
  Cockpit F&A reçoit UNE facture mensuelle, pas deux
- **Conformité** : 1 entité légale (Atlas Studio SAS) émet les factures
- **DRY** : Stripe + CinetPay + Customer Portal codés UNE fois
- **Évolutif** : pour ajouter un nouveau produit Atlas, juste un row
  dans `apps`, pas de redéploiement billing

## Limites connues

- La facturation est **mensuelle uniquement** — pas de plan annuel
  pré-payé pour l'instant (ajout futur dans `billing_cycle` column).
- Les codes promo sont supportés par Stripe checkout mais pas par
  CinetPay (CinetPay les ignore silencieusement). À harmoniser côté
  Atlas Studio.
- Pas de pro-ration côté CinetPay quand on change de plan en milieu
  de période — Stripe le fait automatiquement.
