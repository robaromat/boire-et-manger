import { removeExit, takeBottle, updateExit } from '../cave/ops';
import type { CaveFile } from '../cave/types';
import type { Place, VisitWine } from './types';

// Lien Souvenirs → Cave : un vin coché dans une visite devient une dégustation « ailleurs » de la Cave (sans toucher
// au stock), avec le lieu comme « Où » et la date de la visite. Fonctions pures, testées dans souvenirs.test.ts.

/**
 * Met la Cave d'accord avec les vins d'une visite : crée les lignes des vins ajoutés, retire celles des vins enlevés,
 * met à jour la date et le lieu des autres. Renvoie la Cave et la liste des liens à garder dans la visite.
 */
export function syncVisitWines(
  cave: CaveFile,
  place: Pick<Place, 'id' | 'name'>,
  visit: { date: string; rating: number | null },
  before: VisitWine[],
  wineIds: string[],
): { cave: CaveFile; wines: VisitWine[] } {
  let c = cave;
  const kept: VisitWine[] = [];
  for (const w of before) {
    const exists = c.wines.find((x) => x.id === w.wineId)?.history.some((e) => e.id === w.exitId);
    if (!wineIds.includes(w.wineId)) {
      if (exists) c = removeExit(c, w.wineId, w.exitId);
    } else if (exists) {
      c = updateExit(c, w.wineId, w.exitId, { date: visit.date, where: place.name, place: place.id });
      kept.push(w);
    }
  }
  for (const id of wineIds) {
    if (kept.some((w) => w.wineId === id) || !c.wines.some((x) => x.id === id)) continue;
    const r = takeBottle(c, id, {
      date: visit.date,
      reason: 'exterieur',
      rating: null,
      comment: '',
      dish: '',
      where: place.name,
      detail: '',
      place: place.id,
      auteur: 'Robin',
    });
    c = r.data;
    kept.push({ wineId: id, exitId: r.exitId });
  }
  return { cave: c, wines: kept };
}

/** Retire de la Cave les dégustations liées à des visites supprimées. */
export function dropVisitWines(cave: CaveFile, wines: VisitWine[]): CaveFile {
  return wines.reduce((c, w) => removeExit(c, w.wineId, w.exitId), cave);
}
