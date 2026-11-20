import type { TabId } from '../router';

// Mini-tuto, sur le modèle des Labs Jarvis : une étape présente une fonctionnalité, sur son onglet, en un titre et
// deux ou trois phrases, avec une petite illustration dessinée (données inventées, jamais une capture).
// La visite d'un onglet s'ouvre la première fois qu'on y entre. Quand une fonctionnalité change, on avance la date
// `since` de son étape : elle redevient « nouvelle » pour qui l'avait vue avant, et seule elle est remontrée.
// Fonctions pures, testées sans navigateur.

export interface TutoStep {
  id: string;
  tab: TabId;
  /** Date de mise en ligne de la fonctionnalité telle que décrite (AAAA-MM-JJ). */
  since: string;
  title: string;
  text: string;
}

/** Ce que la personne a vu : id d'étape → date ISO de la dernière vue. */
export type TutoSeen = Record<string, string>;

export const TUTO_STEPS: TutoStep[] = [
  {
    id: 'courses.listes',
    tab: 'courses',
    since: '2026-11-19',
    title: 'Une liste par magasin',
    text: "Les pastilles du haut changent de magasin et comptent ce qu'il reste à prendre. « + » crée une liste ; toucher la liste ouverte la renomme ou la supprime. Les articles se rangent tout seuls par rayon.",
  },
  {
    id: 'courses.saisie',
    tab: 'courses',
    since: '2026-11-19',
    title: 'Ajouter en une ligne',
    text: "Tape « 2 lait, pain, farine 500 g » : chaque article trouve son rayon, et les quantités s'ajoutent à ce qui est déjà dans la liste. Champ vide : tes habituels de ce magasin.",
  },
  {
    id: 'courses.fiche',
    tab: 'courses',
    since: '2026-11-19',
    title: 'Modifier, déplacer, supprimer',
    text: "Touche le nom d'un article pour changer sa quantité, son rayon ou son magasin : le rayon choisi est retenu pour la prochaine fois. Glisse une ligne vers la gauche pour la supprimer.",
  },
  {
    id: 'courses.panier',
    tab: 'courses',
    since: '2026-11-19',
    title: 'Le panier',
    text: "Coche un article : il descend dans « Dans le panier ». En caisse, « Courses terminées » vide le panier et compte tes achats, ce qui nourrit les habituels.",
  },
  {
    id: 'courses.recette',
    tab: 'courses',
    since: '2026-11-20T10:08',
    title: 'Une recette, ses ingrédients',
    text: "Le bouton Recette lit une photo, une capture d'écran ou le lien d'une page. Tu choisis les portions, tu décoches ce que tu as déjà, et les ingrédients rejoignent la liste avec « pour : … ». Coche « Garder dans le carnet » pour la retrouver dans Recettes ; la pastille de la recette en haut de la liste retire ses ingrédients d'un coup.",
  },
  {
    id: 'recettes.carnet',
    tab: 'recettes',
    since: '2026-11-20T10:08',
    title: 'Ton carnet de recettes',
    text: "Cherche par nom ou par ingrédient (« poireau »). L'accueil propose ce qui est de saison, ce que tu n'as pas fait depuis longtemps et ce qui reste à tester. Le bouton à côté de la recherche filtre par note et par tag.",
  },
  {
    id: 'recettes.ajout',
    tab: 'recettes',
    since: '2026-11-20T10:08',
    title: 'Ajouter une recette',
    text: "« + Recette » lit une photo de livre, une capture d'écran ou le lien d'une page, ou te laisse la saisir à la main. Tu vérifies la fiche avant de l'enregistrer : la saison se calcule d'après les fruits et légumes. Depuis Chrome, partage une page de recette vers B&M.",
  },
  {
    id: 'recettes.fiche',
    tab: 'recettes',
    since: '2026-11-20T10:08',
    title: 'Cuisiner, puis noter',
    text: "Sur une fiche : les portions recalculent tout, jusque dans les étapes. « Mode cuisine » garde l'écran allumé en grand ; « Aux courses » envoie les ingrédients dans une liste ; « Je l'ai fait » ajoute une note, un commentaire et une photo au journal.",
  },
  {
    id: 'cave.boire',
    tab: 'cave',
    since: '2026-11-20T18:00',
    title: 'Ta cave, à boire d’abord',
    text: "« À boire » classe tes bouteilles par année de fin de leur fenêtre de dégustation : en rouge, celles qui ont passé leur fenêtre. « Ma cave » dessine le plan de tes lieux et clayettes ; « Dégustés » garde tes notes, « Envies » les vins à acheter.",
  },
  {
    id: 'cave.sortir',
    tab: 'cave',
    since: '2026-11-20T18:00',
    title: 'Sortir une bouteille',
    text: "Sur la fiche d'un vin, « Sortir » baisse le stock et demande pourquoi : bue (tu notes la dégustation, avec le plat ou une recette du carnet), offerte, pour la cuisine, bouchonnée, cassée, disparue ou vendue. Tout reste dans l'historique du vin.",
  },
  {
    id: 'cave.ajout',
    tab: 'cave',
    since: '2026-11-20T18:00',
    title: 'Ajouter un vin',
    text: "« + Vin » lit la photo de l'étiquette : ChatGPT remplit la fiche et estime la fenêtre et les accords (marqués « estimation »). Tu choisis ensuite : en cave, dégusté ailleurs, ou une envie. Ta cave CellarTracker s'importe depuis « Ma cave ».",
  },
];

/** Étapes à montrer pour un onglet : jamais vues, ou vues avant leur dernière mise à jour. */
export function pendingSteps(tab: TabId, seen: TutoSeen, steps: TutoStep[] = TUTO_STEPS): TutoStep[] {
  return steps.filter((s) => s.tab === tab && (!seen[s.id] || seen[s.id]! < s.since));
}

export const stepsOf = (tab: TabId, steps: TutoStep[] = TUTO_STEPS) => steps.filter((s) => s.tab === tab);

export function markSeen(seen: TutoSeen, steps: TutoStep[], now: string): TutoSeen {
  const next = { ...seen };
  for (const s of steps) next[s.id] = now;
  return next;
}
