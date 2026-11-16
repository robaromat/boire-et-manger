import { DEFAULT_RAYON_ORDER, RAYONS, type DataFile, type RayonId } from './types';

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Vérification minimale de data.json (lu sur GitHub ou importé). Renvoie null si le format ne colle pas. */
export function parseDataFile(raw: unknown): DataFile | null {
  if (!isObj(raw)) return null;
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.lists) || !isObj(raw.history)) return null;
  const okLists = raw.lists.every(
    (l) =>
      isObj(l) &&
      typeof l.id === 'string' &&
      typeof l.name === 'string' &&
      Array.isArray(l.items) &&
      l.items.every((i) => isObj(i) && typeof i.id === 'string' && typeof i.name === 'string'),
  );
  if (!okLists) return null;
  const d = raw as unknown as DataFile;
  return { ...d, rayonOrder: normalizeRayonOrder(raw.rayonOrder) };
}

/** Ordre des rayons sûr : rayons inconnus retirés, rayons manquants ajoutés à la fin (avant « Divers » si possible). */
export function normalizeRayonOrder(raw: unknown): RayonId[] {
  const known = Object.keys(RAYONS) as RayonId[];
  const given = Array.isArray(raw) ? raw.filter((r): r is RayonId => known.includes(r as RayonId)) : [];
  const uniq = [...new Set(given)];
  for (const r of DEFAULT_RAYON_ORDER) if (!uniq.includes(r)) uniq.push(r);
  return uniq;
}

export function emptyDataFile(): DataFile {
  return { schemaVersion: 1, rayonOrder: [...DEFAULT_RAYON_ORDER], lists: [], history: {} };
}
