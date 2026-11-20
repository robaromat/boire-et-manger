import { newId } from '../lib/ids';
import { norm } from '../cave/ops';
import type { Place, SouvenirsFile, Visit } from './types';

// Opérations sur les souvenirs, sans effet de bord (testées dans souvenirs.test.ts).

export type PlaceDraft = Omit<Place, 'id' | 'visits' | 'createdAt' | 'updatedAt'>;
export type VisitDraft = Omit<Visit, 'id'>;

const now = () => new Date().toISOString();
const byDateDesc = (a: Visit, b: Visit) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

export const emptyPlaceDraft = (): PlaceDraft => ({
  name: '',
  type: 'resto',
  sub: '',
  address: '',
  city: '',
  lat: null,
  lon: null,
  tags: [],
  reco: '',
  todo: false,
  why: '',
});

// ---------- Lecture ----------

export function avgRating(p: Place): number | null {
  const r = p.visits.map((v) => v.rating).filter((x): x is number => x != null);
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
}
export const lastVisit = (p: Place): string | null => p.visits[0]?.date ?? null;

/** Photos du lieu, des visites les plus récentes d'abord. */
export const placePhotos = (p: Place): string[] => p.visits.flatMap((v) => v.photos);

/** Prénoms déjà utilisés, du plus fréquent au moins fréquent. */
export function knownPeople(d: SouvenirsFile): string[] {
  const n = new Map<string, number>();
  for (const p of d.places) for (const v of p.visits) for (const w of v.with) n.set(w, (n.get(w) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).map(([w]) => w);
}

export function allTags(d: SouvenirsFile): string[] {
  return [...new Set(d.places.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, 'fr'));
}

export function matchPlace(p: Place, q: string): boolean {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return true;
  const hay = norm([p.name, p.sub, p.address, p.city, p.reco, p.why, ...p.tags, ...p.visits.map((v) => v.comment)].join(' '));
  return words.every((x) => hay.includes(x));
}

/** Distance en mètres (formule de haversine). */
export function distance(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const fmtDistance = (m: number) =>
  m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : m < 10000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 1000)} km`;

/** Visites groupées par mois (« 2026-11 »), le plus récent d'abord : la vue Livre. */
export function bookMonths(places: Place[]): { month: string; items: { place: Place; visit: Visit }[] }[] {
  const all = places.flatMap((place) => place.visits.map((visit) => ({ place, visit }))).sort((a, b) => byDateDesc(a.visit, b.visit));
  const out: { month: string; items: { place: Place; visit: Visit }[] }[] = [];
  for (const x of all) {
    const m = x.visit.date.slice(0, 7);
    const cur = out[out.length - 1];
    if (cur?.month === m) cur.items.push(x);
    else out.push({ month: m, items: [x] });
  }
  return out;
}

/** Lieu déjà enregistré : même objet OpenStreetMap, ou même nom à moins de 100 m. */
export function findSamePlace(d: SouvenirsFile, p: Pick<Place, 'name' | 'lat' | 'lon' | 'osm'>): Place | undefined {
  return d.places.find(
    (x) =>
      (p.osm && x.osm === p.osm) ||
      (norm(x.name) === norm(p.name) && x.lat != null && x.lon != null && p.lat != null && p.lon != null && distance({ lat: x.lat, lon: x.lon }, { lat: p.lat, lon: p.lon }) < 100),
  );
}

// ---------- Écriture ----------

const touch = (d: SouvenirsFile, id: string, fn: (p: Place) => Place): SouvenirsFile => ({
  ...d,
  places: d.places.map((p) => (p.id === id ? { ...fn(p), updatedAt: now() } : p)),
});

export function addPlace(d: SouvenirsFile, draft: PlaceDraft): { data: SouvenirsFile; id: string } {
  const t = now();
  const p: Place = { ...draft, id: newId('l'), visits: [], createdAt: t, updatedAt: t };
  return { data: { ...d, places: [p, ...d.places] }, id: p.id };
}

export const updatePlace = (d: SouvenirsFile, id: string, patch: Partial<Place>): SouvenirsFile => touch(d, id, (p) => ({ ...p, ...patch, id: p.id }));

export const deletePlace = (d: SouvenirsFile, id: string): SouvenirsFile => ({ ...d, places: d.places.filter((p) => p.id !== id) });

/** Note une visite ; le lieu quitte « À essayer ». */
export function addVisit(d: SouvenirsFile, id: string, v: VisitDraft): { data: SouvenirsFile; visitId: string } {
  const visit: Visit = { ...v, id: newId('v') };
  const data = touch(d, id, (p) => ({ ...p, todo: false, visits: [visit, ...p.visits].sort(byDateDesc) }));
  return { data, visitId: visit.id };
}

export const updateVisit = (d: SouvenirsFile, id: string, vid: string, patch: Partial<Visit>): SouvenirsFile =>
  touch(d, id, (p) => ({ ...p, visits: p.visits.map((v) => (v.id === vid ? { ...v, ...patch, id: v.id } : v)).sort(byDateDesc) }));

export const removeVisit = (d: SouvenirsFile, id: string, vid: string): SouvenirsFile => touch(d, id, (p) => ({ ...p, visits: p.visits.filter((v) => v.id !== vid) }));

export const parseTags = (s: string) => [
  ...new Set(
    s
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  ),
];
