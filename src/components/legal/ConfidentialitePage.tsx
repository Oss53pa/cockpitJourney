import { LegalLayout, LegalH2, LegalH3, LegalP, LegalUL, LegalTODO } from './LegalLayout';

export function ConfidentialitePage() {
  return (
    <LegalLayout title="Politique de confidentialité" lastUpdated="2026-05-15">
      <LegalP>
        Atlas Studio (« nous ») attache la plus grande importance à la protection de vos données personnelles.
        La présente Politique décrit les données collectées, leur finalité, leur durée de conservation et les
        droits dont vous disposez, conformément au{' '}
        <strong>Règlement Général sur la Protection des Données (RGPD)</strong> et à la{' '}
        <strong>Loi n° 2013-450 de Côte d'Ivoire</strong> relative à la protection des données.
      </LegalP>

      <LegalH2>1. Responsable du traitement</LegalH2>
      <LegalTODO>
        Indiquer la dénomination sociale exacte, l'adresse du siège, le pays d'établissement, et le nom +
        e-mail du Délégué à la Protection des Données (DPO) si désigné. À défaut de DPO, désigner un point de
        contact unique pour les questions RGPD.
      </LegalTODO>
      <LegalP>
        Contact :{' '}
        <a href="mailto:privacy@atlas-studio.org" className="text-atlas-sage-deep underline">
          privacy@atlas-studio.org
        </a>
      </LegalP>

      <LegalH2>2. Données collectées</LegalH2>
      <LegalH3>2.1. Données d'inscription et de compte</LegalH3>
      <LegalUL>
        <li>Adresse e-mail (obligatoire) — pour la création du compte et les communications.</li>
        <li>Nom complet (optionnel à l'inscription, modifiable ensuite) — affichage personnalisé.</li>
        <li>Mot de passe — stocké sous forme hachée (bcrypt via Supabase Auth, jamais en clair).</li>
        <li>Initiales et couleur d'avatar (dérivées du nom).</li>
      </LegalUL>
      <LegalH3>2.2. Données d'usage</LegalH3>
      <LegalUL>
        <li>Tâches, projets, notes, commentaires, fichiers — saisis par vous.</li>
        <li>Préférences (thème, langue, heure du Daily Brief, capacité hebdomadaire).</li>
        <li>Statistiques agrégées (nombre de tâches complétées par jour, durée Deep Work).</li>
      </LegalUL>
      <LegalH3>2.3. Données techniques</LegalH3>
      <LegalUL>
        <li>Adresse IP — uniquement à des fins de sécurité (détection de fraude), conservée 30 jours.</li>
        <li>
          Type de navigateur, système d'exploitation, taille d'écran — logs serveur, conservés 90 jours puis
          anonymisés.
        </li>
        <li>
          Cookies techniques (session, préférences) — voir notre{' '}
          <a href="/legal/cookies" className="text-atlas-sage-deep underline">
            Politique des cookies
          </a>
          .
        </li>
      </LegalUL>
      <LegalH3>2.4. Données de facturation</LegalH3>
      <LegalUL>
        <li>Historique des paiements (montants, dates, plan) — conservés 10 ans (obligation fiscale).</li>
        <li>
          Aucune donnée bancaire (numéro de carte, RIB) n'est stockée par CockpitJourney : ces données sont
          traitées exclusivement par nos prestataires Stripe et CinetPay.
        </li>
      </LegalUL>

      <LegalH2>3. Finalités et bases légales</LegalH2>
      <LegalUL>
        <li>
          <strong>Exécution du contrat</strong> (art. 6.1.b RGPD) — fournir le service, gérer le compte,
          facturer.
        </li>
        <li>
          <strong>Intérêt légitime</strong> (art. 6.1.f RGPD) — détecter la fraude, améliorer le produit via
          télémétrie anonymisée, envoyer des notifications de service.
        </li>
        <li>
          <strong>Obligation légale</strong> (art. 6.1.c RGPD) — conservation des factures, réponse aux
          réquisitions judiciaires.
        </li>
        <li>
          <strong>Consentement</strong> (art. 6.1.a RGPD) — newsletter marketing (opt-in explicite), cookies
          non essentiels.
        </li>
      </LegalUL>

      <LegalH2>4. Destinataires et sous-traitants</LegalH2>
      <LegalP>
        Vos données sont traitées par notre équipe et par les sous-traitants suivants, tous tenus par contrat
        à une obligation de confidentialité et de sécurité conforme RGPD :
      </LegalP>
      <LegalUL>
        <li>
          <strong>Supabase Inc.</strong> (États-Unis) — hébergement Postgres + authentification. Région :{' '}
          <code>eu-central-1</code> (Francfort). Clauses contractuelles types UE en place.
        </li>
        <li>
          <strong>Vercel Inc.</strong> (États-Unis) — hébergement du frontend web. Région : auto (CDN
          multi-régions).
        </li>
        <li>
          <strong>Stripe Inc.</strong> (Irlande pour l'UE / États-Unis) — traitement des paiements par carte.
        </li>
        <li>
          <strong>CinetPay SA</strong> (Côte d'Ivoire) — traitement des paiements Mobile Money et cartes
          locales.
        </li>
        <li>
          <strong>Resend Inc.</strong> (États-Unis) — envoi des e-mails transactionnels (confirmation,
          récupération de mot de passe).
        </li>
        <li>
          <strong>Sentry Inc.</strong> (États-Unis) — agrégation des erreurs applicatives (sans email du
          Client, sans données métier — seul l'identifiant technique tronqué est envoyé).
        </li>
        <li>
          <strong>Groq Inc.</strong> (États-Unis) — fournisseur d'inférence IA pour PROPH3T. Vos tâches sont
          envoyées pour générer le Daily Brief, sans rétention côté Groq (politique « zero retention »
          contractuelle).
        </li>
      </LegalUL>
      <LegalP>
        Vos données ne sont <strong>jamais vendues</strong> à des tiers, ni utilisées à des fins
        publicitaires.
      </LegalP>

      <LegalH2>5. Durée de conservation</LegalH2>
      <LegalUL>
        <li>Compte actif : aussi longtemps que l'abonnement est en cours.</li>
        <li>Compte clôturé : données supprimées après 30 jours (sauf demande d'export préalable).</li>
        <li>Factures et documents comptables : 10 ans (obligation OHADA / fiscale).</li>
        <li>Logs techniques : 90 jours puis anonymisés.</li>
        <li>Erreurs Sentry : 90 jours puis purgées automatiquement.</li>
      </LegalUL>

      <LegalH2>6. Vos droits</LegalH2>
      <LegalP>
        Conformément aux articles 15 à 22 du RGPD et à la loi ivoirienne sur la protection des données, vous
        disposez des droits suivants :
      </LegalP>
      <LegalUL>
        <li>
          <strong>Droit d'accès</strong> — obtenir une copie complète de vos données via export JSON depuis
          Paramètres → Données.
        </li>
        <li>
          <strong>Droit de rectification</strong> — modifier votre profil, votre nom, vos préférences à tout
          moment depuis l'application.
        </li>
        <li>
          <strong>Droit à l'effacement</strong> (« droit à l'oubli ») — supprimer définitivement votre compte
          et toutes vos données depuis Paramètres → Supprimer mon compte. La suppression est effective sous 30
          jours.
        </li>
        <li>
          <strong>Droit à la portabilité</strong> — récupérer vos données dans un format structuré et lisible
          par machine (JSON, CSV).
        </li>
        <li>
          <strong>Droit d'opposition</strong> — vous opposer au traitement à des fins de marketing ou de
          profilage.
        </li>
        <li>
          <strong>Droit de limitation</strong> — geler le traitement de vos données le temps d'une
          vérification.
        </li>
      </LegalUL>
      <LegalP>
        Pour exercer ces droits, contactez{' '}
        <a href="mailto:privacy@atlas-studio.org" className="text-atlas-sage-deep underline">
          privacy@atlas-studio.org
        </a>
        . Nous répondons sous 30 jours maximum.
      </LegalP>
      <LegalP>
        Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de
        l'<strong>ARTCI</strong> (Côte d'Ivoire) ou de la <strong>CNIL</strong> (France) selon votre
        résidence.
      </LegalP>

      <LegalH2>7. Sécurité</LegalH2>
      <LegalUL>
        <li>Chiffrement en transit (TLS 1.3) sur l'ensemble des communications.</li>
        <li>Chiffrement au repos des données stockées dans Supabase Postgres.</li>
        <li>Mots de passe hachés avec bcrypt (jamais stockés en clair, jamais transmis à nos équipes).</li>
        <li>RLS Postgres : chaque utilisateur n'accède qu'à ses propres données.</li>
        <li>Sauvegardes journalières chiffrées, conservées 30 jours, restauration testée mensuellement.</li>
        <li>Aucun accès direct du personnel Atlas Studio aux données métier sans accord écrit.</li>
      </LegalUL>

      <LegalH2>8. Transferts hors UE</LegalH2>
      <LegalP>
        Certains de nos sous-traitants (Supabase, Vercel, Stripe US, Sentry, Resend, Groq) sont établis aux
        États-Unis. Les transferts sont encadrés par les <strong>Clauses Contractuelles Types</strong>{' '}
        approuvées par la Commission européenne (décision UE 2021/914), garantissant un niveau de protection
        équivalent au RGPD. Pour les transferts depuis la Côte d'Ivoire, ces clauses sont également jugées
        adéquates par l'ARTCI.
      </LegalP>

      <LegalH2>9. Modifications</LegalH2>
      <LegalP>
        La présente Politique peut être modifiée pour refléter des changements légaux, techniques ou
        organisationnels. Les modifications substantielles seront notifiées par e-mail au moins 30 jours avant
        leur entrée en vigueur.
      </LegalP>
    </LegalLayout>
  );
}
