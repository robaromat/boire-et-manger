import { mergeEntities } from '../sync/merge';
import type { Place, SouvenirsFile, Visit } from './types';

// Fusion « à trois » de souvenirs.json (même principe que Recettes) : lieu par lieu ; si les deux appareils ont
// modifié le même lieu, le plus récent gagne pour ses champs, et ses visites sont fusionnées une par une.

const byId = <T extends { id: string }>(xs: T[] | undefined) => new Map<string, T>((xs ?? []).map((x) => [x.id, x]));

function mergePlace(l: Place, r: Place, b: Place | undefined): Place {
  const win = l.updatedAt >= r.updatedAt ? l : r;
  const visits = [...mergeEntities<Visit>(byId(b?.visits), byId(l.visits), byId(r.visits), (x) => x).values()].sort((x, y) =>
    x.date < y.date ? 1 : x.date > y.date ? -1 : 0,
  );
  // Une visite notée d'un côté retire le lieu des « À essayer », même si l'autre côté a gagné.
  return { ...win, visits, todo: win.todo && !visits.length };
}

export function mergeSouvenirs(base: SouvenirsFile | null, local: SouvenirsFile, remote: SouvenirsFile): SouvenirsFile {
  const m = mergeEntities(byId(base?.places), byId(local.places), byId(remote.places), mergePlace);
  return { schemaVersion: 1, places: [...m.values()] };
}
