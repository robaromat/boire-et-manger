import { normalizeName } from '../model/qty';
import { SEASONS, type Recipe, type RecipeIngredient, type Season } from './types';

// Saison d'une recette, calculée d'après ses fruits et légumes (calendrier France métropolitaine, simplifié
// par saison : printemps = mars-mai, été = juin-août, automne = septembre-novembre, hiver = décembre-février).
// Les produits disponibles toute l'année (carotte, oignon, pomme de terre…) ne comptent pas.

const P: Season = 'printemps';
const E: Season = 'ete';
const A: Season = 'automne';
const H: Season = 'hiver';

/** Mot-clé → saisons. `[]` = toute l'année (sert à écarter un mot-clé plus court : « pomme de terre » ≠ « pomme »). */
const CAL: Record<string, Season[]> = {
  // Légumes
  asperge: [P], artichaut: [P, E], aubergine: [E], betterave: [E, A, H], blette: [E, A], bette: [E, A],
  brocoli: [E, A], 'celeri rave': [A, H], celeri: [A, H], cepe: [A], girolle: [A], morille: [P],
  chou: [A, H], 'chou fleur': [A, H, P], kale: [A, H], concombre: [E], courge: [A, H], potimarron: [A, H],
  butternut: [A, H], citrouille: [A, H], potiron: [A, H], courgette: [E], endive: [A, H], epinard: [A, H, P],
  fenouil: [E, A], feve: [P], 'haricot vert': [E], 'haricot coco': [E], mache: [A, H], navet: [A, H],
  panais: [A, H], 'petit poi': [P, E], poireau: [A, H], poivron: [E], radi: [P, E], 'fane de radi': [P],
  'fane radi': [P], laitue: [P, E], salade: [P, E], tomate: [E], 'tomate cerise': [E], topinambour: [A, H],
  mai: [E], rhubarbe: [P], cresson: [P], 'patate douce': [A, H], chicoree: [A, H], frisee: [A, H],
  scarole: [A, H], salsifi: [A, H], cardon: [A, H], chataigne: [A], marron: [A], basilic: [E],
  // Fruits
  abricot: [E], cerise: [E], fraise: [P, E], framboise: [E], groseille: [E], cassi: [E], mure: [E],
  myrtille: [E], melon: [E], pasteque: [E], peche: [E], nectarine: [E], brugnon: [E], prune: [E],
  mirabelle: [E], 'reine claude': [E], figue: [E, A], raisin: [A], pomme: [A, H], poire: [A, H], coing: [A],
  kaki: [A], kiwi: [H], clementine: [H], mandarine: [H], orange: [H], pamplemousse: [H], noix: [A],
  noisette: [A],
  // Disponibles toute l'année (masquent un mot-clé plus court)
  'pomme de terre': [], 'tomate pelee': [], 'pomme de terre nouvelle': [P], 'lait de coco': [],
  'noix de coco': [], 'noix de muscade': [], 'noix de cajou': [], 'poudre de noisette': [], 'chou chinoi': [],
  'jus d orange': [], 'mais en grain': [],
};

/** Produits transformés, disponibles toute l'année. */
const PROCESSED = ['pelee', 'concentre', 'coulis', 'seche', 'confit', 'surgele', 'conserve', 'boite', 'jus', 'sirop', 'confiture', 'compote', 'puree de', 'poudre', 'en grain'];

const KEYS = Object.keys(CAL)
  .map((k) => ({ k, words: normalizeName(k).split(' ') }))
  .sort((a, b) => b.words.length - a.words.length || b.k.length - a.k.length);

/** Saisons d'un ingrédient, ou null s'il n'est pas « de saison » (disponible toute l'année ou inconnu). */
export function ingredientSeasons(name: string): Season[] | null {
  const n = normalizeName(name);
  if (!n || PROCESSED.some((p) => n.includes(p))) return null;
  const words = n.split(' ');
  for (const { k, words: kw } of KEYS) {
    for (let i = 0; i + kw.length <= words.length; i++) {
      if (kw.every((w, j) => words[i + j] === w)) {
        const s = CAL[k]!;
        return s.length && s.length < 4 ? s : null;
      }
    }
  }
  return null;
}

export interface SeasonInfo {
  seasons: Season[]; // [] = toute l'année
  from: string[]; // ingrédients qui ont décidé
  manual: boolean;
}

/** Saison calculée d'après les ingrédients : celles que partagent tous les produits de saison (sinon les plus fréquentes). */
export function computeSeasons(ings: RecipeIngredient[]): { seasons: Season[]; from: string[] } {
  const found = ings.map((i) => ({ name: i.name, s: ingredientSeasons(i.name) })).filter((x): x is { name: string; s: Season[] } => !!x.s);
  if (!found.length) return { seasons: [], from: [] };
  const count = new Map<Season, number>();
  for (const f of found) for (const s of f.s) count.set(s, (count.get(s) ?? 0) + 1);
  const max = Math.max(...count.values());
  const all = SEASONS.filter((s) => count.get(s) === found.length);
  const seasons = all.length ? all : SEASONS.filter((s) => count.get(s) === max);
  return { seasons: seasons.length === 4 ? [] : seasons, from: found.map((f) => f.name) };
}

export function recipeSeasons(r: Pick<Recipe, 'seasons' | 'ingredients'>): SeasonInfo {
  if (r.seasons) return { seasons: r.seasons.length === 4 ? [] : r.seasons, from: [], manual: true };
  return { ...computeSeasons(r.ingredients), manual: false };
}

export function currentSeason(d = new Date()): Season {
  const m = d.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'printemps';
  if (m >= 6 && m <= 8) return 'ete';
  if (m >= 9 && m <= 11) return 'automne';
  return 'hiver';
}

export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
