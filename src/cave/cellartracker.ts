import { newId } from '../lib/ids';
import { ratingFromComment } from './rating';
import { csvRecords } from './csv';
import { emptyWineDraft, findSame, norm, sameSlot, sortHistory } from './ops';
import { sortPurchases, type CaveFile, type Exit, type Purchase, type Reason, type Slot, type Wine, type WineColor, type WineLabel, type Wish } from './types';

// Import des exports CSV de CellarTracker (abonnement terminé le 14/12/2026).
//   - « Inventory » (ou « My Cellar ») : une ligne par bouteille en stock (ou par vin avec Quantity), avec Location et Bin ;
//   - « Consumed » : les bouteilles sorties, avec leur raison (Drank, Gave away, Spoiled…) ;
//   - « Notes » : les notes de dégustation (sur 100) et leurs commentaires ;
//   - « Purchases » : les achats (date, quantité, prix, magasin ou note), pour l'évolution de la cave dans les Rapports.
// Les colonnes sont reconnues par leur nom, quel que soit l'ordre. La valeur estimée (Valuation) n'est jamais reprise.
// Rien n'est enregistré avant l'écran de revue : buildCtImport prépare, applyCtImport écrit.

export type CtFileKind = 'inventory' | 'consumed' | 'notes' | 'wishlist' | 'purchases' | 'unknown';

export interface CtFile {
  name: string;
  kind: CtFileKind;
  rows: number;
}

export interface CtLocation {
  /** Nom dans CellarTracker (« » si vide). */
  name: string;
  bottles: number;
  bins: string[];
}

export interface CtImport {
  files: CtFile[];
  /** Vins prêts à écrire ; `id` déjà pris par un vin de la cave = fusion. Les lieux sont encore ceux de CellarTracker. */
  wines: Wine[];
  locations: CtLocation[];
  /** Liste d'envies (« Wish List »), sans celles déjà dans les envies. */
  wishes: Wish[];
  stats: { wines: number; bottles: number; tastings: number; exits: number; noWindow: number; merged: number; elsewhere: number; wishes: number; purchases: number };
}

type Rec = Record<string, string>;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
/** CellarTracker laisse des entités HTML dans ses exports (« Sams&#333; », « l&apos;apéritif ») : on les décode. */
export const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
  });

const get = (r: Rec, ...keys: string[]) => {
  for (const k of keys) {
    const v = r[k];
    if (v && !/^(unknown|n\/a|na|none|-)$/i.test(v)) return decodeEntities(v);
  }
  return '';
};

export function detectKind(r: Rec | undefined): CtFileKind {
  if (!r) return 'unknown';
  if ('iconsumed' in r || 'consumed' in r || 'consumptionnote' in r) return 'consumed';
  if ('itaggedwine' in r || 'listname' in r) return 'wishlist';
  // Avant « inventory » : un export d'achats a aussi iWine et Quantity, mais ce n'est pas du stock.
  if ('ipurchase' in r || ('purchasedate' in r && 'remaining' in r)) return 'purchases';
  if ('tastingnotes' in r || 'inote' in r || 'tastingdate' in r) return 'notes';
  if ('iwine' in r && ('iinventory' in r || 'location' in r || 'bin' in r || 'quantity' in r)) return 'inventory';
  return 'unknown';
}

