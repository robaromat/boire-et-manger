import { newId } from '../lib/ids';
import { DEFAULT_PLACES, WINE_LABEL_NAMES, isTasting, type CaveFile, type Exit, type PlaceDef, type Slot, type Wine, type WineColor, type Wish } from './types';

// Opérations sur la cave, sans effet de bord (testées dans cave.test.ts).

export type WineDraft = Omit<Wine, 'id' | 'stock' | 'history' | 'createdAt' | 'updatedAt'>;

export const emptyWineDraft = (): WineDraft => ({
  domaine: '',
  cuvee: '',
  vintage: null,
  color: 'rouge',
  appellation: '',
  region: '',
  country: '',
  size: '',
  grapes: '',
  style: '',
  from: null,
  to: null,
  pairings: [],
  pairRecipes: [],
  estimated: [],
  price: null,
  bought: '',
  notes: '',
  labels: [],
});

const now = () => new Date().toISOString();

// ---------- Lecture ----------

export const bottles = (w: Wine) => w.stock.reduce((a, s) => a + s.n, 0);
export const totalBottles = (d: CaveFile) => d.wines.reduce((a, w) => a + bottles(w), 0);
export const inCellar = (d: CaveFile) => d.wines.filter((w) => bottles(w) > 0);

/** « Domaine Lapierre » ou « Domaine des Roches Neuves · Terres de Chinon ». */
export function wineName(w: Pick<Wine, 'domaine' | 'cuvee' | 'appellation'>): string {
  const dom = w.domaine.trim() || w.appellation.trim() || 'Vin sans nom';
  const cuv = w.cuvee.trim();
  return cuv && cuv.toLowerCase() !== dom.toLowerCase() && cuv.toLowerCase() !== w.appellation.trim().toLowerCase() ? `${dom} · ${cuv}` : dom;
}
export const vintageLabel = (w: Pick<Wine, 'vintage'>) => (w.vintage ? String(w.vintage) : 'NM');

export const slotLabel = (s: Pick<Slot, 'place' | 'shelf'>) => (s.shelf.trim() ? `${s.place} · ${s.shelf}` : s.place);
const slotKey = (s: Pick<Slot, 'place' | 'shelf'>) => `${s.place.trim().toLowerCase()}|${s.shelf.trim().toLowerCase()}`;
export const sameSlot = (a: Pick<Slot, 'place' | 'shelf'>, b: Pick<Slot, 'place' | 'shelf'>) => slotKey(a) === slotKey(b);

/** Moyenne des notes de dégustation, ou null. */
export function avgRating(w: Wine): number | null {
  const r = w.history.filter((x) => isTasting(x.reason) && x.rating != null).map((x) => x.rating!);
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
}

export type WindowState = 'late' | 'ready' | 'young' | 'unknown';
export function windowState(w: Pick<Wine, 'from' | 'to'>, year: number): WindowState {
  if (w.to != null && w.to < year) return 'late';
  if (w.from != null && w.from > year) return 'young';
  if (w.from == null && w.to == null) return 'unknown';
  return 'ready';
}

/** « 2023–2026 », « dès 2027 », « jusqu'en 2028 », « ? ». */
export function windowLabel(w: Pick<Wine, 'from' | 'to'>, year: number): string {
  if (w.from != null && w.from > year) return `dès ${w.from}`;
  if (w.from != null && w.to != null) return w.from === w.to ? String(w.from) : `${w.from}–${w.to}`;
  if (w.to != null) return `→ ${w.to}`;
  if (w.from != null) return `dès ${w.from}`;
  return '?';
}

export interface DrinkGroups {
  /** Groupes par année de fin de fenêtre ; `year < année en cours` = fenêtre dépassée (un seul groupe). */
  ready: { year: number; late: boolean; wines: Wine[] }[];
  young: Wine[];
  unknown: Wine[];
}

/** Vue « À boire » : les vins en stock, classés par fin de fenêtre (comme CellarTracker). */
export function drinkGroups(wines: Wine[], year: number): DrinkGroups {
  const groups = new Map<number, Wine[]>();
  const young: Wine[] = [];
  const unknown: Wine[] = [];
  for (const w of wines) {
    if (!bottles(w)) continue;
    const st = windowState(w, year);
    if (st === 'young') young.push(w);
    else if (st === 'unknown') unknown.push(w);
    else {
      // Pas de fin connue : on la place cette année, à boire sans tarder plutôt qu'oubliée.
      const key = st === 'late' ? year - 1 : (w.to ?? year);
      groups.set(key, [...(groups.get(key) ?? []), w]);
    }
  }
  const byEnd = (a: Wine, b: Wine) => (a.to ?? 9999) - (b.to ?? 9999) || wineName(a).localeCompare(wineName(b), 'fr');
  return {
    ready: [...groups.entries()].sort(([a], [b]) => a - b).map(([y, ws]) => ({ year: y, late: y < year, wines: ws.sort(byEnd) })),
    young: young.sort((a, b) => (a.from ?? 0) - (b.from ?? 0) || wineName(a).localeCompare(wineName(b), 'fr')),
    unknown: unknown.sort((a, b) => wineName(a).localeCompare(wineName(b), 'fr')),
  };
}

