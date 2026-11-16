import { describe, expect, it } from 'vitest';
import { mergeData } from './merge';
import { clone, data, hist, ids, item, list } from './fixtures';

const base = data([list('bio', [item('lait'), item('pain')]), list('picard', [item('glace')])], {
  lait: hist('Lait', { freq: { bio: 3 } }),
});

describe('fusion à trois', () => {
  it('ajouts des deux côtés dans la même liste : tout est gardé', () => {
    const local = clone(base);
    local.lists[0]!.items.push(item('oeuf'));
    const remote = clone(base);
    remote.lists[0]!.items.push(item('beurre'));
    expect(ids(mergeData(base, local, remote))).toEqual({ bio: ['beurre', 'lait', 'oeuf', 'pain'], picard: ['glace'] });
  });

  it('une suppression ne ressuscite pas', () => {
    const local = clone(base);
    local.lists[0]!.items = local.lists[0]!.items.filter((i) => i.id !== 'pain');
    const remote = clone(base);
    remote.lists[1]!.items.push(item('frites'));
    expect(ids(mergeData(base, local, remote))).toEqual({ bio: ['lait'], picard: ['frites', 'glace'] });
  });

  it('supprimé ici mais modifié là-bas : on garde la version modifiée', () => {
    const local = clone(base);
    local.lists[0]!.items = local.lists[0]!.items.filter((i) => i.id !== 'pain');
    const remote = clone(base);
    remote.lists[0]!.items[1] = item('pain', { checked: true, updatedAt: '2026-11-02T00:00:00Z' });
    const m = mergeData(base, local, remote);
    expect(m.lists[0]!.items.find((i) => i.id === 'pain')?.checked).toBe(true);
  });

  it('même article modifié des deux côtés : le plus récent gagne', () => {
    const local = clone(base);
    local.lists[0]!.items[0] = item('lait', { qty: [{ n: 2, u: null }], updatedAt: '2026-11-03T00:00:00Z' });
    const remote = clone(base);
    remote.lists[0]!.items[0] = item('lait', { checked: true, updatedAt: '2026-11-02T00:00:00Z' });
    const lait = mergeData(base, local, remote).lists[0]!.items.find((i) => i.id === 'lait')!;
    expect(lait.qty).toEqual([{ n: 2, u: null }]);
    expect(lait.checked).toBe(false);
  });

  it("« Déplacer vers » ici + case cochée là-bas sur un autre article de la même liste", () => {
    const local = clone(base);
    const [pain] = local.lists[0]!.items.splice(1, 1);
    local.lists[1]!.items.push({ ...pain!, updatedAt: '2026-11-02T00:00:00Z' });
    const remote = clone(base);
    remote.lists[0]!.items[0] = item('lait', { checked: true, updatedAt: '2026-11-02T00:00:00Z' });
    const m = mergeData(base, local, remote);
    expect(ids(m)).toEqual({ bio: ['lait'], picard: ['glace', 'pain'] });
    expect(m.lists[0]!.items[0]!.checked).toBe(true);
  });

  it('les articles d’une liste supprimée partent avec elle', () => {
    const local = clone(base);
    local.lists = local.lists.filter((l) => l.id !== 'picard');
    const remote = clone(base);
    expect(ids(mergeData(base, local, remote))).toEqual({ bio: ['lait', 'pain'] });
  });

  it('compteurs d’achats incrémentés des deux côtés : ils s’additionnent', () => {
    const local = clone(base);
    local.history.lait = hist('Lait', { freq: { bio: 4 }, lastBoughtAt: '2026-11-02T00:00:00Z' });
    const remote = clone(base);
    remote.history.lait = hist('Lait', { freq: { bio: 5, picard: 1 }, lastBoughtAt: '2026-11-03T00:00:00Z' });
    const h = mergeData(base, local, remote).history.lait!;
    expect(h.freq).toEqual({ bio: 6, picard: 1 });
    expect(h.lastBoughtAt).toBe('2026-11-03T00:00:00Z');
  });

  it("ordre des rayons : celui du côté qui l'a changé", () => {
    const remote = clone(base);
    remote.rayonOrder = ['cre', ...remote.rayonOrder.filter((r) => r !== 'cre')];
    expect(mergeData(base, clone(base), remote).rayonOrder[0]).toBe('cre');
  });
});
