import { LegalLayout, LegalH2, LegalP, LegalUL } from './LegalLayout';

export function CookiesPage() {
  return (
    <LegalLayout title="Politique des cookies" lastUpdated="2026-05-15">
      <LegalP>
        CockpitJourney utilise un nombre minimal de cookies et de technologies de stockage local, toutes
        strictement nécessaires au fonctionnement du service. Aucun cookie publicitaire, analytique tiers ou
        de pistage cross-site n'est utilisé.
      </LegalP>

      <LegalH2>1. Cookies de session et d'authentification</LegalH2>
      <LegalUL>
        <li>
          <code>cj-supabase-auth</code> — stocke votre jeton d'authentification chiffré. Permet de rester
          connecté entre deux visites. Géré par Supabase Auth. <em>Durée : session + jusqu'à 30 jours.</em>
        </li>
        <li>
          <code>cj-snap-v2:&lt;auth_user_id&gt;</code> — mirror local de votre snapshot d'application
          (projets, tâches, paramètres) pour permettre l'affichage instantané au retour.{' '}
          <em>Durée : 7 jours avec rotation TTL automatique.</em>
        </li>
        <li>
          <code>cj-last-user</code> — identifiant utilisateur de la dernière session, pour l'hydratation
          optimiste. <em>Durée : session + 30 jours.</em>
        </li>
        <li>
          <code>chunk-reload-*</code> — petit drapeau de session pour éviter une boucle de rechargement après
          un déploiement. <em>Durée : session uniquement.</em>
        </li>
      </LegalUL>

      <LegalH2>2. Cookies tiers</LegalH2>
      <LegalP>
        <strong>Aucun.</strong> Nous n'utilisons aucun cookie de Google Analytics, Facebook Pixel, Hotjar,
        Mixpanel, ou autre service tiers de tracking. Le service Sentry (suivi des erreurs) que nous utilisons
        est configuré pour <strong>ne pas placer de cookie</strong> — il transmet uniquement l'identifiant
        utilisateur tronqué et le contexte technique de la page au moment d'une erreur.
      </LegalP>

      <LegalH2>3. Gestion des cookies</LegalH2>
      <LegalP>
        Tous les cookies utilisés étant strictement nécessaires au service, ils ne sont pas soumis au
        consentement préalable (article 82 LIL en France, équivalent loi ivoirienne). Vous pouvez néanmoins
        les supprimer à tout moment depuis les paramètres de votre navigateur — cela entraînera une
        déconnexion et la perte des préférences locales.
      </LegalP>

      <LegalH2>4. Service Worker et stockage IndexedDB</LegalH2>
      <LegalP>
        CockpitJourney installe un Service Worker (mode PWA) qui met en cache les ressources statiques (HTML,
        CSS, JS, polices) pour permettre une utilisation plus rapide et hors- ligne partielle. Aucune donnée
        personnelle n'est stockée dans ce cache. Vous pouvez désinstaller le Service Worker depuis votre
        navigateur (DevTools → Application → Service Workers).
      </LegalP>

      <LegalH2>5. Contact</LegalH2>
      <LegalP>
        Questions sur les cookies :{' '}
        <a href="mailto:privacy@atlas-studio.org" className="text-atlas-sage-deep underline">
          privacy@atlas-studio.org
        </a>
        .
      </LegalP>
    </LegalLayout>
  );
}
