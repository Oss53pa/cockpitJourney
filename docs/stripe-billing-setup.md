# Facturation Stripe — setup & opération

> **Bonne nouvelle** : tout le backend Stripe (Edge Functions, webhook,
> table `subscriptions`, Customer Portal) **existe déjà** sur le projet
> Supabase Atlas Studio partagé. CockpitJourney consomme la même infra
> que Cockpit F&A, Atlas Compta, TableSmart, etc. — pas besoin de
> re-déployer quoi que ce soit côté serveur.

## Pricing actuel (déjà configuré dans la table `apps`)

| Plan | Prix | Période | Pour qui |
|---|---|---|---|
| **Particulier** | 15 000 FCFA | / mois | 1 utilisateur — dirigeant solo |
| **Équipe** | 15 000 FCFA | / mois forfait | Jusqu'à 10 collaborateurs inclus |
| **Entreprise** | Sur devis | 10 000 FCFA / utilisateur > 10 / mois | Au-delà de 10 collaborateurs |

Modifiable via SQL :
```sql
UPDATE apps SET pricing = '{...}'::jsonb WHERE id = 'cockpit-journey';
```

## Stripe en XOF (FCFA) — natif

L'Edge Function `create-checkout` crée des prix Stripe en `currency: "xof"`.
Le client voit le montant **directement en FCFA** au checkout — pas de
conversion EUR/USD à mentaliser, pas de surprise.

Cartes acceptées par Stripe XOF : **Visa**, **Mastercard**. Les cartes
locales (CIB, AmEx local) peuvent ne pas passer selon l'émetteur.

## Pour Orange Money / Wave / MTN Mobile Money

**Stripe ne supporte pas** ces moyens de paiement en zone OuestAfricaine.
Deux options :
- **CinetPay** : l'Edge Function `cinetpay-checkout` est déjà déployée
  côté backend partagé Atlas Studio. Il faudra l'activer pour
  CockpitJourney (TODO : un sélecteur "Stripe / CinetPay" dans la page
  Billing).
- **Activation manuelle** : un client te paie par virement / mobile
  money hors-app, tu vas dans le SQL Editor et insères :
  ```sql
  INSERT INTO subscriptions (
    user_id, app_id, plan, status, payment_method,
    current_period_start, current_period_end, activated_at, is_granted, granted_by
  ) VALUES (
    '<user-uuid>', 'cockpit-journey', 'particulier', 'active', 'manual',
    now(), now() + interval '1 month', now(), true, '<your-admin-uuid>'
  );
  ```

## Setup Stripe (côté Atlas Studio — à faire UNE fois pour tous les produits)

Si jamais le backend partagé doit être (re)configuré :

### 1. Compte Stripe + clés API

1. Créer un compte sur https://dashboard.stripe.com (déjà fait pour Atlas Studio)
2. **Activate live mode** (ou rester en test pour les essais)
3. Récupérer :
   - `STRIPE_SECRET_KEY` = `sk_live_...` ou `sk_test_...`
   - **Plus tard** : `STRIPE_WEBHOOK_SECRET` (étape 3)

### 2. Configurer les secrets Supabase

Dashboard Supabase → **Project Settings → Edge Functions → Secrets** :

```
STRIPE_SECRET_KEY = sk_live_... (ou sk_test_...)
STRIPE_WEBHOOK_SECRET = whsec_... (à remplir après l'étape 3)
FRONTEND_URL = https://cockpit-journey.atlas-studio.org
```

### 3. Webhook Stripe

Dashboard Stripe → **Developers → Webhooks → + Add endpoint** :

- **URL** : `https://vgtmljfayiysuvrcmunt.supabase.co/functions/v1/stripe-webhook`
- **Events** :
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
- Copier le **Signing secret** (`whsec_...`) → coller dans `STRIPE_WEBHOOK_SECRET` (étape 2)

## Flow utilisateur

```
1. User ouvre Settings → Facturation
2. Voit les 3 plans avec son plan actuel (ou aucun)
3. Clique "Souscrire" sur "Particulier"
   → BillingSection.handleCheckout()
   → billing.startCheckout('particulier')
   → POST supabase.functions.invoke('create-checkout', { appId, plan, priceAmount })
   → Edge Function:
     ─ requireUser(req)              // 401 si pas auth
     ─ verify apps.status='available'
     ─ get-or-create Stripe customer
     ─ stripe.prices.create({ unit_amount:15000, currency:'xof' })
     ─ stripe.checkout.sessions.create({ ... })
     ─ return { url: 'https://checkout.stripe.com/...' }
   → window.location.href = url
4. User paie sur Stripe Checkout (page Stripe)
5. Stripe redirige → /portal?payment=success
6. ASYNC: Stripe envoie checkout.session.completed → stripe-webhook
   → handleCheckoutCompleted()
   → INSERT INTO subscriptions (user_id, app_id, plan, status='active', ...)
7. User reload Settings → Facturation → voit "Abonnement actif · Particulier"
```

## Gérer un abonnement existant

| Action | Méthode |
|---|---|
| Changer de plan | `changePlan('equipe')` → Edge Function `change-plan` (pro-rate Stripe) |
| Annuler à la fin de la période | `cancelSubscription()` → Edge Function `cancel-subscription` |
| Mettre à jour CB / voir factures | `openCustomerPortal()` → Edge Function `portal-session` (Stripe-hosted) |

## Côtés à surveiller en prod

1. **Webhooks Stripe morts** : si Supabase est down 30+ minutes, Stripe
   retry pendant 3 jours puis abandonne. Si tu vois des abonnements
   "incomplete" pour des paiements pourtant passés côté Stripe → check
   les logs `payment_webhooks` table + retrigger manuellement.

2. **Customer en double** : si un user signe-up avec 2 emails différents
   et paie depuis chacun, Stripe créera 2 customers. La RLS sur
   `subscriptions` les sépare proprement par `user_id`, mais le user
   verra "2 abonnements" → support manuel.

3. **MRR tracking** : la table `subscriptions` a une colonne `mrr_fcfa`
   pour le revenu mensuel récurrent. À filtrer par `app_id='cockpit-journey'`
   pour avoir le MRR de CockpitJourney spécifiquement.

4. **TVA / facturation légale Côte d'Ivoire** : Stripe ne gère pas la
   TVA OHADA. Pour les clients EU il faut activer **Stripe Tax**, pour
   l'Afrique il faut un système de facture parallèle (TODO si besoin).

## Tester en local

```bash
# .env.local
VITE_SUPABASE_URL=https://vgtmljfayiysuvrcmunt.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Lance l'app
npm run dev

# Va sur /dashboard → ouvre Settings → Facturation
# → "Souscrire" sur Particulier
# → tu seras redirigé sur le checkout Stripe en mode test
# → Carte test : 4242 4242 4242 4242, CVC 123, date future quelconque
# → Après paiement, Stripe webhook → INSERT subscriptions row → reload
```
