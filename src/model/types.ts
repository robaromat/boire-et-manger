// Modèle de courses.json (dépôt privé boire-et-manger-data), issu du cadrage du 2026-11-16 et de la maquette v1 :
// - listes étanches (une par magasin), articles rangés dans une liste de rayons commune ;
// - un historique commun, indexé par nom normalisé, qui sert aux suggestions, aux habituels (fréquence par liste),
//   au rayon appris et au drapeau « toujours à la maison ».

export type RayonId = 'fl' | 'boul' | 'vrac' | 'cre' | 'trait' | 'boi' | 'surg' | 'hyg' | 'div';

/**
 * Une partie de quantité. Les masses sont stockées en grammes (u = 'g'), les volumes en millilitres (u = 'ml'),
 * un simple nombre d'unités a u = null, toute autre unité est gardée telle quelle (« gousses », « c. à s. »).
 * n = null : quantité non chiffrée (« selon le goût »), le texte est alors dans u.
 */
export interface QtyPart {
  n: number | null;
  u: string | null;
}

export interface Item {
  id: string; // « i_… »
  name: string;
  qty: QtyPart[]; // vide = pas de quantité ; plusieurs parties quand les unités ne s'additionnent pas
  rayon: RayonId;
  checked: boolean; // true = « Dans le panier »
  addedAt: string; // ISO 8601
  updatedAt: string;
}

export interface ShopList {
  id: string; // « l_… »
  name: string;
  items: Item[];
  createdAt: string;
}

export interface HistoryEntry {
  name: string; // nom affiché, tel que tapé la première fois
  rayon: RayonId; // rayon appris (corrigé par l'utilisateur ou déduit du dictionnaire)
  staple: boolean; // « toujours à la maison » : décoché d'office dans l'écran de revue d'une recette
  freq: Record<string, number>; // nombre d'achats par id de liste (incrémenté par « Courses terminées »)
  lastQty: QtyPart[];
  lastBoughtAt: string | null;
}

export interface DataFile {
  schemaVersion: 1;
  rayonOrder: RayonId[]; // ordre d'affichage, commun à toutes les listes
  lists: ShopList[];
  history: Record<string, HistoryEntry>; // clé = nom normalisé (voir normalizeName)
}

export const RAYONS: Record<RayonId, string> = {
  fl: 'Fruits & légumes',
  boul: 'Boulangerie',
  vrac: 'Vrac & épicerie',
  cre: 'Crèmerie',
  trait: 'Boucherie & traiteur',
  boi: 'Boissons',
  surg: 'Surgelés',
  hyg: 'Hygiène & maison',
  div: 'Divers',
};

export const DEFAULT_RAYON_ORDER: RayonId[] = ['fl', 'boul', 'vrac', 'cre', 'trait', 'boi', 'surg', 'hyg', 'div'];
