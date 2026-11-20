import { describe, expect, it } from 'vitest';
import { computeSeasons, currentSeason, ingredientSeasons } from './season';
import { addJournal, addRecipe, matchRecipe, notMadeSince, stepText, stepsFromEditor, stepsToEditor, type RecipeDraft } from './ops';
import { mergeRecipes } from './merge';
import { emptyRecipesFile, parseRecipesFile, type Recipe } from './types';

const ing = (name: string, n?: number, u: string | null = null) => ({ name, qty: n != null ? [{ n, u }] : [] });
const draft = (over: Partial<RecipeDraft> = {}): RecipeDraft => ({
  title: 'Curry de pois chiches', category: 'Plat', tags: ['végé'], servings: 4,
  ingredients: [ing('Pois chiches cuits', 800, 'g'), ing('Lait de coco', 400, 'ml'), ing('Épinards frais', 300, 'g'), ing('Oignons', 2)],
  steps: ['Émincer {3} oignons.', 'Verser {1} de lait de coco et {0} de pois chiches.'],
  seasons: null, adjustments: '', source: { kind: 'manual' }, ...over,
});

describe('saisons', () => {
  it('reconnaît les produits de saison, pas ceux de toute l’année', () => {
    expect(ingredientSeasons('Poireaux')).toEqual(['automne', 'hiver']);
    expect(ingredientSeasons('Pommes de terre')).toBeNull();
    expect(ingredientSeasons('Pommes')).toEqual(['automne', 'hiver']);
    expect(ingredientSeasons('Tomates pelées')).toBeNull();
    expect(ingredientSeasons('Lait de coco')).toBeNull();
    expect(ingredientSeasons('Fanes de radis')).toEqual(['printemps']);
  });
  it('calcule la saison d’une recette', () => {
    expect(computeSeasons(draft().ingredients)).toEqual({ seasons: ['automne', 'hiver', 'printemps'].sort((a, b) => ['printemps', 'ete', 'automne', 'hiver'].indexOf(a) - ['printemps', 'ete', 'automne', 'hiver'].indexOf(b)), from: ['Épinards frais'] });
    expect(computeSeasons([ing('Poireaux'), ing('Pommes de terre')]).seasons).toEqual(['automne', 'hiver']);
    expect(computeSeasons([ing('Farine'), ing('Sucre')]).seasons).toEqual([]);
    expect(computeSeasons([ing('Tomates'), ing('Poireaux')]).seasons).toEqual(['ete', 'automne', 'hiver']);
    expect(currentSeason(new Date('2026-11-20'))).toBe('automne');
  });
});

describe('étapes et quantités', () => {
  const r = { ...draft(), id: 'r1', journal: [], createdAt: '', updatedAt: '' } as Recipe;
  it('met les quantités des étapes à l’échelle', () => {
    expect(stepText(r, r.steps[1]!, 4)).toBe('Verser 400 ml de lait de coco et 800 g de pois chiches.');
    expect(stepText(r, r.steps[1]!, 8)).toBe('Verser 800 ml de lait de coco et 1,6 kg de pois chiches.');
    expect(stepText(r, r.steps[0]!, 2)).toBe('Émincer 1 oignons.');
  });
  it('passe par « [Ingrédient] » dans le formulaire', () => {
    const text = stepsToEditor(r);
    expect(text).toBe('Émincer [Oignons] oignons.\nVerser [Lait de coco] de lait de coco et [Pois chiches cuits] de pois chiches.');
    expect(stepsFromEditor(text, r.ingredients)).toEqual(r.steps);
    expect(stepsFromEditor('1. Cuire [Riz] 10 min', r.ingredients)).toEqual(['Cuire [Riz] 10 min']);
  });
});

describe('carnet', () => {
  const ctx = { now: '2026-11-20T10:00:00.000Z', makeId: (() => { let n = 0; return (p: string) => `${p}_${++n}`; })() };
  it('cherche aussi dans les ingrédients', () => {
    const r = { ...draft(), id: 'r', journal: [], createdAt: '', updatedAt: '' } as Recipe;
    expect(matchRecipe(r, 'épinard')).toEqual({ ok: true, ing: 'Épinards frais' });
    expect(matchRecipe(r, 'curry').ok).toBe(true);
    expect(matchRecipe(r, 'poireau').ok).toBe(false);
  });
  it('journal : tri par date, « pas faite depuis 6 mois »', () => {
    let { data, id } = addRecipe(emptyRecipesFile(), draft(), ctx);
    data = addJournal(data, id, { date: '2026-03-01', rating: 4, comment: '', auteur: 'Robin' }, ctx);
    data = addJournal(data, id, { date: '2025-12-01', rating: 5, comment: '', auteur: 'Robin' }, ctx);
    const r = data.recipes[0]!;
    expect(r.journal.map((j) => j.date)).toEqual(['2026-03-01', '2025-12-01']);
    expect(notMadeSince(r, 6, new Date('2026-11-20'))).toBe(true);
    expect(notMadeSince(r, 12, new Date('2026-11-20'))).toBe(false);
  });
  it('fusionne deux « Je l’ai fait » notés sur deux téléphones', () => {
    const start = addRecipe(emptyRecipesFile(), draft(), ctx);
    const a = addJournal(start.data, start.id, { date: '2026-11-19', rating: 4, comment: 'A', auteur: 'Robin' }, { ...ctx, now: '2026-11-20T11:00:00.000Z' });
    const b = addJournal(start.data, start.id, { date: '2026-11-20', rating: 5, comment: 'B', auteur: 'Robin' }, { ...ctx, now: '2026-11-20T12:00:00.000Z' });
    const m = mergeRecipes(start.data, a, b);
    expect(m.recipes[0]!.journal.map((j) => j.comment)).toEqual(['B', 'A']);
  });
  it('relit un fichier incomplet sans tout refuser', () => {
    const f = parseRecipesFile({ schemaVersion: 1, recipes: [{ id: 'r', title: 'X' }, { nope: 1 }] });
    expect(f?.recipes).toHaveLength(1);
    expect(f?.recipes[0]?.category).toBe('Plat');
  });
});
