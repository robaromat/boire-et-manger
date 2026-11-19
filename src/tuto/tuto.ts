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
