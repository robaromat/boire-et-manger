import { describe, expect, it } from 'vitest';
import { addWine, emptyWineDraft, tastings } from '../cave/ops';
import { emptyCaveFile } from '../cave/types';
import { dropVisitWines, syncVisitWines } from './actions';
import { readExif } from './exif';
import { mergeSouvenirs } from './merge';
import { addPlace, addVisit, avgRating, bookMonths, distance, emptyPlaceDraft, findSamePlace, fmtDistance, knownPeople, matchPlace, type VisitDraft } from './ops';
import { fromNominatim, fromOverpass, googleMapsUrl, overpassQuery, typeFromTags } from './osm';
import { emptySouvenirsFile, parseSouvenirsFile } from './types';

const visit = (p: Partial<VisitDraft>): VisitDraft => ({ date: '2026-11-15', with: [], rating: 5, comment: '', photos: [], wines: [], auteur: 'Robin', ...p });

function souvenirs() {
  let d = emptySouvenirsFile();
  const a = addPlace(d, { ...emptyPlaceDraft(), name: 'Le Saint-Sébastien', sub: 'Bistrot', lat: 45.76, lon: 4.83, osm: 'node/1', tags: ['terrasse'] });
  d = a.data;
  const b = addPlace(d, { ...emptyPlaceDraft(), name: 'Trattoria Nonna', todo: true, why: 'Conseillé par Paul', lat: 45.77, lon: 4.84 });
  return { d: b.data, stseb: a.id, nonna: b.id };
}

describe('souvenirs : opérations', () => {
  it('visites : note moyenne, ordre, « À essayer » levé', () => {
    let { d, stseb, nonna } = souvenirs();
    d = addVisit(d, stseb, visit({ date: '2026-07-02', rating: 4, with: ['Claire'] })).data;
    d = addVisit(d, stseb, visit({ date: '2026-11-15', with: ['Claire', 'Paul'] })).data;
    const p = d.places.find((x) => x.id === stseb)!;
    expect(p.visits.map((v) => v.date)).toEqual(['2026-11-15', '2026-07-02']);
    expect(avgRating(p)).toBe(4.5);
    expect(knownPeople(d)).toEqual(['Claire', 'Paul']);
    d = addVisit(d, nonna, visit({})).data;
    expect(d.places.find((x) => x.id === nonna)!.todo).toBe(false);
  });

  it('recherche, distance, livre par mois', () => {
    let { d, stseb } = souvenirs();
    d = addVisit(d, stseb, visit({ date: '2026-10-24', comment: 'Pâté en croûte' })).data;
    d = addVisit(d, stseb, visit({ date: '2026-11-15' })).data;
    const p = d.places.find((x) => x.id === stseb)!;
    expect(matchPlace(p, 'pate')).toBe(true);
    expect(matchPlace(p, 'bistrot terrasse')).toBe(true);
    expect(matchPlace(p, 'ramen')).toBe(false);
    expect(Math.round(distance({ lat: 45.76, lon: 4.83 }, { lat: 45.77, lon: 4.83 }))).toBe(1112);
    expect([fmtDistance(42), fmtDistance(1112), fmtDistance(48000)]).toEqual(['40 m', '1,1 km', '48 km']);
    expect(bookMonths(d.places).map((m) => [m.month, m.items.length])).toEqual([
      ['2026-11', 1],
      ['2026-10', 1],
    ]);
  });

  it('reconnaît un lieu déjà enregistré', () => {
    const { d, stseb } = souvenirs();
    expect(findSamePlace(d, { name: 'x', lat: 0, lon: 0, osm: 'node/1' })?.id).toBe(stseb);
    expect(findSamePlace(d, { name: 'le saint sebastien', lat: 45.7601, lon: 4.8301 })?.id).toBe(stseb);
    expect(findSamePlace(d, { name: 'Le Saint-Sébastien', lat: 48.85, lon: 2.35 })).toBeUndefined();
  });

  it('relit souvenirs.json en complétant les champs manquants', () => {
    const f = parseSouvenirsFile({ schemaVersion: 1, places: [{ id: 'l_1', type: 'zzz', visits: [{ id: 'v_1', wines: [{ wineId: 'w' }] }] }] });
    expect(f?.places[0]).toMatchObject({ name: 'Lieu sans nom', type: 'autre', todo: false, lat: null });
    expect(f?.places[0]?.visits[0]).toMatchObject({ date: '1970-01-01', with: [], wines: [] });
  });
});

