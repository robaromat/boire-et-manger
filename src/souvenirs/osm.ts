import type { PlaceType } from './types';

// Lieux OpenStreetMap, interrogés directement depuis le téléphone :
//   - recherche par nom : Nominatim (une recherche à la validation, jamais à chaque lettre : règle d'usage) ;
//   - autour de moi : Overpass (restos, bars, cafés, caves, boulangeries, marchés et épiceries à moins de 300 m) ;
//   - adresse d'un point posé à la main : Nominatim « reverse ».
// Seuls le texte cherché ou les coordonnées partent vers OpenStreetMap ; rien d'autre (ni jeton ni données).

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OVERPASS = 'https://overpass-api.de/api/interpreter';

export interface OsmPlace {
  osm: string; // « node/123 »
  name: string;
  type: PlaceType;
  sub: string;
  address: string;
  city: string;
  lat: number;
  lon: number;
}

export class OsmError extends Error {}

const CUISINES: Record<string, string> = {
  french: 'Français',
  regional: 'Cuisine régionale',
  italian: 'Italien',
  pizza: 'Pizzeria',
  japanese: 'Japonais',
  sushi: 'Sushis',
  ramen: 'Ramen',
  chinese: 'Chinois',
  vietnamese: 'Vietnamien',
  thai: 'Thaï',
  korean: 'Coréen',
  indian: 'Indien',
  lebanese: 'Libanais',
  greek: 'Grec',
  spanish: 'Espagnol',
  tapas: 'Tapas',
  mexican: 'Mexicain',
  moroccan: 'Marocain',
  burger: 'Burgers',
  crepe: 'Crêperie',
  seafood: 'Poissons et fruits de mer',
  steak_house: 'Grill',
  vegetarian: 'Végétarien',
  vegan: 'Vegan',
  kebab: 'Kebab',
  brasserie: 'Brasserie',
  bistro: 'Bistrot',
  coffee_shop: 'Café',
  ice_cream: 'Glacier',
};

const SHOP_SUBS: Record<string, string> = {
  bakery: 'Boulangerie',
  pastry: 'Pâtisserie',
  confectionery: 'Confiserie',
  chocolate: 'Chocolatier',
  wine: 'Caviste',
  alcohol: 'Caviste',
  beverages: 'Boissons',
  cheese: 'Fromager',
  deli: 'Épicerie fine',
  butcher: 'Boucherie',
  greengrocer: 'Primeur',
  seafood: 'Poissonnerie',
  coffee: 'Torréfacteur',
  tea: 'Thés',
  farm: 'Produits de la ferme',
};

/** Type B&M d'après les étiquettes OpenStreetMap (amenity=restaurant, shop=bakery…). */
export function typeFromTags(t: Record<string, string | undefined>): { type: PlaceType; sub: string } {
  const a = t.amenity ?? '';
  const s = t.shop ?? '';
  const cuisine = (t.cuisine ?? '').split(';')[0]!.trim();
  const sub = CUISINES[cuisine] ?? '';
  if (a === 'restaurant' || a === 'fast_food' || a === 'food_court') return { type: 'resto', sub };
  if (a === 'bar' || a === 'pub' || a === 'biergarten') return { type: 'bar', sub: a === 'pub' ? 'Pub' : sub };
  if (a === 'cafe') return { type: 'cafe', sub: sub === 'Café' ? '' : sub };
  if (a === 'ice_cream') return { type: 'cafe', sub: 'Glacier' };
  if (s === 'wine' || s === 'alcohol' || s === 'beverages') return { type: 'cave', sub: SHOP_SUBS[s] ?? '' };
  if (s === 'bakery' || s === 'pastry' || s === 'confectionery' || s === 'chocolate') return { type: 'boul', sub: s === 'bakery' ? '' : SHOP_SUBS[s]! };
  if (a === 'marketplace') return { type: 'marche', sub: 'Marché' };
  if (SHOP_SUBS[s]) return { type: 'marche', sub: SHOP_SUBS[s]! };
  return { type: 'autre', sub: '' };
}

function addressFromTags(t: Record<string, string | undefined>): { address: string; city: string } {
  const street = [t['addr:housenumber'], t['addr:street'] ?? t['addr:place']].filter(Boolean).join(' ');
  return { address: street, city: t['addr:city'] ?? '' };
}

async function get(url: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new OsmError('Pas de connexion : la recherche de lieux a besoin d’internet.');
  }
  if (res.status === 429 || res.status === 504) throw new OsmError('OpenStreetMap est chargé : réessaie dans une minute.');
  if (!res.ok) throw new OsmError(`OpenStreetMap a répondu ${res.status}.`);
  return res;
}

interface NominatimHit {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  category?: string;
  type?: string;
  address?: Record<string, string>;
  extratags?: Record<string, string>;
}