const int = (s: string) => {
  const n = parseInt(s.replace(/\s/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};
const money = (s: string) => {
  const n = parseFloat(s.replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

export function ctColor(...parts: string[]): WineColor {
  const s = parts.join(' ').toLowerCase();
  if (/sparkling|effervesc|champagne/.test(s)) return 'bulles';
  if (/sweet|dessert|fortified|liquoreux|moelleux/.test(s)) return 'doux';
  if (/ros[eé]/.test(s)) return 'rose';
  if (/white|blanc/.test(s)) return 'blanc';
  return 'rouge';
}

/** Note CellarTracker (sur 100, parfois déjà sur 10) → sur 10, au demi-point. */
export function scoreTo10(score: number | null): number | null {
  if (score == null || score <= 0) return null;
  const n = score <= 10 ? score : score / 10;
  return Math.min(10, Math.round(n * 2) / 2);
}

export function ctReason(s: string): { reason: Reason; where: string; detail: string } {
  const t = s.toLowerCase();
  if (/gift|gave|donat/.test(t)) return { reason: 'offerte', where: '', detail: /donat/.test(t) ? 'don' : '' };
  if (/cook/.test(t)) return { reason: 'cuisine', where: '', detail: '' };
  if (/spoil|cork|oxid/.test(t)) return { reason: 'defaut', where: '', detail: /not returned/.test(t) ? '' : /returned/.test(t) ? 'rapportée au caviste' : '' };
  if (/drop|broke/.test(t)) return { reason: 'cassee', where: '', detail: '' };
  if (/missing|presumed/.test(t)) return { reason: 'disparue', where: '', detail: '' };
  if (/sold|trade/.test(t)) return { reason: 'vendue', where: '', detail: '' };
  if (/restaurant/.test(t)) return { reason: 'exterieur', where: 'Restaurant', detail: '' };
  if (/friend/.test(t)) return { reason: 'exterieur', where: 'Chez des amis', detail: '' };
  if (/tasting|brought/.test(t)) return { reason: 'ailleurs', where: 'Dégustation', detail: '' };
  return { reason: 'bue', where: '', detail: '' };
}

/** Ordre jour/mois des dates du fichier : CellarTracker écrit souvent 11/8/2026 (mois en premier). */
export function dateOrder(values: string[]): 'dmy' | 'mdy' {
  for (const v of values) {
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/.exec(v);
    if (!m) continue;
    if (+m[1]! > 12) return 'dmy';
    if (+m[2]! > 12) return 'mdy';
  }
  return 'mdy';
}

export function ctDate(s: string, order: 'dmy' | 'mdy'): string {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, '0')}-${iso[3]!.padStart(2, '0')}`;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (!m) return '';
  const [a, b, y] = [m[1]!, m[2]!, m[3]!];
  const [d, mo] = order === 'dmy' ? [a, b] : [b, a];
  const yy = y.length === 2 ? `20${y}` : y;
  return `${yy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function ctSize(s: string): string {
  const t = s.toLowerCase().replace(/\s/g, '');
  if (!t || /^750ml|^75cl|^0\.75/.test(t)) return '';
  if (/^1\.5l|^150cl|^1500ml|magnum/.test(t)) return 'Magnum';
  if (/^375ml|^37\.5cl/.test(t)) return 'Demi-bouteille';
  if (/^500ml|^50cl/.test(t)) return '50 cl';
  return s;
}

// Régions et pays de CellarTracker (en anglais) en français ; un nom absent de la liste reste tel quel.
const REGIONS_FR: Record<string, string> = {
  burgundy: 'Bourgogne',
  'loire valley': 'Loire',
  rhone: 'Rhône',
  'rhone / savoie': 'Rhône / Savoie',
  bordeaux: 'Bordeaux',
  champagne: 'Champagne',
  'languedoc roussillon': 'Languedoc-Roussillon',
  languedoc: 'Languedoc',
  roussillon: 'Roussillon',
  'southwest france': 'Sud-Ouest',
  provence: 'Provence',
  savoie: 'Savoie',
  jura: 'Jura',
  alsace: 'Alsace',
  corsica: 'Corse',
  beaujolais: 'Beaujolais',
  piedmont: 'Piémont',
  veneto: 'Vénétie',
  tuscany: 'Toscane',
  lombardia: 'Lombardie',
  'lombardia / veneto': 'Lombardie / Vénétie',
  sicily: 'Sicile',
  sardinia: 'Sardaigne',
  'valle d’aosta': 'Vallée d’Aoste',
  "valle d'aosta": 'Vallée d’Aoste',
  'trentino-alto adige': 'Trentin-Haut-Adige',
  catalunya: 'Catalogne',
  rioja: 'Rioja',
  'castilla y leon': 'Castille-et-León',
  andalucia: 'Andalousie',
  douro: 'Douro',
  mosel: 'Moselle',
  rheingau: 'Rheingau',
  california: 'Californie',
  'western cape': 'Cap-Occidental',
  'south australia': 'Australie-Méridionale',
  puglia: 'Pouilles',
  'pais vasco': 'Pays basque',
  'castilla-la mancha': 'Castille-La Manche',
  murcia: 'Murcie',
  'rapel valley': 'Vallée de Rapel',
  campania: 'Campanie',
  galicia: 'Galice',
  navarra: 'Navarre',
};
const COUNTRIES_FR: Record<string, string> = {
  italy: 'Italie',
  spain: 'Espagne',
  germany: 'Allemagne',
  austria: 'Autriche',
  switzerland: 'Suisse',
  greece: 'Grèce',
  hungary: 'Hongrie',
  lebanon: 'Liban',
  usa: 'États-Unis',
  'south africa': 'Afrique du Sud',
  australia: 'Australie',
  'new zealand': 'Nouvelle-Zélande',
  argentina: 'Argentine',
  chile: 'Chili',
  georgia: 'Géorgie',
};
const key = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/’/g, "'");
/** « Burgundy » → « Bourgogne », « Italy » → « Italie ». */
export const frRegion = (s: string) => REGIONS_FR[key(s)] ?? REGIONS_FR[s.trim().toLowerCase()] ?? COUNTRIES_FR[key(s)] ?? s;
export const frCountry = (s: string) => COUNTRIES_FR[key(s)] ?? s;

/** « Sans ajout de soufre », « zéro sulfite »… dans le nom de la cuvée. */
export function ctLabels(...parts: string[]): WineLabel[] {
  return /sans\s+(ajout\s+de\s+)?(soufre|sulfites?)|z[ée]ro\s+sulfites?|no\s+sulfites?\s+added/i.test(parts.join(' ')) ? ['sans-sulfites'] : [];
}

/** Fiche (sans stock ni historique) depuis une ligne de n'importe quel export. */
function wineFrom(r: Rec): Omit<Wine, 'stock' | 'history'> {
  const vintage = int(get(r, 'vintage'));
  const designation = [get(r, 'designation'), get(r, 'vineyard')].filter(Boolean).join(' ');
  const from = int(get(r, 'beginconsume'));
  const to = int(get(r, 'endconsume'));
  const t = new Date().toISOString();
  return {
    ...emptyWineDraft(),
    id: newId('w'),
    domaine: get(r, 'producer') || get(r, 'wine'),
    cuvee: designation,
    vintage: vintage && vintage > 1800 && vintage !== 1001 ? vintage : null,
    color: ctColor(get(r, 'type'), get(r, 'color'), get(r, 'category')),
    appellation: get(r, 'appellation') || get(r, 'subregion') || frRegion(get(r, 'region')),
    region: frRegion(get(r, 'region')),
    country: frCountry(get(r, 'country')),
    size: ctSize(get(r, 'size')),
    grapes: get(r, 'varietal') || get(r, 'mastervarietal'),
    labels: ctLabels(get(r, 'wine'), get(r, 'designation')),
    from: from && from > 1800 && from < 2200 ? from : null,
    to: to && to > 1800 && to < 2200 ? to : null,
    ctId: get(r, 'iwine') || undefined,
    createdAt: t,
    updatedAt: t,
  };
}

interface Note {
  wine: string;
  date: string;
  score: number | null;
  text: string;
  used: boolean;
  id: string;
}

/** Prépare l'import (aucune écriture) ; `existing` sert à repérer les vins déjà en cave. */
export function buildCtImport(files: { name: string; text: string }[], existing: CaveFile): CtImport {
  const parsed = files.map((f) => {
    const recs = csvRecords(f.text);
    return { name: f.name, recs, kind: detectKind(recs[0]) };
  });
  const wines = new Map<string, Wine>(); // clé : iWine (ou nom)
  const keyOf = (r: Rec) => get(r, 'iwine') || norm(`${get(r, 'producer')} ${get(r, 'wine')} ${get(r, 'vintage')}`);
  const wineOf = (r: Rec) => {
    const k = keyOf(r);
    let w = wines.get(k);
    if (!w) {
      w = { ...wineFrom(r), stock: [], history: [] };
      wines.set(k, w);
    } else {
      // Une autre ligne peut connaître ce qui manque (fenêtre, prix…).
      const more = wineFrom(r);
      if (w.from == null && more.from != null) w.from = more.from;
      if (w.to == null && more.to != null) w.to = more.to;
    }
    return w;
  };
  const locations = new Map<string, CtLocation>();

  for (const f of parsed.filter((x) => x.kind === 'inventory'))
    for (const r of f.recs) {
      const w = wineOf(r);
      const n = 'quantity' in r ? (int(r.quantity!) ?? 0) : 1;
      if (n <= 0) continue;
      const slot: Slot = { place: get(r, 'location').replace(/^none$/i, ''), shelf: get(r, 'bin'), n };
      const cur = w.stock.find((s) => s.place === slot.place && s.shelf === slot.shelf);
      if (cur) cur.n += n;
      else w.stock.push(slot);
      const price = money(get(r, 'price', 'nativeprice'));
      if (price != null && w.price == null) w.price = price;
      if (!w.bought) w.bought = [get(r, 'storename'), get(r, 'purchasedate')].filter(Boolean).join(', ');
      const loc = locations.get(slot.place) ?? { name: slot.place, bottles: 0, bins: [] };
      loc.bottles += n;
      if (slot.shelf && !loc.bins.includes(slot.shelf)) loc.bins.push(slot.shelf);
      locations.set(slot.place, loc);
    }

  // Notes de dégustation, rapprochées ensuite des bouteilles sorties le même jour (à 3 jours près).
  const notes: Note[] = [];
  for (const f of parsed.filter((x) => x.kind === 'notes')) {
    const order = dateOrder(f.recs.map((r) => get(r, 'tastingdate', 'date')));
    for (const r of f.recs) {
      wineOf(r);
      notes.push({
        wine: keyOf(r),
        date: ctDate(get(r, 'tastingdate', 'date'), order),
        score: money(get(r, 'rating', 'score')),
        text: get(r, 'tastingnotes', 'notes', 'note'),
        used: false,
        id: get(r, 'inote') || newId('n'),
      });
    }
  }
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

  for (const f of parsed.filter((x) => x.kind === 'consumed')) {
    const order = dateOrder(f.recs.map((r) => get(r, 'consumed', 'date')));
    for (const r of f.recs) {
      const w = wineOf(r);
      const why = ctReason(get(r, 'shorttype', 'consumptiontype', 'type'));
      const date = ctDate(get(r, 'consumed', 'date'), order) || '1970-01-01';
      const note =
        why.reason === 'bue' || why.reason === 'ailleurs' || why.reason === 'exterieur'
          ? notes.find((n) => !n.used && n.wine === keyOf(r) && n.date && days(n.date, date) <= 3)
          : undefined;
      if (note) note.used = true;
      const place = get(r, 'location').replace(/^none$/i, '');
      const exit: Exit = {
        id: newId('x'),
        date,
        reason: why.reason,
        rating: scoreTo10(note?.score ?? null) ?? ratingFromComment([note?.text, get(r, 'consumptionnote')].filter(Boolean).join(' ')),
        score: note?.score ?? undefined,
        comment: [note?.text, get(r, 'consumptionnote')].filter(Boolean).join('\n'),
        dish: '',
        where: why.where,
        detail: why.detail,
        from: place || get(r, 'bin') ? { place, shelf: get(r, 'bin') } : undefined,
        ctId: `c:${get(r, 'iconsumed') || `${keyOf(r)}:${date}:${w.history.length}`}`,
        auteur: 'Robin',
      };
      w.history.push(exit);
      const price = money(get(r, 'price'));
      if (price != null && w.price == null) w.price = price;
    }
  }
  // Achats : une ligne par achat ; StoreName est souvent « Unknown », la vraie info est alors dans OrderNumber.
  for (const f of parsed.filter((x) => x.kind === 'purchases')) {
    const order = dateOrder(f.recs.map((r) => get(r, 'purchasedate', 'deliverydate')));
    for (const r of f.recs) {
      const date = ctDate(get(r, 'purchasedate', 'deliverydate'), order);
      const n = int(get(r, 'quantity')) ?? 0;
      if (!date || n <= 0) continue;
      const w = wineOf(r);
      const ctId = `p:${get(r, 'ipurchase') || `${keyOf(r)}:${date}:${n}`}`;
      const p: Purchase = {
        id: ctId,
        date,
        n,
        price: money(get(r, 'price', 'nativeprice')),
        note: [get(r, 'storename'), get(r, 'ordernumber')].map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · '),
        ctId,
      };
      if (!(w.purchases ?? []).some((x) => x.id === p.id)) w.purchases = [...(w.purchases ?? []), p];
    }
  }

  // Notes sans bouteille sortie : dégustées ailleurs (salon, restaurant, chez des amis).
  for (const n of notes.filter((x) => !x.used)) {
    const w = wines.get(n.wine);
    if (!w) continue;
    w.history.push({
      id: newId('x'),
      date: n.date || '1970-01-01',
      reason: 'exterieur',
      rating: scoreTo10(n.score) ?? ratingFromComment(n.text),
      score: n.score ?? undefined,
      comment: n.text,
      dish: '',
      where: '',
      detail: '',
      ctId: `n:${n.id}`,
      auteur: 'Robin',
    });
  }

  // Liste d'envies
  const wishes: Wish[] = [];
  const knownWish = new Set(existing.wishes.map((w) => w.ctId).filter(Boolean));
  for (const f of parsed.filter((x) => x.kind === 'wishlist'))
    for (const r of f.recs) {
      const ctId = `wl:${get(r, 'itaggedwine') || get(r, 'iwine')}`;
      if (knownWish.has(ctId) || wishes.some((w) => w.ctId === ctId)) continue;
      const w = wineFrom(r);
      // La liste d'envies n'a pas de colonne « Producer » : le domaine, c'est le nom du vin sans l'appellation ni la cuvée.
      if (!get(r, 'producer')) {
        let dom = get(r, 'wine');
        for (const x of [w.cuvee, get(r, 'designation'), get(r, 'vineyard'), w.appellation]) if (x) dom = dom.replace(x, ' ');
        w.domaine = dom.replace(/\s+/g, ' ').trim() || get(r, 'wine');
      }
      wishes.push({
        id: newId('e'),
        domaine: w.domaine,
        cuvee: w.cuvee,
        color: w.color,
        appellation: w.appellation,
        why: [w.vintage ? String(w.vintage) : '', get(r, 'notes')].filter(Boolean).join(' · '),
        ctId,
        createdAt: new Date().toISOString(),
      });
    }

  let merged = 0;
  const out = [...wines.values()].map((w) => {
    const same = existing.wines.find((x) => x.ctId && x.ctId === w.ctId) ?? findSame(existing, w);
    if (same) merged++;
    return { ...w, id: same?.id ?? w.id, history: sortHistory(w.history), ...(w.purchases ? { purchases: sortPurchases(w.purchases) } : {}) };
  });
  const tast = out.flatMap((w) => w.history).filter((x) => x.reason === 'bue' || x.reason === 'ailleurs' || x.reason === 'exterieur');
  return {
    files: parsed.map((p) => ({ name: p.name, kind: p.kind, rows: p.recs.length })),
    wines: out,
    locations: [...locations.values()].sort((a, b) => b.bottles - a.bottles),
    wishes,
    stats: {
      wines: out.filter((w) => w.stock.length).length,
      bottles: out.reduce((a, w) => a + w.stock.reduce((b, s) => b + s.n, 0), 0),
      tastings: tast.length,
      exits: out.flatMap((w) => w.history).length - tast.length,
      noWindow: out.filter((w) => w.stock.length && w.from == null && w.to == null).length,
      merged,
      elsewhere: out.filter((w) => !w.stock.length).length,
      wishes: wishes.length,
      purchases: out.reduce((a, w) => a + (w.purchases?.length ?? 0), 0),
    },
  };
}

/**
 * Écrit l'import dans la cave. `places` renomme les lieux CellarTracker (« Cellar » → « Cave »).
 * Vin déjà présent : son stock est remplacé par celui de CellarTracker (pas additionné deux fois), les champs vides
 * sont complétés, et seules les lignes d'historique pas encore importées sont ajoutées.
 */
export function applyCtImport(d: CaveFile, plan: CtImport, places: Record<string, string>): CaveFile {
  const place = (p: string) => (places[p] ?? p).trim() || 'À ranger';
  const mapSlot = <T extends { place: string; shelf: string }>(s: T): T => ({ ...s, place: place(s.place) });
  const wines = [...d.wines];
  const t = new Date().toISOString();
  for (const w of plan.wines) {
    const stock = w.stock.map(mapSlot).reduce<Slot[]>((acc, s) => {
      const cur = acc.find((x) => sameSlot(x, s));
      if (cur) cur.n += s.n;
      else acc.push({ ...s });
      return acc;
    }, []);
    const history = w.history.map((x) => (x.from ? { ...x, from: mapSlot(x.from) } : x));
    const i = wines.findIndex((x) => x.id === w.id);
    if (i < 0) {
      wines.push({ ...w, stock, history, updatedAt: t });
      continue;
    }
    const cur = wines[i]!;
    const known = new Set(cur.history.map((x) => x.ctId).filter(Boolean));
    const fill = <K extends keyof Wine>(k: K) => (cur[k] === '' || cur[k] == null ? w[k] : cur[k]);
    wines[i] = {
      ...cur,
      appellation: fill('appellation'),
      region: fill('region'),
      country: fill('country'),
      grapes: fill('grapes'),
      from: cur.from ?? w.from,
      to: cur.to ?? w.to,
      price: cur.price ?? w.price,
      bought: fill('bought'),
      ctId: cur.ctId ?? w.ctId,
      labels: cur.labels?.length ? cur.labels : w.labels,
      stock: w.stock.length ? stock : cur.stock,
      history: sortHistory([...cur.history, ...history.filter((x) => !known.has(x.ctId))]),
      ...(w.purchases?.length || cur.purchases
        ? { purchases: sortPurchases([...(cur.purchases ?? []), ...(w.purchases ?? []).filter((p) => !(cur.purchases ?? []).some((x) => x.id === p.id))]) }
        : {}),
      updatedAt: t,
    };
  }
  return { ...d, wines, wishes: [...plan.wishes, ...d.wishes] };
}
