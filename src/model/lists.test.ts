import { describe, expect, it } from 'vitest';
import { DICT_SIZE, classify, classifyByDict } from './dict';
import {
  addEntries, createList, deleteList, finishShopping, habituels, moveItem, suggestions, toggleItem, updateItem,
} from './lists';
import { parseEntries, parseQtyText } from './qty';
import { data, hist, item, list } from '../sync/fixtures';
import type { DataFile } from './types';

let n = 0;
const ctx = { now: '2026-11-20T10:00:00Z', makeId: (p: 'i' | 'l') => `${p}_${++n}` };

describe('dictionnaire', () => {
  it('contient plusieurs centaines de mots-clés', () => {
    expect(DICT_SIZE).toBeGreaterThan(500);
  });

  it.each([
    ['Poireaux', 'fl'], ['Pommes de terre', 'fl'], ['Baguette', 'boul'], ['Farine T65', 'vrac'],
    ["Lait d'avoine", 'cre'], ['Lait de coco', 'vrac'], ['Œufs', 'cre'], ['Yaourt à la fraise', 'cre'],
    ["Jus d'orange", 'boi'], ['Tofu fumé', 'trait'], ['Petits pois', 'surg'], ['Glace vanille', 'surg'],
    ['Liquide vaisselle', 'hyg'], ['Huile essentielle de lavande', 'hyg'], ["Huile d'olive", 'vrac'],
    ['Pâtes complètes', 'vrac'], ['Comté 18 mois', 'cre'], ['Tomates pelées', 'vrac'], ['Tomates', 'fl'],
  ])('%s → %s', (name, r) => {
    expect(classifyByDict(name)).toBe(r);
  });

  it('inconnu → Divers ; l’historique (appris) passe avant le dictionnaire', () => {
    expect(classify('Chambre à air 700×28', {})).toBe('div');
    expect(classify('Épinards', { epinard: hist('Épinards', { rayon: 'surg' }) })).toBe('surg');
  });
});

describe('ajout', () => {
  const base = data([list('bio', [item('i_lait', { name: 'Lait', qty: [{ n: 1, u: null }], rayon: 'cre' })]), list('pic')]);

  it('classe, additionne avec l’existant et retient dans l’historique', () => {
    const { data: d, ids } = addEntries(base, 'bio', parseEntries('2 lait, farine 500 g, pain'), ctx);
    const items = d.lists[0]!.items;
    expect(ids[0]).toBe('i_lait');
    expect(items.find((i) => i.id === 'i_lait')!.qty).toEqual([{ n: 3, u: null }]);
    expect(items.find((i) => i.name === 'Farine')).toMatchObject({ rayon: 'vrac', qty: [{ n: 500, u: 'g' }] });
    expect(items.find((i) => i.name === 'Pain')!.rayon).toBe('boul');
    expect(d.history.farine?.rayon).toBe('vrac');
    expect(base.lists[0]!.items).toHaveLength(1); // pas de mutation
  });

  it('reprend l’orthographe de l’historique', () => {
    const b = { ...base, history: { oeuf: hist('Œufs', { rayon: 'cre' }) } };
    expect(addEntries(b, 'bio', parseEntries('6 oeufs'), ctx).data.lists[0]!.items.at(-1)!.name).toBe('Œufs');
  });
});

describe('édition, déplacement, panier', () => {
  it('changer le rayon l’apprend pour la prochaine fois, avec « toujours à la maison »', () => {
    const d0 = data([list('bio', [item('a', { name: 'Épinards', rayon: 'fl' })])]);
    const d1 = updateItem(d0, 'a', { name: 'Épinards', qty: [], rayon: 'surg', staple: true }, ctx);
    expect(d1.lists[0]!.items[0]).toMatchObject({ rayon: 'surg', updatedAt: ctx.now });
    expect(d1.history.epinard).toMatchObject({ rayon: 'surg', staple: true });
    const { data: d2 } = addEntries(deleteList(d1, 'x'), 'bio', parseEntries('épinard'), ctx);
    expect(d2.lists[0]!.items).toHaveLength(1); // fusion avec l'existant
  });

  it('déplacer garde l’id, ou fusionne avec le même article là-bas', () => {
    const d0 = data([
      list('bio', [item('a', { name: 'Glace', qty: [{ n: 1, u: null }] }), item('b', { name: 'Riz' })]),
      list('pic', [item('c', { name: 'Glace', qty: [{ n: 2, u: null }] })]),
    ]);
    const d1 = moveItem(d0, 'b', 'pic', ctx);
    expect(d1.lists[1]!.items.map((i) => i.id)).toEqual(['c', 'b']);
    const d2 = moveItem(d1, 'a', 'pic', ctx);
    expect(d2.lists[0]!.items).toHaveLength(0);
    expect(d2.lists[1]!.items.find((i) => i.id === 'c')!.qty).toEqual([{ n: 3, u: null }]);
  });

  it('courses terminées : vide le panier et compte les achats par magasin', () => {
    const d0 = data([list('bio', [item('a', { name: 'Lait', rayon: 'cre', qty: [{ n: 2, u: null }] }), item('b', { name: 'Pain' })])]);
    const { data: d1, count } = finishShopping(toggleItem(d0, 'a', ctx), 'bio', ctx);
    expect(count).toBe(1);
    expect(d1.lists[0]!.items.map((i) => i.id)).toEqual(['b']);
    expect(d1.history.lait).toMatchObject({ freq: { bio: 1 }, lastQty: [{ n: 2, u: null }], lastBoughtAt: ctx.now });
  });
});