export interface PlanPlace {
  place: string;
  n: number;
  shelves: { shelf: string; n: number; items: { wine: Wine; n: number }[] }[];
}

const shelfOrder = (a: string, b: string) => (!a ? 1 : !b ? -1 : a.localeCompare(b, 'fr', { numeric: true }));

/** Plan de la cave, dessiné d'après les lieux et clayettes saisis (rien à configurer). */
export function cellarPlan(wines: Wine[]): PlanPlace[] {
  type Shelf = { label: string; items: { wine: Wine; n: number }[] };
  const places = new Map<string, { label: string; shelves: Map<string, Shelf> }>();
  for (const w of wines)
    for (const s of w.stock) {
      if (!s.n) continue;
      const pk = s.place.trim().toLowerCase();
      const p = places.get(pk) ?? { label: s.place.trim() || 'Sans lieu', shelves: new Map() };
      places.set(pk, p);
      const sk = s.shelf.trim().toLowerCase();
      const sh: Shelf = p.shelves.get(sk) ?? { label: s.shelf.trim(), items: [] };
      p.shelves.set(sk, sh);
      const it = sh.items.find((x) => x.wine.id === w.id);
      if (it) it.n += s.n;
      else sh.items.push({ wine: w, n: s.n });
    }
  return [...places.values()]
    .map((p) => {
      const shelves = [...p.shelves.values()]
        .map((s) => ({ shelf: s.label, n: s.items.reduce((a, x) => a + x.n, 0), items: s.items }))
        .sort((a, b) => shelfOrder(a.shelf, b.shelf));
      return { place: p.label, n: shelves.reduce((a, s) => a + s.n, 0), shelves };
    })
    .sort((a, b) => b.n - a.n || a.place.localeCompare(b.place, 'fr'));
}

/** Caves réglées dans les Réglages (ou celles par défaut). */
export const placeDefs = (d: CaveFile): PlaceDef[] => (d.places?.length ? d.places : DEFAULT_PLACES);

/** Choix de la liste « Cave » : celles réglées, puis celles encore utilisées par des bouteilles (imports…), et `current`. */
export function placeOptions(d: CaveFile, current?: string): string[] {
  const out = placeDefs(d).map((p) => p.name);
  const add = (x: string) => x.trim() && !out.some((o) => o.toLowerCase() === x.trim().toLowerCase()) && out.push(x.trim());
  for (const w of d.wines) for (const s of w.stock) add(s.place);
  if (current) add(current);
  return out;
}

/** Choix de la liste « Clayette » d'une cave : « aucune » (vide), celles réglées, puis celles déjà utilisées. */
export function shelfOptions(d: CaveFile, place: string, current?: string): string[] {
  const def = placeDefs(d).find((p) => p.name.toLowerCase() === place.trim().toLowerCase());
  const out = ['', ...(def?.shelves ?? [])];
  const add = (x: string) => x.trim() && !out.some((o) => o.toLowerCase() === x.trim().toLowerCase()) && out.push(x.trim());
  for (const s of knownShelves(d, place)) add(s);
  if (current) add(current);
  return out;
}

export const setPlaces = (d: CaveFile, places: PlaceDef[]): CaveFile => ({ ...d, places });

/** Renomme une cave partout : réglages et bouteilles qui y sont rangées. */
export function renamePlace(d: CaveFile, from: string, to: string): CaveFile {
  const k = from.trim().toLowerCase();
  const t = now();
  return {
    ...d,
    wines: d.wines.map((w) =>
      w.stock.some((s) => s.place.trim().toLowerCase() === k)
        ? { ...w, stock: w.stock.map((s) => (s.place.trim().toLowerCase() === k ? { ...s, place: to.trim() } : s)), updatedAt: t }
        : w,
    ),
  };
}

/** Nombre de bouteilles rangées dans une cave. */
export const bottlesIn = (d: CaveFile, place: string) =>
  d.wines.reduce((a, w) => a + w.stock.filter((s) => s.place.trim().toLowerCase() === place.trim().toLowerCase()).reduce((b, s) => b + s.n, 0), 0);