describe('souvenirs : fusion', () => {
  it('une visite notée sur chaque téléphone : les deux sont gardées', () => {
    const { d: base, stseb } = souvenirs();
    const a = addVisit(base, stseb, visit({ date: '2026-11-15' })).data;
    const b = addVisit(base, stseb, visit({ date: '2026-11-16' })).data;
    expect(mergeSouvenirs(base, a, b).places.find((p) => p.id === stseb)!.visits).toHaveLength(2);
  });

  it('visite notée d’un côté, lieu renommé de l’autre : plus « à essayer »', () => {
    const { d: base, nonna } = souvenirs();
    const a = addVisit(base, nonna, visit({})).data;
    const b = { ...base, places: base.places.map((p) => (p.id === nonna ? { ...p, name: 'Nonna', updatedAt: '2099-01-01' } : p)) };
    const m = mergeSouvenirs(base, a, b).places.find((p) => p.id === nonna)!;
    expect([m.name, m.todo, m.visits.length]).toEqual(['Nonna', false, 1]);
  });

  it('un lieu supprimé ici et inchangé là-bas disparaît', () => {
    const { d: base, nonna } = souvenirs();
    const a = { ...base, places: base.places.filter((p) => p.id !== nonna) };
    expect(mergeSouvenirs(base, a, base).places).toHaveLength(1);
  });
});

describe('souvenirs : vins bus → Cave', () => {
  it('crée, met à jour et retire les dégustations « ailleurs » sans toucher au stock', () => {
    let cave = emptyCaveFile();
    const w1 = addWine(cave, { ...emptyWineDraft(), domaine: 'Gramenon' }, [{ place: 'Cave', shelf: 'A1', n: 2 }]);
    cave = w1.data;
    const w2 = addWine(cave, { ...emptyWineDraft(), domaine: 'Huet' });
    cave = w2.data;
    const place = { id: 'l_1', name: 'Le Saint-Sébastien' };
    const r1 = syncVisitWines(cave, place, { date: '2026-11-15', rating: 5 }, [], [w1.id, w2.id, 'w_inconnu']);
    expect(r1.wines).toHaveLength(2);
    expect(tastings(r1.cave).map((t) => [t.exit.reason, t.exit.where, t.exit.date])).toEqual([
      ['exterieur', 'Le Saint-Sébastien', '2026-11-15'],
      ['exterieur', 'Le Saint-Sébastien', '2026-11-15'],
    ]);
    expect(r1.cave.wines.find((w) => w.id === w1.id)!.stock[0]!.n).toBe(2);
    const r2 = syncVisitWines(r1.cave, { ...place, name: 'Saint-Séb' }, { date: '2026-11-16', rating: 5 }, r1.wines, [w1.id]);
    expect(r2.wines).toEqual([r1.wines[0]]);
    expect(tastings(r2.cave).map((t) => [t.wine.domaine, t.exit.where, t.exit.date])).toEqual([['Gramenon', 'Saint-Séb', '2026-11-16']]);
    expect(tastings(dropVisitWines(r2.cave, r2.wines))).toHaveLength(0);
  });
});

describe('OpenStreetMap', () => {
  it('types d’après les étiquettes', () => {
    expect(typeFromTags({ amenity: 'restaurant', cuisine: 'italian;pizza' })).toEqual({ type: 'resto', sub: 'Italien' });
    expect(typeFromTags({ amenity: 'pub' })).toEqual({ type: 'bar', sub: 'Pub' });
    expect(typeFromTags({ shop: 'wine' })).toEqual({ type: 'cave', sub: 'Caviste' });
    expect(typeFromTags({ shop: 'pastry' })).toEqual({ type: 'boul', sub: 'Pâtisserie' });
    expect(typeFromTags({ shop: 'cheese' })).toEqual({ type: 'marche', sub: 'Fromager' });
    expect(typeFromTags({ tourism: 'museum' }).type).toBe('autre');
  });

  it('lit Overpass et Nominatim', () => {
    const near = fromOverpass([
      { type: 'node', id: 1, lat: 45.1, lon: 4.1, tags: { name: 'Sushi Hana', amenity: 'restaurant', cuisine: 'sushi', 'addr:housenumber': '9', 'addr:street': 'Rue Basse' } },
      { type: 'way', id: 2, center: { lat: 45.2, lon: 4.2 }, tags: { name: 'Les Halles', amenity: 'marketplace' } },
      { type: 'node', id: 3, lat: 45, lon: 4, tags: { amenity: 'cafe' } },
    ]);
    expect(near).toEqual([
      { osm: 'node/1', name: 'Sushi Hana', type: 'resto', sub: 'Sushis', address: '9 Rue Basse', city: '', lat: 45.1, lon: 4.1 },
      { osm: 'way/2', name: 'Les Halles', type: 'marche', sub: 'Marché', address: '', city: '', lat: 45.2, lon: 4.2 },
    ]);
    const hit = fromNominatim({
      osm_type: 'node', osm_id: 7, lat: '45.76', lon: '4.83', name: 'Trattoria Nonna', display_name: 'Trattoria Nonna, 2, Quai des Arts, Lyon',
      category: 'amenity', type: 'restaurant', address: { house_number: '2', road: 'Quai des Arts', city: 'Lyon' }, extratags: { cuisine: 'italian' },
    });
    expect(hit).toMatchObject({ osm: 'node/7', type: 'resto', sub: 'Italien', address: '2 Quai des Arts', city: 'Lyon', lat: 45.76 });
    expect(overpassQuery(45.1, 4.1, 300)).toContain('around:300,45.100000,4.100000');
    expect(googleMapsUrl({ name: 'X', address: '', city: '', lat: 45.1, lon: 4.1 })).toBe('https://www.google.com/maps/dir/?api=1&destination=45.1,4.1');
    expect(googleMapsUrl({ name: 'Nonna', address: '2 quai', city: 'Lyon', lat: null, lon: null })).toContain('query=Nonna%2C%202%20quai%2C%20Lyon');
  });
});

