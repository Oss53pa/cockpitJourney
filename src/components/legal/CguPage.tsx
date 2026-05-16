import { LegalLayout, LegalH2, LegalH3, LegalP, LegalUL, LegalTODO } from './LegalLayout';

export function CguPage() {
  return (
    <LegalLayout title="Conditions Générales d'Utilisation" lastUpdated="2026-05-15">
      <LegalP>
        Les présentes Conditions Générales d'Utilisation (« CGU ») régissent l'accès et l'utilisation du
        service CockpitJourney (« le Service »), édité par Atlas Studio. En souscrivant un abonnement ou en
        créant un compte, l'utilisateur (« vous », « Client ») accepte sans réserve les présentes CGU.
      </LegalP>

      <LegalTODO>
        Insérer ici la dénomination sociale exacte, la forme juridique, le RCCM, le siège social et le numéro
        de TVA / contribuable de la société éditrice (Atlas Studio SARL / SAS / SA). Voir page « Mentions
        légales » pour le détail.
      </LegalTODO>

      <LegalH2>1. Objet</LegalH2>
      <LegalP>
        CockpitJourney est un logiciel-service (SaaS) de gestion de tâches et de projets, doté d'un assistant
        IA propriétaire (« PROPH3T ») pour générer des briefs quotidiens, détecter des risques et proposer une
        organisation de journée. Le Service est accessible depuis un navigateur web à l'adresse
        https://cockpit-journey.atlas-studio.org.
      </LegalP>

      <LegalH2>2. Inscription et compte</LegalH2>
      <LegalP>
        L'inscription au Service requiert la création d'un compte au moyen d'une adresse e-mail valide et d'un
        mot de passe. Le Client garantit l'exactitude des informations fournies. Il est seul responsable de la
        confidentialité de ses identifiants. Tout accès effectué à l'aide de ces identifiants est réputé fait
        par le Client.
      </LegalP>
      <LegalP>
        Atlas Studio se réserve le droit de suspendre ou de clôturer un compte en cas de violation des
        présentes CGU, d'usage frauduleux ou de non-paiement.
      </LegalP>

      <LegalH2>3. Abonnement et tarifs</LegalH2>
      <LegalH3>3.1. Plans</LegalH3>
      <LegalUL>
        <li>
          <strong>Particulier</strong> — 15 000 FCFA (XOF) par mois, 1 utilisateur.
        </li>
        <li>
          <strong>Équipe</strong> — 15 000 FCFA (XOF) par mois, forfait jusqu'à 10 utilisateurs inclus.
        </li>
        <li>
          <strong>Entreprise</strong> — sur devis, 10 000 FCFA (XOF) par utilisateur supplémentaire au-delà du
          10ᵉ collaborateur, par mois.
        </li>
      </LegalUL>
      <LegalH3>3.2. Facturation</LegalH3>
      <LegalP>
        La facturation est mensuelle, prélevée le jour anniversaire de la souscription. Les paiements sont
        effectués via le portail Atlas Studio (atlas-studio.org/portal), qui accepte les cartes bancaires
        (Visa, Mastercard), les services Mobile Money (Orange Money, Wave, MTN Mobile Money, Moov Money) et
        les virements bancaires. Les factures sont mises à disposition au format PDF sur le portail.
      </LegalP>
      <LegalH3>3.3. Essai gratuit</LegalH3>
      <LegalP>
        Un essai gratuit de 14 jours peut être proposé aux nouveaux utilisateurs. À l'expiration de la période
        d'essai, et sans souscription, l'accès aux fonctionnalités payantes est automatiquement suspendu — les
        données du Client sont conservées 30 jours puis supprimées sauf reprise d'abonnement.
      </LegalP>

      <LegalH2>4. Résiliation</LegalH2>
      <LegalP>
        Le Client peut résilier son abonnement à tout moment depuis le portail Atlas Studio. La résiliation
        prend effet à la fin de la période de facturation en cours — le Client conserve l'accès jusqu'à cette
        date. Aucun remboursement au prorata n'est effectué.
      </LegalP>
      <LegalP>
        Atlas Studio peut résilier l'abonnement avec un préavis de 30 jours, par courrier électronique à
        l'adresse fournie par le Client, sauf cas de manquement grave aux présentes CGU permettant une
        résiliation immédiate.
      </LegalP>

      <LegalH2>5. Propriété intellectuelle</LegalH2>
      <LegalP>
        Le Service, son code source, ses interfaces, son modèle IA PROPH3T et l'ensemble des éléments
        graphiques sont la propriété exclusive d'Atlas Studio. Le Client bénéficie d'un droit d'utilisation
        personnel, non-exclusif et non-transférable, limité à la durée de son abonnement.
      </LegalP>
      <LegalP>
        Les données saisies par le Client (tâches, projets, notes, documents) restent sa propriété exclusive.
        Atlas Studio agit uniquement comme prestataire d'hébergement et de traitement — voir Politique de
        confidentialité pour le détail.
      </LegalP>

      <LegalH2>6. Engagement de niveau de service (SLA)</LegalH2>
      <LegalP>
        Atlas Studio s'engage sur une disponibilité du Service de <strong>99,5 % par mois</strong> (hors
        maintenance planifiée annoncée 72 h à l'avance et cas de force majeure). En cas de non-respect de cet
        engagement, le Client peut demander un crédit prorata sur sa facture du mois suivant.
      </LegalP>

      <LegalH2>7. Responsabilité</LegalH2>
      <LegalP>
        Le Service est fourni « en l'état ». Atlas Studio met en œuvre les diligences raisonnables pour
        garantir la disponibilité, la sécurité et l'exactitude du Service, sans toutefois garantir l'absence
        totale d'erreurs ou d'interruptions.
      </LegalP>
      <LegalP>
        La responsabilité d'Atlas Studio est limitée, pour tout préjudice direct, au montant des sommes
        effectivement versées par le Client au titre des 12 derniers mois d'abonnement. Atlas Studio ne
        saurait être tenue responsable des préjudices indirects (perte de chiffre d'affaires, perte
        d'opportunités, atteinte à la réputation).
      </LegalP>

      <LegalH2>8. Données personnelles</LegalH2>
      <LegalP>
        Le traitement des données personnelles est régi par notre{' '}
        <a href="/legal/confidentialite" className="text-atlas-sage-deep underline">
          Politique de confidentialité
        </a>
        , conforme au Règlement Général sur la Protection des Données (RGPD, Règlement UE 2016/679) et à la
        Loi n° 2013-450 de Côte d'Ivoire relative à la protection des données à caractère personnel.
      </LegalP>

      <LegalH2>9. Modifications</LegalH2>
      <LegalP>
        Atlas Studio se réserve le droit de modifier les présentes CGU à tout moment. Les modifications
        substantielles (prix, niveau de service, fonctionnalités payantes) sont notifiées au Client par e-mail
        au moins 30 jours avant leur entrée en vigueur. Le maintien de l'abonnement après cette période vaut
        acceptation des CGU modifiées.
      </LegalP>

      <LegalH2>10. Droit applicable et juridiction</LegalH2>
      <LegalTODO>
        Choisir le droit applicable et la juridiction compétente. Recommandation : droit ivoirien (OHADA pour
        la partie commerciale) avec tribunaux d'Abidjan compétents — ou droit français / tribunaux de Paris si
        l'entité juridique est en France. Pour les clients UE, ajouter une clause de médiation préalable
        conformément à l'article 14 du Règlement ODR.
      </LegalTODO>

      <LegalH2>11. Contact</LegalH2>
      <LegalP>
        Pour toute question relative aux présentes CGU :{' '}
        <a href="mailto:legal@atlas-studio.org" className="text-atlas-sage-deep underline">
          legal@atlas-studio.org
        </a>
        .
      </LegalP>
    </LegalLayout>
  );
}
