import type { QtyPart } from '../model/types';

// Modèle de recettes.json (dépôt privé boire-et-manger-data), issu du grill du 18-19/11/2026
// et de la maquette Recettes validée le 20/11/2026.

export const CATEGORIES = ['Apéro', 'Entrée', 'Plat', 'Dessert', 'Boisson', 'Bases & sauces', 'Petit-déj & goûter'] as const;
export type Category = (typeof CATEGORIES)[number];

export const SEASONS = ['printemps', 'ete', 'automne', 'hiver'] as const;
export type Season = (typeof SEASONS)[number];
export const SEASON_LABELS: Record<Season, string> = { printemps: 'Printemps', ete: 'Été', automne: 'Automne', hiver: 'Hiver' };

export interface RecipeIngredient {
  name: string;
  /** Une partie au plus (masses en g, volumes en ml, voir model/qty.ts) ; vide = sans quantité. */
  qty: QtyPart[];
}

/** Photo rangée dans le dépôt : photos/<id>.jpg (grande) et photos/<id>.t.jpg (vignette). */
export type PhotoId = string;

export interface RecipeSource {
  kind: 'photo' | 'link' | 'manual';
  url?: string; // lien d'origine
  photo?: PhotoId; // photo d'origine (page de livre, capture)
  label?: string; // « Livre Simple, p. 182 », « marmiton.org »
}

export interface JournalEntry {
  id: string; // « j_… »
  date: string; // AAAA-MM-JJ
  rating: number | null; // 1 à 5
  comment: string;
  photo?: PhotoId;
  auteur: string; // Robin seul en v1, prévu pour une 2e personne
}

export interface Recipe {
  id: string; // « r_… »
  title: string;
  category: Category;
  tags: string[];
  servings: number | null;
  ingredients: RecipeIngredient[];
  /** Étapes. « {n} » renvoie à la quantité de l'ingrédient n, qui suit le nombre de portions. */
  steps: string[];
  /** Saison choisie à la main ; null = calculée d'après les ingrédients (season.ts). */
  seasons: Season[] | null;
  adjustments: string;
  source: RecipeSource;
  cover?: PhotoId; // photo du plat
  journal: JournalEntry[]; // le plus récent en premier
  createdAt: string;
  updatedAt: string;
}

export interface RecipesFile {
  schemaVersion: 1;
  recipes: Recipe[];
}

export const RECIPES_FILE = 'recettes.json';

export const emptyRecipesFile = (): RecipesFile => ({ schemaVersion: 1, recipes: [] });

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Vérification minimale de recettes.json ; complète les champs manquants plutôt que de tout refuser. */
export function parseRecipesFile(raw: unknown): RecipesFile | null {
  if (!isObj(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.recipes)) return null;
  const recipes: Recipe[] = [];
  for (const r of raw.recipes) {
    if (!isObj(r) || typeof r.id !== 'string' || typeof r.title !== 'string') continue;
    const x = r as unknown as Partial<Recipe>;
    recipes.push({
      ...x,
      id: r.id,
      title: r.title,
      category: (CATEGORIES as readonly string[]).includes(x.category as string) ? (x.category as Category) : 'Plat',
      tags: Array.isArray(x.tags) ? x.tags.filter((t) => typeof t === 'string') : [],
      servings: typeof x.servings === 'number' ? x.servings : null,
      ingredients: Array.isArray(x.ingredients) ? x.ingredients.filter((i) => isObj(i) && typeof i.name === 'string') : [],
      steps: Array.isArray(x.steps) ? x.steps.filter((s) => typeof s === 'string') : [],
      seasons: Array.isArray(x.seasons) ? x.seasons.filter((s) => (SEASONS as readonly string[]).includes(s)) : null,
      adjustments: typeof x.adjustments === 'string' ? x.adjustments : '',
      source: isObj(x.source) ? (x.source as RecipeSource) : { kind: 'manual' },
      journal: Array.isArray(x.journal) ? x.journal.filter((j) => isObj(j) && typeof j.id === 'string') : [],
      createdAt: x.createdAt ?? new Date(0).toISOString(),
      updatedAt: x.updatedAt ?? new Date(0).toISOString(),
    });
  }
  return { schemaVersion: 1, recipes };
}
