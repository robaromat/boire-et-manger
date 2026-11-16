// Petits constructeurs de données pour les tests.
import type { DataFile, HistoryEntry, Item, ShopList } from '../model/types';
import { DEFAULT_RAYON_ORDER } from '../model/types';

export const T0 = '2026-11-01T00:00:00Z';

export const item = (id: string, over: Partial<Item> = {}): Item => ({
  id, name: id, qty: [], rayon: 'div', checked: false, addedAt: T0, updatedAt: T0, ...over,
});

export const list = (id: string, items: Item[] = [], over: Partial<ShopList> = {}): ShopList => ({
  id, name: id, items, createdAt: T0, ...over,
});

export const hist = (name: string, over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  name, rayon: 'div', staple: false, freq: {}, lastQty: [], lastBoughtAt: null, ...over,
});

export const data = (lists: ShopList[], history: Record<string, HistoryEntry> = {}): DataFile => ({
  schemaVersion: 1, rayonOrder: [...DEFAULT_RAYON_ORDER], lists, history,
});

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Ids des articles par liste, pour des comparaisons lisibles. */
export const ids = (d: DataFile | null | undefined) =>
  Object.fromEntries((d?.lists ?? []).map((l) => [l.id, l.items.map((i) => i.id).sort()]));
