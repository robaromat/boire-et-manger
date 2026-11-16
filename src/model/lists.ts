import { newId } from '../lib/ids';
import { classify } from './dict';
import { mergeQty, normalizeName } from './qty';
import type { DataFile, HistoryEntry, Item, QtyPart, RayonId, ShopList } from './types';

// Opérations sur les listes. Fonctions pures : elles renvoient un nouveau DataFile sans toucher l'ancien
// (le moteur de synchro compare les versions). Chaque article modifié reçoit un nouvel updatedAt :
// c'est ce qui départage deux appareils qui ont modifié le même article.

export interface Entry {
  name: string;
  qty: QtyPart[];
}

type Ctx = { now?: string; makeId?: (p: 'i' | 'l') => string };
const nowOf = (c: Ctx) => c.now ?? new Date().toISOString();
const idOf = (c: Ctx, p: 'i' | 'l') => (c.makeId ?? newId)(p);

const mapList = (d: DataFile, listId: string, fn: (l: ShopList) => ShopList): DataFile => ({
  ...d,
  lists: d.lists.map((l) => (l.id === listId ? fn(l) : l)),
});

export function findItem(d: DataFile, id: string): { list: ShopList; item: Item } | null {
  for (const list of d.lists) {
    const item = list.items.find((i) => i.id === id);
    if (item) return { list, item };
  }
  return null;
}

/** Inscrit (ou complète) un article dans l'historique. Le rayon n'est écrasé que si `learn` est vrai. */
function remember(
  h: Record<string, HistoryEntry>,
  name: string,
  rayon: RayonId,
  opts: { learn?: boolean; staple?: boolean } = {},
): Record<string, HistoryEntry> {
  const key = normalizeName(name);
  if (!key) return h;
  const cur = h[key];
  const next: HistoryEntry = cur
    ? { ...cur, name, rayon: opts.learn ? rayon : cur.rayon, staple: opts.staple ?? cur.staple }
    : { name, rayon, staple: opts.staple ?? false, freq: {}, lastQty: [], lastBoughtAt: null };
  return { ...h, [key]: next };
}

/** Ajoute des articles à une liste. Un article déjà présent (non coché) voit sa quantité augmenter. */
export function addEntries(d: DataFile, listId: string, entries: Entry[], ctx: Ctx = {}): { data: DataFile; ids: string[] } {
  const now = nowOf(ctx);
  const list = d.lists.find((l) => l.id === listId);
  if (!list) return { data: d, ids: [] };
  let items = [...list.items];
  let history = d.history;
  const ids: string[] = [];
  for (const e of entries) {
    const key = normalizeName(e.name);
    if (!key) continue;
    const idx = items.findIndex((i) => !i.checked && normalizeName(i.name) === key);
    if (idx >= 0) {
      const ex = items[idx]!;
      items[idx] = { ...ex, qty: mergeQty(ex.qty, e.qty), updatedAt: now };
      ids.push(ex.id);
      continue;
    }
    const known = history[key];
    const rayon = classify(e.name, history);
    const item: Item = {
      id: idOf(ctx, 'i'),
      name: known?.name ?? e.name,
      qty: e.qty,
      rayon,
      checked: false,
      addedAt: now,
      updatedAt: now,
    };
    items = [...items, item];
    history = remember(history, item.name, rayon);
    ids.push(item.id);
  }
  return { data: { ...mapList(d, listId, (l) => ({ ...l, items })), history }, ids };
}

export function toggleItem(d: DataFile, id: string, ctx: Ctx = {}): DataFile {
  const now = nowOf(ctx);
  return {
    ...d,
    lists: d.lists.map((l) =>
      l.items.some((i) => i.id === id)
        ? { ...l, items: l.items.map((i) => (i.id === id ? { ...i, checked: !i.checked, updatedAt: now } : i)) }
        : l,
    ),
  };
}

export function removeItem(d: DataFile, id: string): DataFile {
  return { ...d, lists: d.lists.map((l) => ({ ...l, items: l.items.filter((i) => i.id !== id) })) };
}

export interface ItemEdit {
  name: string;
  qty: QtyPart[];
  rayon: RayonId;
  staple: boolean;
}

/** Modifie un article. Le rayon choisi est retenu dans l'historique : la prochaine fois, il sera classé pareil. */
export function updateItem(d: DataFile, id: string, edit: ItemEdit, ctx: Ctx = {}): DataFile {
  const now = nowOf(ctx);
  const found = findItem(d, id);
  if (!found) return d;
  const name = edit.name.trim() || found.item.name;
  const next = mapList(d, found.list.id, (l) => ({
    ...l,
    items: l.items.map((i) => (i.id === id ? { ...i, name, qty: edit.qty, rayon: edit.rayon, updatedAt: now } : i)),
  }));
  return { ...next, history: remember(d.history, name, edit.rayon, { learn: true, staple: edit.staple }) };
}

