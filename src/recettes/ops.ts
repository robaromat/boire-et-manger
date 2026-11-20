import { newId } from '../lib/ids';
import { formatPart, makePart, normalizeName, parseQtyText } from '../model/qty';
import type { QtyPart } from '../model/types';
import { scaleAmount } from '../recipe/review';
import { CATEGORIES, type Category, type JournalEntry, type Recipe, type RecipeIngredient, type RecipesFile } from './types';

// Opérations sur le carnet de recettes. Fonctions pures, comme pour Courses : chaque recette modifiée reçoit
// un nouvel updatedAt, qui départage deux appareils.

type Ctx = { now?: string; makeId?: (p: string) => string };
const nowOf = (c: Ctx) => c.now ?? new Date().toISOString();
const idOf = (c: Ctx, p: string) => (c.makeId ?? newId)(p);

export type RecipeDraft = Omit<Recipe, 'id' | 'journal' | 'createdAt' | 'updatedAt'>;

export function addRecipe(d: RecipesFile, draft: RecipeDraft, ctx: Ctx = {}): { data: RecipesFile; id: string } {
  const now = nowOf(ctx);
  const id = idOf(ctx, 'r');
  const r: Recipe = { ...draft, id, journal: [], createdAt: now, updatedAt: now };
  return { data: { ...d, recipes: [r, ...d.recipes] }, id };
}

export function updateRecipe(d: RecipesFile, id: string, patch: Partial<Recipe> | ((r: Recipe) => Partial<Recipe>), ctx: Ctx = {}): RecipesFile {
  const now = nowOf(ctx);
  return {
    ...d,
    recipes: d.recipes.map((r) => (r.id === id ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch), updatedAt: now } : r)),
  };
}

export const deleteRecipe = (d: RecipesFile, id: string): RecipesFile => ({ ...d, recipes: d.recipes.filter((r) => r.id !== id) });

export function addJournal(d: RecipesFile, id: string, e: Omit<JournalEntry, 'id'>, ctx: Ctx = {}): RecipesFile {
  const entry: JournalEntry = { ...e, id: idOf(ctx, 'j') };
  return updateRecipe(d, id, (r) => ({ journal: [entry, ...r.journal].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)) }), ctx);
}

export const removeJournal = (d: RecipesFile, id: string, jid: string, ctx: Ctx = {}) =>
  updateRecipe(d, id, (r) => ({ journal: r.journal.filter((j) => j.id !== jid) }), ctx);

// ---------- Lecture ----------

export function avgRating(r: Recipe): number | null {
  const notes = r.journal.map((j) => j.rating).filter((n): n is number => typeof n === 'number');
  return notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : null;
}

export const lastMade = (r: Recipe): string | null => r.journal[0]?.date ?? null;

/** Pas faite depuis au moins `months` mois (faite au moins une fois). */
export function notMadeSince(r: Recipe, months: number, now = new Date()): boolean {
  const last = lastMade(r);
  if (!last) return false;
  const lim = new Date(now);
  lim.setMonth(lim.getMonth() - months);
  return last < lim.toISOString().slice(0, 10);
}

/** Recherche dans le titre, les tags, puis les ingrédients. Renvoie l'ingrédient trouvé pour l'afficher. */
export function matchRecipe(r: Recipe, q: string): { ok: boolean; ing?: string } {
  const n = normalizeName(q);
  if (!n) return { ok: true };
  if (normalizeName(r.title).includes(n) || r.tags.some((t) => normalizeName(t).includes(n))) return { ok: true };
  const ing = r.ingredients.find((i) => normalizeName(i.name).includes(n));
  return ing ? { ok: true, ing: ing.name } : { ok: false };
}

export const allTags = (d: RecipesFile) =>
  [...new Set(d.recipes.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, 'fr'));

// ---------- Quantités et étapes ----------

/** Quantité d'un ingrédient pour `portions` (inchangée si la recette n'indique pas de portions). */
export function scaledQty(r: Recipe, ing: RecipeIngredient, portions: number): QtyPart[] {
  const f = r.servings ? portions / r.servings : 1;
  return ing.qty.map((p) => (p.n == null || Math.abs(f - 1) < 1e-9 ? p : { n: scaleAmount(p.n, p.u, f), u: p.u }));
}

