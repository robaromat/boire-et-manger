import type { PhotoId } from '../recettes/types';

// Modèle de souvenirs.json (dépôt privé boire-et-manger-data), issu du grill du 18-19/11/2026
// et de la maquette Souvenirs validée le 20/11/2026 (maquettes/maquette-bm-souvenirs.html).

export const PLACE_TYPES = ['resto', 'bar', 'cafe', 'cave', 'boul', 'marche', 'autre'] as const;
export type PlaceType = (typeof PLACE_TYPES)[number];
export const TYPE_LABELS: Record<PlaceType, string> = {
  resto: 'Resto',
  bar: 'Bar',
  cafe: 'Café',
  cave: 'Cave à vin',
  boul: 'Boulangerie',
  marche: 'Marché, épicerie',
  autre: 'Autre',
};
export const TYPE_PLURALS: Record<PlaceType, string> = {
  resto: 'Restos',
  bar: 'Bars',
  cafe: 'Cafés',
  cave: 'Caves',
  boul: 'Boulangeries',
  marche: 'Marchés',
  autre: 'Autres',
};

/** Vin bu pendant la visite : la ligne « Dégustée ailleurs » qu'il a créée dans la Cave. */
export interface VisitWine {
  wineId: string;
  exitId: string;
}

export interface Visit {
  id: string; // « v_… »
  date: string; // AAAA-MM-JJ
  with: string[]; // prénoms
  rating: number | null; // 1 à 5
  comment: string;
  photos: PhotoId[];
  wines: VisitWine[];
  auteur: string;
}

export interface Place {
  id: string; // « l_… »
  name: string;
  type: PlaceType;
  sub: string; // « Bistrot », « Italien » ; vide = le type
  address: string;
  city: string;
  lat: number | null;
  lon: number | null;
  osm?: string; // « node/123 », pour reconnaître un lieu déjà enregistré
  tags: string[];
  /** Ce que tu reprendrais (plats, vins). */
  reco: string;
  /** À essayer (pas encore visité), et pourquoi / conseillé par qui. */
  todo: boolean;
  why: string;
  visits: Visit[]; // la plus récente en premier
  createdAt: string;
  updatedAt: string;
}

export interface SouvenirsFile {
  schemaVersion: 1;
  places: Place[];
}

export const SOUVENIRS_FILE = 'souvenirs.json';
export const emptySouvenirsFile = (): SouvenirsFile => ({ schemaVersion: 1, places: [] });

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown) => (typeof x === 'string' ? x : '');
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const strs = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);

/** Vérification minimale de souvenirs.json ; complète les champs manquants plutôt que de tout refuser. */
export function parseSouvenirsFile(raw: unknown): SouvenirsFile | null {
  if (!isObj(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.places)) return null;
  const places: Place[] = [];
  for (const p of raw.places) {
    if (!isObj(p) || typeof p.id !== 'string') continue;
    places.push({
      ...(p as unknown as Place),
      name: str(p.name) || 'Lieu sans nom',
      type: (PLACE_TYPES as readonly string[]).includes(p.type as string) ? (p.type as PlaceType) : 'autre',
      sub: str(p.sub),
      address: str(p.address),
      city: str(p.city),
      lat: num(p.lat),
      lon: num(p.lon),
      tags: strs(p.tags),
      reco: str(p.reco),
      todo: p.todo === true,
      why: str(p.why),
      visits: Array.isArray(p.visits)
        ? p.visits
            .filter((v): v is Record<string, unknown> => isObj(v) && typeof v.id === 'string')
            .map((v) => ({
              ...(v as unknown as Visit),
              date: str(v.date) || '1970-01-01',
              with: strs(v.with),
              rating: num(v.rating),
              comment: str(v.comment),
              photos: strs(v.photos),
              wines: Array.isArray(v.wines) ? v.wines.filter((w): w is VisitWine => isObj(w) && typeof w.wineId === 'string' && typeof w.exitId === 'string') : [],
              auteur: str(v.auteur) || 'Robin',
            }))
        : [],
      createdAt: str(p.createdAt) || new Date(0).toISOString(),
      updatedAt: str(p.updatedAt) || new Date(0).toISOString(),
    });
  }
  return { schemaVersion: 1, places };
}