describe('habituels et suggestions', () => {
  const d = data([list('bio', [item('a', { name: 'Comté' })])], {
    banane: hist('Bananes', { freq: { bio: 9 } }),
    comte: hist('Comté', { freq: { bio: 12 } }),
    sel: hist('Sel', { freq: { bio: 20 }, staple: true }),
    frite: hist('Frites', { freq: { pic: 4 } }),
    lait: hist('Lait', { freq: { bio: 3 } }),
    'lait d avoine': hist("Lait d'avoine", { freq: { bio: 7 } }),
  });

  it('habituels : par fréquence dans ce magasin, sans basiques ni articles déjà à prendre', () => {
    expect(habituels(d, 'bio').map((h) => h.name)).toEqual(['Bananes', "Lait d'avoine", 'Lait']);
  });

  it('suggestions : début du nom d’abord, puis fréquence', () => {
    expect(suggestions(d, 'bio', 'lai').map((h) => h.name)).toEqual(["Lait d'avoine", 'Lait']);
    expect(suggestions(d, 'bio', 'avoine').map((h) => h.name)).toEqual(["Lait d'avoine"]);
  });

  it('créer une liste', () => {
    const { data: d2, id } = createList(d, '  leroy merlin ', ctx);
    expect(d2.lists.find((l) => l.id === id)?.name).toBe('Leroy merlin');
  });
});

describe('quantité saisie dans la fiche', () => {
  it.each([
    ['2', [{ n: 2, u: null }]],
    ['×2', [{ n: 2, u: null }]],
    ['1,5 kg + 2', [{ n: 1500, u: 'g' }, { n: 2, u: null }]],
    ['3 gousses', [{ n: 3, u: 'gousses' }]],
    ['un peu', [{ n: null, u: 'un peu' }]],
    ['', []],
  ])('« %s »', (t, q) => {
    expect(parseQtyText(t)).toEqual(q);
  });
});

describe('recettes dans une liste (« pour : … »)', () => {
  const ctx = { now: '2026-11-20T10:00:00.000Z', makeId: (() => { let n = 0; return (p: string) => `${p}_${++n}`; })() };
  const base = (): DataFile => ({ schemaVersion: 1, rayonOrder: [], history: {}, lists: [{ id: 'l1', name: 'Bio', createdAt: '', items: [] }] });

  it('garde la recette d’origine et retire sa part seulement', async () => {
    const { addEntries, removeRecipeFromList, recipesInList } = await import('./lists');
    let d = addEntries(base(), 'l1', [{ name: 'Lait', qty: [{ n: 1000, u: 'ml' }] }], ctx).data;
    d = addEntries(d, 'l1', [{ name: 'Lait', qty: [{ n: 400, u: 'ml' }], pour: { rid: 'r1', title: 'Curry' } }, { name: 'Oignons', qty: [{ n: 2, u: null }], pour: { rid: 'r1', title: 'Curry' } }], ctx).data;
    d = addEntries(d, 'l1', [{ name: 'Oignons', qty: [{ n: 1, u: null }], pour: { rid: 'r2', title: 'Soupe' } }], ctx).data;
    expect(recipesInList(d, 'l1').map((r) => [r.title, r.count])).toEqual([['Curry', 2], ['Soupe', 1]]);
    d = removeRecipeFromList(d, 'l1', 'r1', ctx);
    const items = d.lists[0]!.items;
    expect(items.find((i) => i.name === 'Lait')?.qty).toEqual([{ n: 1000, u: 'ml' }]);
    expect(items.find((i) => i.name === 'Oignons')?.qty).toEqual([{ n: 1, u: null }]);
    d = removeRecipeFromList(d, 'l1', 'r2', ctx);
    expect(d.lists[0]!.items.map((i) => i.name)).toEqual(['Lait']);
  });
});