/** Lieux déjà utilisés (pour les listes de choix), du plus rempli au moins rempli. */
export function knownPlaces(d: CaveFile): string[] {
  const n = new Map<string, { label: string; n: number }>();
  for (const w of d.wines)
    for (const s of w.stock) {
      const k = s.place.trim().toLowerCase();
      if (!k) continue;
      const cur = n.get(k) ?? { label: s.place.trim(), n: 0 };
      cur.n += s.n + 0.001;
      n.set(k, cur);
    }
  return [...n.values()].sort((a, b) => b.n - a.n).map((x) => x.label);
}

export function knownShelves(d: CaveFile, place: string): string[] {
  const set = new Set<string>();
  for (const w of d.wines) for (const s of w.stock) if (s.place.trim().toLowerCase() === place.trim().toLowerCase() && s.shelf.trim()) set.add(s.shelf.trim());
  return [...set].sort(shelfOrder);
}

/** Toutes les dégustations (de ta cave et d'ailleurs), la plus récente en premier. */
export function tastings(d: CaveFile): { wine: Wine; exit: Exit }[] {
  return d.wines
    .flatMap((wine) => wine.history.filter((x) => isTasting(x.reason)).map((exit) => ({ wine, exit })))
    .sort((a, b) => (a.exit.date < b.exit.date ? 1 : a.exit.date > b.exit.date ? -1 : 0));
}

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function matchWine(w: Pick<Wine, 'domaine' | 'cuvee' | 'appellation' | 'region' | 'grapes' | 'vintage'> & { labels?: Wine['labels'] }, q: string): boolean {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return true;
  const hay = norm([w.domaine, w.cuvee, w.appellation, w.region, w.grapes, w.vintage ?? '', ...(w.labels ?? []).map((l) => WINE_LABEL_NAMES[l])].join(' '));
  return words.every((x) => hay.includes(x));
}

/** Même vin (domaine, cuvée, millésime), pour ranger des bouteilles dans la fiche existante plutôt que d'en créer une 2e. */
export function findSame(d: CaveFile, w: Pick<Wine, 'domaine' | 'cuvee' | 'vintage'>): Wine | undefined {
  const k = (x: Pick<Wine, 'domaine' | 'cuvee' | 'vintage'>) => `${norm(x.domaine)}|${norm(x.cuvee)}|${x.vintage ?? ''}`;
  const key = k(w);
  return norm(w.domaine) ? d.wines.find((x) => k(x) === key) : undefined;
}

// ---------- Écriture ----------

const touch = (d: CaveFile, id: string, fn: (w: Wine) => Wine): CaveFile => ({
  ...d,
  wines: d.wines.map((w) => (w.id === id ? { ...fn(w), updatedAt: now() } : w)),
});

function mergeSlots(stock: Slot[], add: Slot[]): Slot[] {
  const out = stock.map((s) => ({ ...s }));
  for (const a of add) {
    if (a.n <= 0) continue;
    const cur = out.find((s) => sameSlot(s, a));
    if (cur) cur.n += a.n;
    else out.push({ place: a.place.trim(), shelf: a.shelf.trim(), n: a.n });
  }
  return out;
}

export function addWine(d: CaveFile, draft: WineDraft, stock: Slot[] = []): { data: CaveFile; id: string } {
  const t = now();
  const w: Wine = { ...draft, id: newId('w'), stock: mergeSlots([], stock), history: [], createdAt: t, updatedAt: t };
  return { data: { ...d, wines: [w, ...d.wines] }, id: w.id };
}

export const updateWine = (d: CaveFile, id: string, patch: Partial<Wine>): CaveFile => touch(d, id, (w) => ({ ...w, ...patch, id: w.id }));

export const deleteWine = (d: CaveFile, id: string): CaveFile => ({ ...d, wines: d.wines.filter((w) => w.id !== id) });

/** Range des bouteilles dans une fiche existante. */
export const addStock = (d: CaveFile, id: string, slots: Slot[]): CaveFile => touch(d, id, (w) => ({ ...w, stock: mergeSlots(w.stock, slots) }));

/** Remplace les emplacements (feuille « Déplacer ou ajouter »). */
export const setStock = (d: CaveFile, id: string, slots: Slot[]): CaveFile => touch(d, id, (w) => ({ ...w, stock: mergeSlots([], slots) }));

/**
 * Sort une bouteille : stock −1 à l'emplacement `from` (sauf « dégustée ailleurs »), et une ligne dans l'historique.
 * Renvoie l'id de la ligne, pour la compléter (« Je l'ai bu ») ou l'annuler.
 */
