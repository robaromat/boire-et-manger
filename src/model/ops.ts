import type { DataFile } from './types';

/** Monte (dir = -1) ou descend (dir = 1) un rayon dans l'ordre d'affichage. */
export function moveRayon(d: DataFile, index: number, dir: -1 | 1): DataFile {
  const j = index + dir;
  if (index < 0 || j < 0 || index >= d.rayonOrder.length || j >= d.rayonOrder.length) return d;
  const order = [...d.rayonOrder];
  [order[index], order[j]] = [order[j]!, order[index]!];
  return { ...d, rayonOrder: order };
}
