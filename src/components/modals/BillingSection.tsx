/**
 * Billing section embedded in the Settings modal.
 *
 * READ-ONLY surface — CockpitJourney does NOT host a checkout flow
 * itself. All subscription management (subscribe, upgrade, downgrade,
 * payment method, cancel) happens on the centralized Atlas Studio
 * portal (atlas-studio.org/portal), which Pamela also operates for
 * Cockpit F&A, Atlas Compta, TableSmart, etc.
 *
 * Two states:
 *   1. Active sub on plan X → bandeau "Plan actuel · X · prochain prélèvement le DD/MM"
 *      + bouton "Gérer sur Atlas Studio"
 *   2. No sub OR canceled → bandeau "Pas d'abonnement actif" + bouton
 *      "Voir les plans sur Atlas Studio"
 *
 * Plan grid is shown for reference (FCFA prices, plan names) but every
 * CTA links out to the central portal.
 */
import { useEffect, useState } from 'react';
import { Check, Loader2, ExternalLink, AlertTriangle, Sparkles } from 'lucide-react';
import {
  PLANS,
  type SubscriptionState,
  getCurrentSubscription,
  isSubscriptionActive,
  atlasPortalUrl,
  formatXof,
} from '../../lib/billing';
import { cn } from '../../lib/utils';

export function BillingSection() {
  const [sub, setSub] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);

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

  const goToPortal = (action: 'subscribe' | 'manage') => {
    window.open(atlasPortalUrl(action), '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-atlas-fg-3 py-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement…
      </div>
    );
  }

  const active = isSubscriptionActive(sub);
  const currentPlan = sub ? PLANS.find((p) => p.id === sub.plan) : undefined;

  return (
    <div className="space-y-4">
      {/* Status banner */}
      {active && currentPlan && (
        <div className="panel p-4 flex items-start gap-3 border-signal-green/30 bg-signal-green/5">
          <div className="w-9 h-9 rounded-xl bg-signal-green/15 text-signal-green grid place-items-center shrink-0">
            <Check className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-atlas-fg-1">Plan {currentPlan.label} · actif</div>
            <div className="text-2xs text-atlas-fg-3 mt-0.5">
              {sub!.status === 'trialing' && sub!.trialEndsAt
                ? `Essai jusqu'au ${new Date(sub!.trialEndsAt).toLocaleDateString('fr-FR')}`
                : sub!.currentPeriodEnd
                  ? sub!.cancelAtPeriodEnd
                    ? `Se termine le ${new Date(sub!.currentPeriodEnd).toLocaleDateString('fr-FR')} (annulation programmée)`
                    : `Prochain prélèvement le ${new Date(sub!.currentPeriodEnd).toLocaleDateString('fr-FR')}`
                  : 'Période en cours'}
              {' · '}
              {sub!.seats} {sub!.seats > 1 ? 'utilisateurs' : 'utilisateur'} {' · '}
              {sub!.provider === 'stripe'
                ? 'Stripe'
                : sub!.provider === 'cinetpay'
                  ? 'CinetPay'
                  : 'Activation manuelle'}
            </div>
          </div>
          <button
            onClick={() => goToPortal('manage')}
            className="btn-secondary text-xs px-2.5 py-1.5 shrink-0"
          >
            <ExternalLink className="w-3 h-3" /> Gérer
          </button>
        </div>
      )}

      {sub && sub.status === 'past_due' && (
        <div className="panel p-4 flex items-start gap-3 border-signal-red/30 bg-signal-red/5">
          <AlertTriangle className="w-5 h-5 text-signal-red shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-medium text-atlas-fg-1">Paiement en attente</div>
            <p className="text-xs text-atlas-fg-2 mt-1">
              Votre dernière facture n'a pas pu être prélevée. Mettez à jour votre moyen de paiement sur Atlas
              Studio pour conserver l'accès.
            </p>
            <button onClick={() => goToPortal('manage')} className="mt-2 btn-primary text-xs px-2.5 py-1.5">
              <ExternalLink className="w-3 h-3" /> Mettre à jour sur Atlas Studio
            </button>
          </div>
        </div>
      )}

      {!active && (
        <div className="panel p-4 flex items-start gap-3 border-atlas-amber/30 bg-atlas-amber/5">
          <Sparkles className="w-5 h-5 text-atlas-amber-deep shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-medium text-atlas-fg-1">Pas d'abonnement actif</div>
            <p className="text-xs text-atlas-fg-2 mt-1 leading-relaxed">
              Souscrivez sur le portail Atlas Studio pour débloquer Reports avancés, Goals hiérarchiques, et
              utilisateurs supplémentaires. Cartes Visa/Mastercard, Orange Money, Wave et virement acceptés.
            </p>
            <button
              onClick={() => goToPortal('subscribe')}
              className="mt-2 btn-primary text-xs px-2.5 py-1.5"
            >
              <ExternalLink className="w-3 h-3" /> Voir les plans sur Atlas Studio
            </button>
          </div>
        </div>
      )}

      {/* Plan grid — informational. Every CTA links to the central portal. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PLANS.map((p) => {
          const isCurrent = sub?.plan === p.id && active;
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
                  <span className="text-2xl font-display font-medium text-atlas-fg-1">
                    {formatXof(p.price!)}
                  </span>
                )}
              </div>
              <div className="text-2xs text-atlas-fg-3 mb-2">/ {p.period}</div>
              <div className="text-xs text-atlas-fg-2 mb-3 leading-relaxed">{p.tagline}</div>
              <div className="mt-auto">
                {isCurrent ? (
                  <div className="w-full text-center py-2 rounded-lg bg-atlas-sage-deep/10 text-atlas-sage-deep text-xs font-medium uppercase tracking-wider">
                    <Sparkles className="w-3 h-3 inline mr-1" /> Plan actuel
                  </div>
                ) : (
                  <button
                    onClick={() => goToPortal(active ? 'manage' : 'subscribe')}
                    className="btn-secondary text-xs px-2.5 py-1.5 w-full justify-center"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {active ? 'Changer pour ce plan' : 'Souscrire sur Atlas Studio'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-2xs text-atlas-fg-3 leading-relaxed">
        La facturation est centralisée sur le portail Atlas Studio — un seul endroit pour gérer vos
        abonnements à tous les produits Atlas (CockpitJourney, Cockpit F&A, Atlas Compta…). Moyens de paiement
        : Visa/Mastercard, Orange Money, Wave, MTN Mobile Money, virement bancaire.
      </p>
    </div>
  );
}