/** « Déplacer vers… » : l'article garde son identifiant, sauf s'il rejoint le même article déjà présent là-bas. */
export function moveItem(d: DataFile, id: string, destId: string, ctx: Ctx = {}): DataFile {
  const now = nowOf(ctx);
  const found = findItem(d, id);
  const dest = d.lists.find((l) => l.id === destId);
  if (!found || !dest || found.list.id === destId) return d;
  const key = normalizeName(found.item.name);
  const twin = dest.items.find((i) => !i.checked && normalizeName(i.name) === key);
  const without = removeItem(d, id);
  return mapList(without, destId, (l) => ({
    ...l,
    items: twin
      ? l.items.map((i) => (i.id === twin.id ? { ...i, qty: mergeQty(i.qty, found.item.qty), updatedAt: now } : i))
      : [...l.items, { ...found.item, checked: false, updatedAt: now }],
  }));
}

/** « Courses terminées » : les articles du panier quittent la liste et comptent un achat de plus dans l'historique. */
export function finishShopping(d: DataFile, listId: string, ctx: Ctx = {}): { data: DataFile; count: number } {
  const now = nowOf(ctx);
  const list = d.lists.find((l) => l.id === listId);
  if (!list) return { data: d, count: 0 };
  const done = list.items.filter((i) => i.checked);
  let history = d.history;
  for (const i of done) {
    history = remember(history, i.name, i.rayon);
    const key = normalizeName(i.name);
    const h = history[key]!;
    history = {
      ...history,
      [key]: { ...h, freq: { ...h.freq, [listId]: (h.freq[listId] ?? 0) + 1 }, lastQty: i.qty, lastBoughtAt: now },
    };
  }
  return { data: { ...mapList(d, listId, (l) => ({ ...l, items: l.items.filter((i) => !i.checked) })), history }, count: done.length };
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function createList(d: DataFile, name: string, ctx: Ctx = {}): { data: DataFile; id: string } {
  const id = idOf(ctx, 'l');
  return { data: { ...d, lists: [...d.lists, { id, name: capitalize(name.trim()), items: [], createdAt: nowOf(ctx) }] }, id };
}

export const renameList = (d: DataFile, id: string, name: string): DataFile =>
  mapList(d, id, (l) => ({ ...l, name: capitalize(name.trim()) || l.name }));

export const deleteList = (d: DataFile, id: string): DataFile => ({ ...d, lists: d.lists.filter((l) => l.id !== id) });

/** Pastilles « habituels » : les plus achetés dans ce magasin, hors basiques et hors ce qui est déjà à prendre. */
export function habituels(d: DataFile, listId: string, max = 10): HistoryEntry[] {
  const inList = pendingKeys(d, listId);
  return Object.entries(d.history)
    .filter(([k, h]) => (h.freq[listId] ?? 0) > 0 && !h.staple && !inList.has(k))
    .sort(([, a], [, b]) => (b.freq[listId] ?? 0) - (a.freq[listId] ?? 0) || a.name.localeCompare(b.name, 'fr'))
    .slice(0, max)
    .map(([, h]) => h);
}

/** Suggestions pendant la saisie : nom qui commence par la saisie d'abord, puis les plus achetés ici, puis ailleurs. */
export function suggestions(d: DataFile, listId: string, query: string, max = 6): HistoryEntry[] {
  const q = normalizeName(query);
  if (!q) return [];
  const inList = pendingKeys(d, listId);
  const total = (h: HistoryEntry) => Object.values(h.freq).reduce((a, b) => a + b, 0);
  return Object.entries(d.history)
    .filter(([k]) => k.includes(q) && !inList.has(k))
    .sort(
      ([ka, a], [kb, b]) =>
        Number(kb.startsWith(q)) - Number(ka.startsWith(q)) ||
        (b.freq[listId] ?? 0) - (a.freq[listId] ?? 0) ||
        total(b) - total(a) ||
        a.name.localeCompare(b.name, 'fr'),
    )
    .slice(0, max)
    .map(([, h]) => h);
}

function pendingKeys(d: DataFile, listId: string): Set<string> {
  const l = d.lists.find((x) => x.id === listId);
  return new Set((l?.items ?? []).filter((i) => !i.checked).map((i) => normalizeName(i.name)));
}

export const historyEntry = (d: DataFile, name: string): HistoryEntry | undefined => d.history[normalizeName(name)];