/** JPEG minimal avec un bloc EXIF : date de prise de vue et position GPS. */
function jpegWithExif(lat: [number, number, number], latRef: string, lon: [number, number, number], lonRef: string, date: string): ArrayBuffer {
  const b: number[] = [];
  const u16 = (n: number) => b.push((n >> 8) & 255, n & 255);
  const u32 = (n: number) => b.push((n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255);
  // TIFF (gros-boutiste) : IFD0 à 8 (2 entrées), Exif IFD à 38 (1 entrée), GPS IFD à 56 (4 entrées), données ensuite.
  const tiff: number[] = [];
  const T = {
    u16: (n: number) => tiff.push((n >> 8) & 255, n & 255),
    u32: (n: number) => tiff.push((n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255),
  };
  const exifIfd = 8 + 2 + 2 * 12 + 4; // 38
  const gpsIfd = exifIfd + 2 + 12 + 4; // 56
  const data = gpsIfd + 2 + 4 * 12 + 4; // 110
  const dateAt = data;
  const latAt = dateAt + 20;
  const lonAt = latAt + 24;
  tiff.push(0x4d, 0x4d);
  T.u16(42);
  T.u32(8);
  T.u16(2);
  [[0x8769, 4, 1, exifIfd], [0x8825, 4, 1, gpsIfd]].forEach(([tag, type, count, val]) => (T.u16(tag!), T.u16(type!), T.u32(count!), T.u32(val!)));
  T.u32(0);
  T.u16(1);
  T.u16(0x9003), T.u16(2), T.u32(20), T.u32(dateAt);
  T.u32(0);
  T.u16(4);
  T.u16(1), T.u16(2), T.u32(2), tiff.push(latRef.charCodeAt(0), 0, 0, 0);
  T.u16(2), T.u16(5), T.u32(3), T.u32(latAt);
  T.u16(3), T.u16(2), T.u32(2), tiff.push(lonRef.charCodeAt(0), 0, 0, 0);
  T.u16(4), T.u16(5), T.u32(3), T.u32(lonAt);
  T.u32(0);
  for (const c of date.padEnd(19, ' ')) tiff.push(c.charCodeAt(0));
  tiff.push(0);
  for (const v of [...lat, ...lon]) (T.u32(Math.round(v * 100)), T.u32(100));
  b.push(0xff, 0xd8, 0xff, 0xe1);
  u16(tiff.length + 8);
  for (const c of 'Exif') b.push(c.charCodeAt(0));
  b.push(0, 0, ...tiff, 0xff, 0xd9);
  void u32;
  return new Uint8Array(b).buffer;
}

describe('EXIF des photos', () => {
  it('lit la position et la date de prise de vue', () => {
    const info = readExif(jpegWithExif([45, 45, 36], 'N', [4, 49, 48], 'E', '2026:11:15 20:41:07'));
    expect(info.date).toBe('2026-11-15');
    expect(info.time).toBe('20:41');
    expect(info.lat).toBeCloseTo(45.76, 4);
    expect(info.lon).toBeCloseTo(4.83, 4);
  });

  it('ouest et sud négatifs ; rien si ce n’est pas un JPEG', () => {
    const info = readExif(jpegWithExif([33, 52, 0], 'S', [151, 12, 0], 'W', '2026:01:02 10:00:00'));
    expect(info.lat! < 0 && info.lon! < 0).toBe(true);
    expect(readExif(new Uint8Array([1, 2, 3, 4]).buffer)).toEqual({ lat: null, lon: null, date: null, time: null });
  });
});
