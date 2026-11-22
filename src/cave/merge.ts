import { mergeEntities } from '../sync/merge';
import { sameSlot, sortHistory } from './ops';
import { sortPurchases, type CaveFile, type Exit, type Purchase, type Slot, type Wine, type Wish } from './types';

// Fusion « à trois » de cave.json (même principe que Courses et Recettes, voir sync/merge.ts) :
// vin par vin ; si les deux appareils ont modifié le même vin, le plus récent gagne pour ses champs,
// l'historique est fusionné ligne par ligne, et le stock emplacement par emplacement en additionnant les écarts :
// une bouteille sortie sur chaque téléphone fait bien deux bouteilles en moins.

const byId = <T extends { id: string }>(xs: T[] | undefined) => new Map<string, T>((xs ?? []).map((x) => [x.id, x]));

function mergeStock(l: Slot[], r: Slot[], b: Slot[] | undefined): Slot[] {
  const out: Slot[] = [];
  const keys: Slot[] = [];
  for (const s of [...l, ...r, ...(b ?? [])]) if (!keys.some((k) => sameSlot(k, s))) keys.push(s);
  for (const k of keys) {
    const n = (xs: Slot[] | undefined) => (xs ?? []).filter((s) => sameSlot(s, k)).reduce((a, s) => a + s.n, 0);
    const v = n(l) + n(r) - n(b);
    if (v > 0) out.push({ place: k.place, shelf: k.shelf, n: v });
  }
  return out;
}

function mergeWine(l: Wine, r: Wine, b: Wine | undefined): Wine {
  const win = l.updatedAt >= r.updatedAt ? l : r;
  const history = mergeEntities<Exit>(byId(b?.history), byId(l.history), byId(r.history), (x) => x);
  const merged: Wine = { ...win, stock: mergeStock(l.stock, r.stock, b?.stock), history: sortHistory([...history.values()]) };
  if (!l.purchases && !r.purchases) return merged;
  const purchases = mergeEntities<Purchase>(byId(b?.purchases), byId(l.purchases), byId(r.purchases), (x) => x);
  return { ...merged, purchases: sortPurchases([...purchases.values()]) };
}

export function mergeCave(base: CaveFile | null, local: CaveFile, remote: CaveFile): CaveFile {
  const wines = mergeEntities(byId(base?.wines), byId(local.wines), byId(remote.wines), mergeWine);
  const wishes = mergeEntities<Wish>(byId(base?.wishes), byId(local.wishes), byId(remote.wishes), (x) => x);
  // Caves réglées : celles du côté qui les a changées.
  const localChanged = JSON.stringify(local.places ?? null) !== JSON.stringify(base?.places ?? null);
  const places = localChanged ? local.places : remote.places;
  return { schemaVersion: 1, ratingScale: 10, wines: [...wines.values()], wishes: [...wishes.values()], ...(places ? { places } : {}) };
}
