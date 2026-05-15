/**
 * Billing section embedded in the Settings modal.
 *
 * Three states:
 *   1. No subscription → show plan grid + "Souscrire" CTAs (Stripe Checkout)
 *   2. Active sub on plan X → show current plan + upgrade/downgrade + portal/cancel buttons
 *   3. Past-due / canceled → warning banner + "Renouveler" CTA
 *
 * All Stripe interactions go through the shared Atlas Studio Edge
 * Functions — no Stripe SDK client-side, no API keys in the bundle.
 */
import { useEffect, useState } from 'react';
import { CreditCard, Check, Loader2, ExternalLink, AlertTriangle, Mail, Sparkles } from 'lucide-react';
import {
  PLANS,
  type PlanId,
  type SubscriptionState,
  getCurrentSubscription,
  startCheckout,
  openCustomerPortal,
  cancelSubscription,
  isSubscriptionActive,
  formatXof,
} from '../../lib/billing';
import { useApp } from '../../stores/appStore';
import { cn } from '../../lib/utils';

export function BillingSection() {
  const pushToast = useApp((s) => s.pushToast);
  const [sub, setSub] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const s = await getCurrentSubscription();
        setSub(s);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCheckout = async (plan: PlanId) => {
    setActionInFlight(`checkout-${plan}`);
    try {
      const url = await startCheckout(plan);
      window.location.href = url;
    } catch (err) {
      pushToast({
        kind: 'error',
        title: 'Checkout impossible',
        body: err instanceof Error ? err.message : 'Réessayez dans un instant',
      });
    } finally {
      setActionInFlight(null);
    }
  };

  const handlePortal = async () => {
    setActionInFlight('portal');
    try {
      const url = await openCustomerPortal();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      pushToast({
        kind: 'error',
        title: 'Portail indisponible',
        body: err instanceof Error ? err.message : 'Réessayez dans un instant',
      });
    } finally {
      setActionInFlight(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Annuler votre abonnement à la fin de la période courante ?')) return;
    setActionInFlight('cancel');
    try {
      await cancelSubscription();
      pushToast({
        kind: 'success',
        title: 'Annulation programmée',
        body: 'Vous gardez l’accès jusqu’à la fin de la période payée',
      });
      const s = await getCurrentSubscription();
      setSub(s);
    } catch (err) {
      pushToast({
        kind: 'error',
        title: 'Annulation échouée',
        body: err instanceof Error ? err.message : 'Réessayez dans un instant',
      });
    } finally {
      setActionInFlight(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-atlas-fg-3 py-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement…
      </div>
    );
  }

  const active = isSubscriptionActive(sub);

  return (
    <div className="space-y-4">
      {/* Status banner */}
      {sub && active && (
        <div className="panel p-4 flex items-start gap-3 border-signal-green/30 bg-signal-green/5">
          <div className="w-9 h-9 rounded-xl bg-signal-green/15 text-signal-green grid place-items-center shrink-0">
            <Check className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-atlas-fg-1">
              Abonnement actif · plan {PLANS.find((p) => p.id === sub.plan)?.label}
            </div>
            <div className="text-2xs text-atlas-fg-3 mt-0.5">
              {sub.status === 'trialing' && sub.trialEndsAt
                ? `Essai jusqu'au ${new Date(sub.trialEndsAt).toLocaleDateString('fr-FR')}`
                : sub.currentPeriodEnd
                  ? sub.cancelAtPeriodEnd
                    ? `Se termine le ${new Date(sub.currentPeriodEnd).toLocaleDateString('fr-FR')} (annulation programmée)`
                    : `Prochaine facturation le ${new Date(sub.currentPeriodEnd).toLocaleDateString('fr-FR')}`
                  : 'Période en cours'}
              {' · '}
              {sub.seats} {sub.seats > 1 ? 'utilisateurs' : 'utilisateur'} {' · '}
              {sub.provider === 'stripe' ? 'Stripe' : sub.provider === 'cinetpay' ? 'CinetPay' : 'Manuel'}
            </div>
          </div>
          <button
            onClick={() => void handlePortal()}
            disabled={actionInFlight === 'portal'}
            className="btn-secondary text-xs px-2.5 py-1.5 shrink-0"
          >
            {actionInFlight === 'portal' ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <ExternalLink className="w-3 h-3" />
            )}
            Gérer
          </button>
        </div>
      )}

      {sub && sub.status === 'past_due' && (
        <div className="panel p-4 flex items-start gap-3 border-signal-red/30 bg-signal-red/5">
          <AlertTriangle className="w-5 h-5 text-signal-red shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-medium text-atlas-fg-1">Paiement en attente</div>
            <p className="text-xs text-atlas-fg-2 mt-1">
              Votre dernière facture n'a pas pu être prélevée. Mettez à jour votre moyen de paiement pour
              conserver l'accès.
            </p>
            <button onClick={() => void handlePortal()} className="mt-2 btn-primary text-xs px-2.5 py-1.5">
              <ExternalLink className="w-3 h-3" /> Mettre à jour
            </button>
          </div>
        </div>
      )}

      {/* Plan grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PLANS.map((p) => {
          const isCurrent = sub?.plan === p.id && active;
          const isBusy = actionInFlight === `checkout-${p.id}`;
          const isContact = p.price === null;
          return (
            <div
              key={p.id}
              className={cn(
                'panel p-4 flex flex-col',
                isCurrent && 'border-atlas-sage-deep ring-1 ring-atlas-sage-deep/40'
              )}
            >
              <div className="text-2xs uppercase tracking-[0.18em] font-medium text-atlas-sage-deep mb-1">
                {p.label}
              </div>
              <div className="flex items-baseline gap-1.5 mb-1">
                {isContact ? (
                  <span className="text-lg font-display font-medium text-atlas-fg-1">Sur devis</span>
                ) : (
                  <>
                    <span className="text-2xl font-display font-medium text-atlas-fg-1">
                      {formatXof(p.price!)}
                    </span>
                  </>
                )}
              </div>
              <div className="text-2xs text-atlas-fg-3 mb-2">/ {p.period}</div>
              <div className="text-xs text-atlas-fg-2 mb-3 leading-relaxed">{p.tagline}</div>
              <div className="mt-auto">
                {isCurrent ? (
                  <div className="w-full text-center py-2 rounded-lg bg-atlas-sage-deep/10 text-atlas-sage-deep text-xs font-medium uppercase tracking-wider">
                    <Sparkles className="w-3 h-3 inline mr-1" /> Plan actuel
                  </div>
                ) : isContact ? (
                  <a
                    href="mailto:bonjour@atlas-studio.org?subject=CockpitJourney%20Entreprise"
                    className="btn-secondary text-xs px-2.5 py-1.5 w-full justify-center"
                  >
                    <Mail className="w-3 h-3" /> Nous contacter
                  </a>
                ) : (
                  <button
                    onClick={() => void handleCheckout(p.id)}
                    disabled={!!actionInFlight}
                    className="btn-primary text-xs px-2.5 py-1.5 w-full justify-center disabled:opacity-50"
                  >
                    {isBusy ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <CreditCard className="w-3 h-3" />
                    )}
                    {sub && active ? 'Changer pour ce plan' : 'Souscrire'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {sub && active && !sub.cancelAtPeriodEnd && (
        <div className="flex items-center justify-end pt-2">
          <button
            onClick={() => void handleCancel()}
            disabled={actionInFlight === 'cancel'}
            className="btn-ghost text-xs text-signal-red hover:bg-signal-red/10"
          >
            {actionInFlight === 'cancel' ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Annuler l'abonnement
          </button>
        </div>
      )}

      <p className="text-2xs text-atlas-fg-3 leading-relaxed">
        Facturation en FCFA (XOF) via Stripe. Cartes Visa, Mastercard, et virements bancaires acceptés. Pour
        Orange Money / Wave / MTN Mobile Money, demandez l'activation manuelle à{' '}
        <a href="mailto:bonjour@atlas-studio.org" className="text-atlas-sage-deep underline">
          bonjour@atlas-studio.org
        </a>
        .
      </p>
    </div>
  );
}
