import { bottles } from './ops';
import { COLORS, isTasting, type Wine, type WineColor } from './types';

// Rapports de la cave (comme ceux de CellarTracker), calculés sur les données : fonctions pures, testées.
// Aucune valeur de cave : seulement des nombres de bouteilles.

export interface Bar {
  label: string;
  n: number;
}

/** Bouteilles par fenêtre de dégustation, de la plus urgente à la plus lointaine. */
export function windowBuckets(wines: Wine[], year: number): Bar[] {
  const b = [
    { label: 'Fenêtre dépassée', n: 0 },
    { label: 'Cette année', n: 0 },
    { label: 'L’an prochain', n: 0 },
    { label: 'Dans 2 à 5 ans', n: 0 },
    { label: 'Dans 5 à 10 ans', n: 0 },
    { label: 'Dans plus de 10 ans', n: 0 },
    { label: 'Sans fenêtre', n: 0 },
  ];
  for (const w of wines) {
    const n = bottles(w);
    if (!n) continue;
    // Le classement suit la fin de la fenêtre (comme « À boire ») ; sans fin, son début.
    const end = w.to ?? w.from;
    if (end == null) b[6]!.n += n;
    else if (end < year) b[0]!.n += n;
    else if (end === year) b[1]!.n += n;
    else if (end === year + 1) b[2]!.n += n;
    else if (end <= year + 5) b[3]!.n += n;
    else if (end <= year + 10) b[4]!.n += n;
    else b[5]!.n += n;
  }
  return b;
}

export function byColor(wines: Wine[]): { color: WineColor; n: number }[] {
  return COLORS.map((color) => ({ color, n: wines.filter((w) => w.color === color).reduce((a, w) => a + bottles(w), 0) })).filter((x) => x.n > 0);
}

export type TopKey = 'grapes' | 'region' | 'appellation' | 'country' | 'place';

/** Les plus représentés (en bouteilles), `limit` au plus ; le reste regroupé dans « Autres ». */
export function top(wines: Wine[], key: TopKey, limit = 8): Bar[] {
  const m = new Map<string, Bar>();
  const add = (label: string, n: number) => {
    const l = label.trim();
    if (!l || !n) return;
    const k = l.toLowerCase();
    const cur = m.get(k) ?? { label: l, n: 0 };
    cur.n += n;
    m.set(k, cur);
  };
  for (const w of wines) {
    if (key === 'place') for (const s of w.stock) add(s.place, s.n);
    // Cépages : le principal (le premier cité).
    else if (key === 'grapes') add(w.grapes.split(',')[0] ?? '', bottles(w));
    else add(w[key], bottles(w));
  }
  const all = [...m.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'fr'));
  if (all.length <= limit) return all;
  const rest = all.slice(limit - 1).reduce((a, x) => a + x.n, 0);
  return [...all.slice(0, limit - 1), { label: 'Autres', n: rest }];
}

/** Bouteilles sorties par année : bues (chez toi ou apportées) et autres sorties (offertes, bouchonnées…). */
export function exitsPerYear(wines: Wine[], from?: number, to?: number): { year: number; drunk: number; other: number }[] {
  const m = new Map<number, { drunk: number; other: number }>();
  for (const w of wines)
    for (const x of w.history) {
      // Une bouteille « dégustée ailleurs » ne sortait pas de la cave.
      if (x.reason === 'exterieur') continue;
      const y = parseInt(x.date.slice(0, 4), 10);
      if (!(y > 1900)) continue;
      const cur = m.get(y) ?? { drunk: 0, other: 0 };
      if (isTasting(x.reason)) cur.drunk++;
      else cur.other++;
      m.set(y, cur);
    }
  if (!m.size) return [];
  const years = [...m.keys()];
  const a = from ?? Math.min(...years);
  const b = to ?? Math.max(...years);
  const out = [];
  for (let y = a; y <= b; y++) out.push({ year: y, ...(m.get(y) ?? { drunk: 0, other: 0 }) });
  return out;
}

export interface StockYear {
  year: number;
  /** Bouteilles entrées (achats, cadeaux reçus). */
  added: number;
  /** Bouteilles sorties (bues, offertes, bouchonnées… ; pas celles « dégustées ailleurs »). */
  removed: number;
  /** Bouteilles en cave au 31 décembre (aujourd'hui pour l'année en cours). */
  end: number;
}

/**
 * Évolution de la cave, année par année. Le stock est reconstruit à rebours depuis le stock actuel
 * (fin d'année Y = stock actuel − entrées après Y + sorties après Y) : il reste juste aujourd'hui même si
 * des achats anciens manquent ; un manque ne fausse que les années d'avant.
 * Vide tant qu'aucun vin n'a de date d'entrée (`purchases`).
 */
export function stockPerYear(wines: Wine[], year: number): StockYear[] {
  const add = new Map<number, number>();
  const rem = new Map<number, number>();
  const bump = (m: Map<number, number>, date: string, n: number) => {
    const y = parseInt(date.slice(0, 4), 10);
    if (y > 1900 && y <= year) m.set(y, (m.get(y) ?? 0) + n);
  };
  for (const w of wines) {
    for (const p of w.purchases ?? []) bump(add, p.date, p.n);
    for (const x of w.history) if (x.reason !== 'exterieur') bump(rem, x.date, 1);
  }
  if (!add.size) return [];
  const first = Math.min(...add.keys(), ...rem.keys());
  let end = wines.reduce((a, w) => a + bottles(w), 0);
  const out: StockYear[] = [];
  for (let y = year; y >= first; y--) {
    const added = add.get(y) ?? 0;
    const removed = rem.get(y) ?? 0;
    out.push({ year: y, added, removed, end: Math.max(0, end) });
    end = end - added + removed;
  }
  return out.reverse();
}