export function takeBottle(d: CaveFile, id: string, exit: Omit<Exit, 'id'>): { data: CaveFile; exitId: string } {
  const x: Exit = { ...exit, id: newId('x') };
  const data = touch(d, id, (w) => {
    const stock = x.from ? w.stock.map((s) => (sameSlot(s, x.from!) && s.n > 0 ? { ...s, n: s.n - 1 } : s)).filter((s) => s.n > 0) : w.stock;
    return { ...w, stock, history: sortHistory([x, ...w.history]) };
  });
  return { data, exitId: x.id };
}

export const updateExit = (d: CaveFile, id: string, xid: string, patch: Partial<Exit>): CaveFile =>
  touch(d, id, (w) => ({ ...w, history: sortHistory(w.history.map((x) => (x.id === xid ? { ...x, ...patch, id: x.id } : x))) }));

/** Supprime une ligne d'historique ; `restock` remet la bouteille à sa place (Annuler juste après la sortie). */
export function removeExit(d: CaveFile, id: string, xid: string, restock = false): CaveFile {
  return touch(d, id, (w) => {
    const x = w.history.find((e) => e.id === xid);
    const stock = restock && x?.from ? mergeSlots(w.stock, [{ ...x.from, n: 1 }]) : w.stock;
    return { ...w, stock, history: w.history.filter((e) => e.id !== xid) };
  });
}

export const sortHistory = (h: Exit[]) => [...h].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

export function addWish(d: CaveFile, wish: Omit<Wish, 'id' | 'createdAt'>): CaveFile {
  return { ...d, wishes: [{ ...wish, id: newId('e'), createdAt: now() }, ...d.wishes] };
}
export const removeWish = (d: CaveFile, id: string): CaveFile => ({ ...d, wishes: d.wishes.filter((e) => e.id !== id) });

/** Dates « AAAA-MM-JJ » en local. */
export const todayIso = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

// ---------- Filtres de la recherche ----------

export interface WineFilter {
  color: WineColor | null;
  place: string;
  region: string;
  appellation: string;
}
export const NO_FILTER: WineFilter = { color: null, place: '', region: '', appellation: '' };
export const filterActive = (f: WineFilter) => !!(f.color || f.place || f.region || f.appellation);

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Le vin passe-t-il les filtres ? La cave regarde où sont ses bouteilles (ou, pour une dégustation, d'où elle sortait). */
export function passFilter(w: Wine, f: WineFilter, from?: { place: string } | null): boolean {
  if (f.color && w.color !== f.color) return false;
  if (f.region && !same(w.region, f.region)) return false;
  if (f.appellation && !same(w.appellation, f.appellation)) return false;
  if (f.place) return from !== undefined ? !!from && same(from.place, f.place) : w.stock.some((s) => s.n > 0 && same(s.place, f.place));
  return true;
}

/** Ne garde que les bouteilles de la cave filtrée (plan et comptes). */
export const onlyPlace = (wines: Wine[], place: string): Wine[] =>
  place ? wines.map((w) => ({ ...w, stock: w.stock.filter((s) => same(s.place, place)) })).filter((w) => w.stock.some((s) => s.n > 0)) : wines;

/** Choix proposés par les filtres, avec le nombre de bouteilles, du plus fourni au moins fourni. */
export function filterChoices(wines: Wine[]): { regions: [string, number][]; appellations: [string, number][]; places: [string, number][] } {
  const count = (key: (w: Wine) => string[]) => {
    const m = new Map<string, { label: string; n: number }>();
    for (const w of wines)
      for (const k of key(w)) {
        if (!k.trim()) continue;
        const id = k.trim().toLowerCase();
        const cur = m.get(id) ?? { label: k.trim(), n: 0 };
        cur.n += bottles(w) || 1;
        m.set(id, cur);
      }
    return [...m.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'fr')).map((x) => [x.label, x.n] as [string, number]);
  };
  return {
    regions: count((w) => [w.region]),
    appellations: count((w) => [w.appellation]),
    places: (() => {
      // Pour une cave : les bouteilles rangées là, pas tout le stock du vin.
      const m = new Map<string, { label: string; n: number }>();
      for (const w of wines)
        for (const s of w.stock) {
          if (!s.n || !s.place.trim()) continue;
          const id = s.place.trim().toLowerCase();
          const cur = m.get(id) ?? { label: s.place.trim(), n: 0 };
          cur.n += s.n;
          m.set(id, cur);
        }
      return [...m.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'fr')).map((x) => [x.label, x.n] as [string, number]);
    })(),
  };
}
