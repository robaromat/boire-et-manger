import type { PhotoId } from '../recettes/types';

// Modèle de cave.json (dépôt privé boire-et-manger-data), issu du grill du 18-19/11/2026
// et de la maquette Cave validée le 20/11/2026 (maquettes/maquette-bm-cave.html).
// Aucune valeur de cave n'est calculée ni affichée : seul le prix d'achat d'une bouteille est gardé.

export const COLORS = ['rouge', 'blanc', 'rose', 'bulles', 'doux'] as const;
export type WineColor = (typeof COLORS)[number];
export const COLOR_LABELS: Record<WineColor, string> = { rouge: 'Rouge', blanc: 'Blanc', rose: 'Rosé', bulles: 'Effervescent', doux: 'Liquoreux' };

/**
 * Pourquoi une bouteille quitte la cave (ou, pour « exterieur », une bouteille bue ailleurs qui n'était pas à toi).
 * Les trois premières sont des dégustations : elles ont une note et apparaissent dans « Dégustés ».
 */
export const REASONS = ['bue', 'ailleurs', 'exterieur', 'offerte', 'cuisine', 'defaut', 'cassee', 'disparue', 'vendue'] as const;
export type Reason = (typeof REASONS)[number];
export const TASTING_REASONS: readonly Reason[] = ['bue', 'ailleurs', 'exterieur'];
export const isTasting = (r: Reason) => TASTING_REASONS.includes(r);

/** Libellé dans l'historique d'un vin. */
export const REASON_LABELS: Record<Reason, string> = {
  bue: 'Bue',
  ailleurs: 'Bue ailleurs',
  exterieur: 'Dégustée ailleurs',
  offerte: 'Offerte',
  cuisine: 'Pour la cuisine',
  defaut: 'Défaut',
  cassee: 'Cassée',
  disparue: 'Disparue',
  vendue: 'Vendue ou échangée',
};

/** Bouteilles rangées à un endroit : un lieu (« Cave », « Armoire cuisine ») et une clayette (« B2 », vide = pas rangée). */
export interface Slot {
  place: string;
  shelf: string;
  n: number;
}

export interface Exit {
  id: string; // « x_… »
  date: string; // AAAA-MM-JJ
  reason: Reason;
  rating: number | null; // 1 à 5, dégustations seulement
  comment: string;
  dish: string; // plat, en texte
  recipe?: string; // ou recette du carnet (id « r_… »)
  where: string; // « Chez les Martin », « Restaurant … »
  detail: string; // « à Paul », « bouchonnée, rapportée au caviste »
  photo?: PhotoId;
  /** D'où sortait la bouteille (pour Annuler, et pour l'historique). */
  from?: { place: string; shelf: string };
  /** Note d'origine sur 100 (import CellarTracker). */
  score?: number;
  ctId?: string; // identifiant CellarTracker, pour ne rien importer deux fois
  auteur: string;
}

/** Champs remplis par ChatGPT, affichés « estimation » tant que tu ne les as pas corrigés. */
export const ESTIMABLE = ['window', 'grapes', 'style', 'pairings', 'region'] as const;
export type Estimable = (typeof ESTIMABLE)[number];

export interface Wine {
  id: string; // « w_… »
  domaine: string;
  cuvee: string;
  vintage: number | null; // null = non millésimé
  color: WineColor;
  appellation: string;
  region: string;
  country: string;
  size: string; // vide = 75 cl ; « Magnum »…
  grapes: string;
  style: string;
  /** Fenêtre de dégustation, en années. */
  from: number | null;
  to: number | null;
  pairings: string[]; // plats, en texte
  pairRecipes: string[]; // recettes du carnet (ids)
  estimated: Estimable[];
  price: number | null; // prix d'achat d'une bouteille, en euros
  bought: string; // « Caviste du quartier, déc. 2022 »
  notes: string;
  label?: PhotoId; // photo de l'étiquette
  stock: Slot[];
  history: Exit[]; // le plus récent en premier
  ctId?: string; // iWine CellarTracker
  createdAt: string;
  updatedAt: string;
}

export interface Wish {
  id: string; // « e_… »
  domaine: string;
  cuvee: string;
  color: WineColor | null;
  appellation: string;
  why: string;
  wineId?: string; // vin déjà en fiche (« Racheter »)
  createdAt: string;
}

export interface CaveFile {
  schemaVersion: 1;
  wines: Wine[];
  wishes: Wish[];
}

export const CAVE_FILE = 'cave.json';
export const emptyCaveFile = (): CaveFile => ({ schemaVersion: 1, wines: [], wishes: [] });

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown) => (typeof x === 'string' ? x : '');
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const strs = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
const asColor = (x: unknown): WineColor => ((COLORS as readonly string[]).includes(x as string) ? (x as WineColor) : 'rouge');

function parseExit(x: Record<string, unknown>): Exit | null {
  if (typeof x.id !== 'string' || !(REASONS as readonly string[]).includes(x.reason as string)) return null;
  return {
    ...(x as unknown as Exit),
    date: str(x.date) || '1970-01-01',
    rating: num(x.rating),
    comment: str(x.comment),
    dish: str(x.dish),
    where: str(x.where),
    detail: str(x.detail),
    auteur: str(x.auteur) || 'Robin',
  };
}

/** Vérification minimale de cave.json ; complète les champs manquants plutôt que de tout refuser. */
export function parseCaveFile(raw: unknown): CaveFile | null {
  if (!isObj(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.wines)) return null;
  const wines: Wine[] = [];
  for (const w of raw.wines) {
    if (!isObj(w) || typeof w.id !== 'string') continue;
    wines.push({
      ...(w as unknown as Wine),
      domaine: str(w.domaine),
      cuvee: str(w.cuvee),
      vintage: num(w.vintage),
      color: asColor(w.color),
      appellation: str(w.appellation),
      region: str(w.region),
      country: str(w.country),
      size: str(w.size),
      grapes: str(w.grapes),
      style: str(w.style),
      from: num(w.from),
      to: num(w.to),
      pairings: strs(w.pairings),
      pairRecipes: strs(w.pairRecipes),
      estimated: strs(w.estimated).filter((e): e is Estimable => (ESTIMABLE as readonly string[]).includes(e)),
      price: num(w.price),
      bought: str(w.bought),
      notes: str(w.notes),
      stock: Array.isArray(w.stock)
        ? w.stock.filter(isObj).map((s) => ({ place: str(s.place), shelf: str(s.shelf), n: Math.max(0, Math.round(num(s.n) ?? 0)) }))
        : [],
      history: Array.isArray(w.history) ? w.history.filter(isObj).map(parseExit).filter((e): e is Exit => !!e) : [],
      createdAt: str(w.createdAt) || new Date(0).toISOString(),
      updatedAt: str(w.updatedAt) || new Date(0).toISOString(),
    });
  }
  const wishes: Wish[] = Array.isArray(raw.wishes)
    ? raw.wishes
        .filter((e): e is Record<string, unknown> => isObj(e) && typeof e.id === 'string')
        .map((e) => ({
          ...(e as unknown as Wish),
          domaine: str(e.domaine),
          cuvee: str(e.cuvee),
          color: (COLORS as readonly string[]).includes(e.color as string) ? (e.color as WineColor) : null,
          appellation: str(e.appellation),
          why: str(e.why),
          createdAt: str(e.createdAt) || new Date(0).toISOString(),
        }))
    : [];
  return { schemaVersion: 1, wines, wishes };
}
