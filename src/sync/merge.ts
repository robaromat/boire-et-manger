import type { DataFile, HistoryEntry, Item, ShopList } from '../model/types';

// Fusion « à trois » quand les deux appareils ont modifié data.json en même temps.
//   base   = la dernière version que CET appareil a lue/écrite sur GitHub
//   local  = ce que cet appareil veut enregistrer
//   remote = ce qui est sur GitHub maintenant
// Comparer à la base permet de savoir qui a changé quoi, et donc de distinguer
// « supprimé ici » de « ajouté là-bas » (une simple fusion local/remote ferait réapparaître les suppressions).
//
// Granularité :
//   - listes : nom et date, liste par liste (si les deux côtés ont renommé, le local gagne) ;
//   - articles : article par article, toutes listes confondues. Un article garde son id quand on le
//     « Déplace vers… » une autre liste, donc un déplacement ici et une case cochée là-bas se fusionnent ;
//     si les deux côtés ont modifié le même article, le plus récent (updatedAt) gagne ;
//   - historique : entrée par entrée ; les compteurs d'achats s'additionnent (chaque appareil a pu en ajouter) ;
//   - ordre des rayons : celui du côté qui l'a changé.
// Supprimé d'un côté et inchangé de l'autre → supprimé ; supprimé d'un côté mais modifié de l'autre → gardé.

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function mergeEntities<T>(
  base: ReadonlyMap<string, T>,
  local: ReadonlyMap<string, T>,
  remote: ReadonlyMap<string, T>,
  resolveBoth: (l: T, r: T, b: T | undefined) => T,
): Map<string, T> {
  const ids = [...new Set([...remote.keys(), ...local.keys()])];
  const out = new Map<string, T>();
  for (const id of ids) {
    const l = local.get(id);
    const r = remote.get(id);
    const b = base.get(id);
    let v: T | undefined;
    if (l && r) {
      if (same(l, r)) v = l;
      else if (b && same(l, b)) v = r;
      else if (b && same(r, b)) v = l;
      else v = resolveBoth(l, r, b);
    } else if (l) {
      // Absent du distant : nouveau ici, ou supprimé là-bas.
      if (!b || !same(l, b)) v = l;
    } else if (r) {
      // Absent du local : nouveau là-bas, ou supprimé ici.
      if (!b || !same(r, b)) v = r;
    }
    if (v !== undefined) out.set(id, v);
  }
  return out;
}

type ListMeta = Omit<ShopList, 'items'>;
type PlacedItem = Item & { listId: string };

const metas = (d: DataFile | null) => new Map<string, ListMeta>((d?.lists ?? []).map(({ items: _items, ...m }) => [m.id, m]));
const placed = (d: DataFile | null) =>
  new Map<string, PlacedItem>((d?.lists ?? []).flatMap((l) => l.items.map((i) => [i.id, { ...i, listId: l.id }] as const)));
const history = (d: DataFile | null) => new Map<string, HistoryEntry>(Object.entries(d?.history ?? {}));

function mergeHistoryEntry(l: HistoryEntry, r: HistoryEntry, b: HistoryEntry | undefined): HistoryEntry {
  const freq: Record<string, number> = {};
  for (const k of new Set([...Object.keys(l.freq), ...Object.keys(r.freq)])) {
    const lb = l.freq[k] ?? 0;
    const rb = r.freq[k] ?? 0;
    const bb = b?.freq[k] ?? 0;
    freq[k] = Math.max(lb, rb, lb + rb - bb);
  }
  const rIsLater = (r.lastBoughtAt ?? '') > (l.lastBoughtAt ?? '');
  return {
    ...l, // nom, rayon, « toujours à la maison » : le local gagne
    freq,
    lastQty: rIsLater ? r.lastQty : l.lastQty,
    lastBoughtAt: rIsLater ? r.lastBoughtAt : l.lastBoughtAt,
  };
}

export function mergeData(base: DataFile | null, local: DataFile, remote: DataFile): DataFile {
  const lists = mergeEntities(metas(base), metas(local), metas(remote), (l) => l);
  const items = mergeEntities(placed(base), placed(local), placed(remote), (l, r) => (l.updatedAt >= r.updatedAt ? l : r));
  const hist = mergeEntities(history(base), history(local), history(remote), mergeHistoryEntry);

  const localChangedOrder = !base || !same(local.rayonOrder, base.rayonOrder);
  const rayonOrder = localChangedOrder ? local.rayonOrder : remote.rayonOrder;

  // Les articles d'une liste supprimée disparaissent avec elle.
  const byList = new Map<string, Item[]>();
  for (const { listId, ...item } of items.values()) {
    if (!lists.has(listId)) continue;
    const arr = byList.get(listId) ?? [];
    arr.push(item);
    byList.set(listId, arr);
  }

  return {
    schemaVersion: 1,
    rayonOrder,
    lists: [...lists.values()].map((m) => ({ ...m, items: byList.get(m.id) ?? [] })),
    history: Object.fromEntries(hist),
  };
}
