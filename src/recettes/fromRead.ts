import type { Recipe as ReadRecipe } from '../recipe/read';
import { asCategory, ingredientFrom, type RecipeDraft } from './ops';
import type { RecipeSource } from './types';

/** Recette lue par ChatGPT → brouillon de fiche du carnet (à vérifier avant d'enregistrer). */
export function draftFromRead(r: ReadRecipe, source: RecipeSource): RecipeDraft {
  return {
    title: r.title,
    category: asCategory(r.category) ?? 'Plat',
    tags: r.tags ?? [],
    servings: r.servings,
    ingredients: r.ingredients.map((i) => ingredientFrom(i.name, i.quantity, i.unit)),
    steps: r.steps ?? [],
    seasons: null,
    adjustments: '',
    source: { ...source, label: source.label ?? r.source ?? undefined },
  };
}

export const emptyDraft = (): RecipeDraft => ({
  title: '',
  category: 'Plat',
  tags: [],
  servings: null,
  ingredients: [],
  steps: [],
  seasons: null,
  adjustments: '',
  source: { kind: 'manual' },
});

/** Ingrédients du carnet → forme attendue par l'écran de revue des courses. */
export function asReadRecipe(r: Pick<RecipeDraft, 'title' | 'servings' | 'ingredients'>): ReadRecipe {
  return {
    title: r.title,
    servings: r.servings,
    ingredients: r.ingredients.map((i) => ({ name: i.name, quantity: i.qty[0]?.n ?? null, unit: i.qty[0]?.n != null ? i.qty[0].u : null })),
  };
}