export function fromNominatim(h: NominatimHit): OsmPlace {
  const tags: Record<string, string | undefined> = { ...(h.extratags ?? {}) };
  if (h.category && h.type) tags[h.category] = h.type;
  const { type, sub } = typeFromTags(tags);
  const a = h.address ?? {};
  const street = [a.house_number, a.road ?? a.pedestrian ?? a.square ?? a.place].filter(Boolean).join(' ');
  return {
    osm: `${h.osm_type}/${h.osm_id}`,
    name: h.name || h.display_name.split(',')[0]!.trim(),
    type,
    sub,
    address: street,
    city: a.city ?? a.town ?? a.village ?? a.municipality ?? '',
    lat: parseFloat(h.lat),
    lon: parseFloat(h.lon),
  };
}

/** Recherche par nom (« Trattoria Nonna Lyon »), près de `near` si on connaît ta position. */
export async function searchPlaces(q: string, near?: { lat: number; lon: number } | null, signal?: AbortSignal): Promise<OsmPlace[]> {
  const p = new URLSearchParams({ q, format: 'jsonv2', addressdetails: '1', extratags: '1', limit: '12', 'accept-language': 'fr' });
  if (near) {
    // D'abord à une vingtaine de kilomètres ; rien trouvé : partout.
    const d = 0.2;
    const local = new URLSearchParams(p);
    local.set('viewbox', [near.lon - d, near.lat + d, near.lon + d, near.lat - d].join(','));
    local.set('bounded', '1');
    const hits = (await (await get(`${NOMINATIM}/search?${local}`, { signal })).json()) as NominatimHit[];
    if (hits.length) return hits.map(fromNominatim);
  }
  const res = await get(`${NOMINATIM}/search?${p}`, { signal });
  const hits = (await res.json()) as NominatimHit[];
  return hits.map(fromNominatim);
}

/** Adresse d'un point (posé à la main sur la carte). */
export async function reverse(lat: number, lon: number, signal?: AbortSignal): Promise<OsmPlace | null> {
  const p = new URLSearchParams({ lat: String(lat), lon: String(lon), format: 'jsonv2', addressdetails: '1', extratags: '1', zoom: '18', 'accept-language': 'fr' });
  const res = await get(`${NOMINATIM}/reverse?${p}`, { signal });
  const h = (await res.json()) as NominatimHit & { error?: string };
  return h.error ? null : { ...fromNominatim(h), lat, lon };
}

export function overpassQuery(lat: number, lon: number, radius: number): string {
  const around = `(around:${radius},${lat.toFixed(6)},${lon.toFixed(6)})`;
  return `[out:json][timeout:20];
(
  nwr${around}["amenity"~"^(restaurant|fast_food|bar|pub|biergarten|cafe|ice_cream|marketplace|food_court)$"]["name"];
  nwr${around}["shop"~"^(bakery|pastry|confectionery|chocolate|wine|alcohol|beverages|cheese|deli|butcher|greengrocer|seafood|coffee|tea|farm)$"]["name"];
);
out center tags 60;`;
}

interface OverpassEl {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function fromOverpass(els: OverpassEl[]): OsmPlace[] {
  return els
    .map((e) => {
      const t = e.tags ?? {};
      const pos = e.center ?? (e.lat != null && e.lon != null ? { lat: e.lat, lon: e.lon } : null);
      if (!pos || !t.name) return null;
      return { osm: `${e.type}/${e.id}`, name: t.name, ...typeFromTags(t), ...addressFromTags(t), lat: pos.lat, lon: pos.lon };
    })
    .filter((x): x is OsmPlace => !!x);
}

/** Lieux autour d'un point (300 m par défaut). */
export async function nearbyPlaces(lat: number, lon: number, radius = 300, signal?: AbortSignal): Promise<OsmPlace[]> {
  const res = await get(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: overpassQuery(lat, lon, radius) }), signal });
  const body = (await res.json()) as { elements?: OverpassEl[] };
  return fromOverpass(body.elements ?? []);
}

/** Ta position (le téléphone demande l'autorisation la première fois). */
export function myPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new OsmError('Ce navigateur ne donne pas la position.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) =>
        reject(
          new OsmError(
            e.code === e.PERMISSION_DENIED
              ? 'Position refusée : autorise-la pour B&M dans les réglages du navigateur.'
              : 'Position introuvable pour l’instant : réessaie dehors ou avec le GPS activé.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

/** Lien Google Maps : itinéraire vers le lieu (ou recherche par nom s'il n'a pas de position). */
export function googleMapsUrl(p: { name: string; address: string; city: string; lat: number | null; lon: number | null }): string {
  if (p.lat != null && p.lon != null) return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, p.address, p.city].filter(Boolean).join(', '))}`;
}
