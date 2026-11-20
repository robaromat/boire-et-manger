import { mergeEntities } from '../sync/merge';
import type { JournalEntry, Recipe, RecipesFile } from './types';

// Fusion « à trois » de recettes.json (même principe que Courses, voir sync/merge.ts) :
// recette par recette ; si les deux appareils ont modifié la même recette, la plus récente gagne pour ses champs,
// et son journal est fusionné entrée par entrée (un « Je l'ai fait » noté sur chaque téléphone est gardé).

const byId = <T extends { id: string }>(xs: T[] | undefined) => new Map<string, T>((xs ?? []).map((x) => [x.id, x]));

function mergeRecipe(l: Recipe, r: Recipe, b: Recipe | undefined): Recipe {
  const win = l.updatedAt >= r.updatedAt ? l : r;
  const journal = mergeEntities<JournalEntry>(byId(b?.journal), byId(l.journal), byId(r.journal), (x) => x);
  return { ...win, journal: [...journal.values()].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0)) };
}

export function mergeRecipes(base: RecipesFile | null, local: RecipesFile, remote: RecipesFile): RecipesFile {
  const m = mergeEntities(byId(base?.recipes), byId(local.recipes), byId(remote.recipes), mergeRecipe);
  return { schemaVersion: 1, recipes: [...m.values()] };
}
