// Lecture d'un export CSV (CellarTracker) : guillemets, retours à la ligne dans un champ, séparateur
// virgule, point-virgule ou tabulation, et encodage UTF-8 ou Windows-1252 (CellarTracker exporte souvent en Latin-1).

/** Décode les octets du fichier : UTF-8 s'il est valide, sinon Windows-1252. */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function sniffDelimiter(text: string): string {
  const head = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : 2000);
  const counts = [',', ';', '\t'].map((d) => [d, head.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0]![0];
}

/** Lignes du fichier, champs bruts. */
export function parseCsv(text: string, delimiter = sniffDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

/** Lignes en objets, clés = en-têtes en minuscules sans espaces. */
export function csvRecords(text: string): Record<string, string>[] {
  const [head, ...rows] = parseCsv(text);
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase().replace(/[\s_]+/g, ''));
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}
