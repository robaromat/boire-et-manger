import { describe, expect, it } from 'vitest';
import { formatQty, mergeQty, normalizeName, parseEntries, parseEntry } from './qty';

describe('normalizeName', () => {
  it('ignore casse, accents, ligatures et pluriels simples', () => {
    expect(normalizeName('Œufs')).toBe(normalizeName('oeuf'));
    expect(normalizeName('Pois chiches')).toBe(normalizeName('pois chiche'));
    expect(normalizeName('Épinards')).toBe('epinard');
    expect(normalizeName("Lait d'avoine")).toBe('lait d avoine');
  });
});

describe('parseEntry', () => {
  it('quantité devant ou derrière, unités converties', () => {
    expect(parseEntry('2 lait')).toEqual({ name: 'Lait', qty: [{ n: 2, u: null }] });
    expect(parseEntry('lait 1L')).toEqual({ name: 'Lait', qty: [{ n: 1000, u: 'ml' }] });
    expect(parseEntry('farine 500 g')).toEqual({ name: 'Farine', qty: [{ n: 500, u: 'g' }] });
    expect(parseEntry('500 g de farine')).toEqual({ name: 'Farine', qty: [{ n: 500, u: 'g' }] });
    expect(parseEntry("1,5 kg d'oranges")).toEqual({ name: 'Oranges', qty: [{ n: 1500, u: 'g' }] });
    expect(parseEntry('1 gourde')).toEqual({ name: 'Gourde', qty: [{ n: 1, u: null }] });
  });
  it('sans quantité', () => {
    expect(parseEntry('pain')).toEqual({ name: 'Pain', qty: [] });
    expect(parseEntry('   ')).toBeNull();
  });
  it('plusieurs articles séparés par des virgules', () => {
    expect(parseEntries('lait, pain, 6 œufs').map((e) => e.name)).toEqual(['Lait', 'Pain', 'Œufs']);
  });
});

describe('mergeQty / formatQty', () => {
  it('additionne les mêmes unités et passe en kg / L', () => {
    expect(formatQty(mergeQty([{ n: 500, u: 'g' }], [{ n: 800, u: 'g' }]))).toBe('1,3 kg');
    expect(formatQty(mergeQty([{ n: 2, u: null }], [{ n: 1, u: null }]))).toBe('×3');
    expect(formatQty(mergeQty([{ n: 400, u: 'ml' }], [{ n: 600, u: 'ml' }]))).toBe('1 L');
  });
  it('juxtapose les unités différentes', () => {
    expect(formatQty(mergeQty([{ n: 2, u: null }], [{ n: 1, u: 'filet' }]))).toBe('×2 + 1 filet');
  });
});