/** Quantité écrite dans une phrase : « 2 », « 400 g », « 1,5 c. à s. ». */
export function inlineQty(q: QtyPart[]): string {
  return q.map((p) => (p.n != null && p.u == null ? p.n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : formatPart(p))).join(' + ');
}

export type StepPart = string | { qty: string };

/** Découpe une étape : texte et quantités (« {n} ») mises à l'échelle. */
export function stepParts(r: Recipe, step: string, portions: number): StepPart[] {
  const out: StepPart[] = [];
  let last = 0;
  for (const m of step.matchAll(/\{(\d+)\}/g)) {
    const ing = r.ingredients[Number(m[1])];
    out.push(step.slice(last, m.index));
    out.push(ing ? { qty: inlineQty(scaledQty(r, ing, portions)) || ing.name.toLowerCase() } : m[0]);
    last = m.index! + m[0].length;
  }
  out.push(step.slice(last));
  return out.filter((p) => p !== '');
}

export const stepText = (r: Recipe, step: string, portions: number) =>
  stepParts(r, step, portions)
    .map((p) => (typeof p === 'string' ? p : p.qty))
    .join('');

// ---------- Édition ----------
// Dans le formulaire, « {n} » s'écrit « [Nom de l'ingrédient] » : lisible, et la quantité suit toujours les portions.

export function stepsToEditor(r: Pick<Recipe, 'steps' | 'ingredients'>): string {
  return r.steps.map((s) => s.replace(/\{(\d+)\}/g, (m, n) => (r.ingredients[Number(n)] ? `[${r.ingredients[Number(n)]!.name}]` : m))).join('\n');
}

export function stepsFromEditor(text: string, ingredients: RecipeIngredient[]): string[] {
  const idx = new Map(ingredients.map((i, k) => [normalizeName(i.name), k]));
  return text
    .split('\n')
    .map((l) => l.trim().replace(/^\d+[.)]\s*/, ''))
    .filter(Boolean)
    .map((l) => l.replace(/\[([^\]]+)\]/g, (m, name: string) => (idx.has(normalizeName(name)) ? `{${idx.get(normalizeName(name))}}` : m)));
}

/** Quantité affichée dans le formulaire. */
export const qtyToEditor = (q: QtyPart[]) => q.map(formatPart).join(' + ').replace(/^×/, '');

export function qtyFromEditor(text: string): QtyPart[] {
  const parts = parseQtyText(text);
  return parts.length ? [parts[0]!] : [];
}

export const parseTags = (text: string) =>
  [...new Set(text.split(/[,;#]/).map((t) => t.trim().toLowerCase()).filter(Boolean))];

export const asCategory = (c: string | null | undefined): Category | null =>
  (CATEGORIES as readonly string[]).includes(c ?? '') ? (c as Category) : null;

/** Ingrédient lu par ChatGPT → ingrédient du carnet. */
export const ingredientFrom = (name: string, quantity: number | null, unit: string | null): RecipeIngredient => ({
  name: name.trim(),
  qty: quantity != null ? [makePart(quantity, unit)] : unit ? [{ n: null, u: unit }] : [],
});

// ---------- Partage ----------

export function recipeAsText(r: Recipe, portions = r.servings ?? 0): string {
  const lines = [r.title, ''];
  lines.push(r.servings ? `Ingrédients (pour ${portions}) :` : 'Ingrédients :');
  for (const i of r.ingredients) {
    const q = inlineQty(scaledQty(r, i, portions || 1));
    lines.push(`- ${i.name}${q ? ` : ${q}` : ''}`);
  }
  if (r.steps.length) {
    lines.push('', 'Étapes :');
    r.steps.forEach((s, k) => lines.push(`${k + 1}. ${stepText(r, s, portions || 1)}`));
  }
  if (r.adjustments.trim()) lines.push('', `Mes ajustements : ${r.adjustments.trim()}`);
  if (r.source.url) lines.push('', `Source : ${r.source.url}`);
  else if (r.source.label) lines.push('', `Source : ${r.source.label}`);
  return lines.join('\n');
}
