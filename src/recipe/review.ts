import { classify } from '../model/dict';
import { makePart, mergeQty, normalizeName } from '../model/qty';
import type { Entry } from '../model/lists';
import type { DataFile, QtyPart, RayonId } from '../model/types';
import type { Recipe } from './read';

// Écran de revue : ce que la recette ajouterait à la liste, ajusté au nombre de portions.

export interface ReviewLine {
  name: string;
  qty: QtyPart[];
  rayon: RayonId;
  staple: boolean;
  /** Quantité déjà dans la liste de destination (article non coché du même nom), et le total après ajout. */
  existing: QtyPart[] | null;
  merged: QtyPart[] | null;
}

/** Arrondit une quantité mise à l'échelle à quelque chose d'achetable. */
export function scaleAmount(n: number, u: string | null, factor: number): number {
  const x = n * factor;
  if (u === 'g' || u === 'ml') {
    if (x < 20) return Math.max(1, Math.round(x));
    if (x < 100) return Math.round(x / 5) * 5;
    return Math.round(x / 10) * 10;
  }
  if (u == null) return Math.max(1, Math.ceil(x - 1e-9)); // on n'achète pas 1,5 oignon
  return Math.max(0.5, Math.ceil(x * 2 - 1e-9) / 2);
}

export function reviewLines(d: DataFile, listId: string, recipe: Recipe, portions: number): ReviewLine[] {
  const base = recipe.servings ?? portions;
  const factor = base > 0 ? portions / base : 1;
  const list = d.lists.find((l) => l.id === listId);
  return recipe.ingredients.map((ing) => {
    const key = normalizeName(ing.name);
    const known = d.history[key];
    let qty: QtyPart[] = [];
    if (ing.quantity != null) {
      const p = makePart(ing.quantity, ing.unit);
      qty = [{ n: scaleAmount(p.n!, p.u, factor), u: p.u }];
    }
    const ex = list?.items.find((i) => !i.checked && normalizeName(i.name) === key);
    return {
      name: known?.name ?? ing.name,
      qty,
      rayon: classify(ing.name, d.history),
      staple: known?.staple ?? false,
      existing: ex ? ex.qty : null,
      merged: ex ? mergeQty(ex.qty, qty) : null,
    };
  });
}

export const linesToEntries = (lines: ReviewLine[], selected: boolean[]): Entry[] =>
  lines.filter((_, i) => selected[i]).map((l) => ({ name: l.name, qty: l.qty }));
