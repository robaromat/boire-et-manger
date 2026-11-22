// Notes des vins sur 10 (avant : étoiles de 1 à 5). Robin notait souvent dans le commentaire : « 8/10 »,
// « 6,5/10. pas désagréable », « 7.5 bien », « Bien ! 8.5 ». On reprend ces notes-là.

const clean = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return n >= 0 && n <= 10 ? Math.round(n * 2) / 2 : null;
};

/** Note sur 10 écrite dans un commentaire, ou null. */
export function ratingFromComment(comment: string): number | null {
  const c = comment.trim();
  // « 8/10 », « 6,5 / 10 » : n'importe où.
  const slash = c.match(/(?:^|[^\d.,])(10|\d(?:[.,]\d)?)\s*\/\s*10(?!\d)/);
  if (slash) return clean(slash[1]!);
  // « 7 », « 7. Pas mal », « 8.5\nTrès bon », « 7 pas mal » : en tout début.
  const lead = c.match(/^(10|\d(?:[.,]5)?)(?![\d/]|[.,]\d)(?=$|[\s.!,;:])/);
  if (lead) return clean(lead[1]!);
  // « Bien ! 8.5 » : une demi-note seule.
  const half = c.match(/(?:^|\s)(\d[.,]5)(?=$|[\s.!,;:])/);
  if (half) return clean(half[1]!);
  return null;
}

/** Ancienne note en étoiles (1 à 5) → sur 10 ; la note écrite « …/10 » dans le commentaire l'emporte. */
export function migrateRating(stars: number | null, comment: string): number | null {
  const written = ratingFromComment(comment);
  const explicit = /\/\s*10/.test(comment);
  if (written != null && (explicit || stars == null)) return written;
  if (stars == null) return null;
  return Math.min(10, stars * 2);
}

/** « 8/10 », « 8,5/10 ». */
export const fmtRating = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')}/10`;
