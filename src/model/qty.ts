import type { QtyPart } from './types';

/** Clé de comparaison d'un nom : minuscules, sans accents ni ponctuation, pluriels simples retirés (« Œufs » → « oeuf »). */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’-]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 ? w.replace(/[sx]$/, '') : w))
    .join(' ');
}

const UNIT_ALIASES: Record<string, string> = {
  gr: 'g', gramme: 'g', grammes: 'g', kilo: 'kg', kilos: 'kg', kilogramme: 'kg', kilogrammes: 'kg',
  litre: 'l', litres: 'l', centilitre: 'cl', centilitres: 'cl', millilitre: 'ml', millilitres: 'ml',
};

/** Convertit vers l'unité de stockage : kg → g, L et cl → ml. */
export function makePart(n: number, unit?: string | null): QtyPart {
  const u = (unit ?? '').trim();
  switch (UNIT_ALIASES[u.toLowerCase()] ?? u.toLowerCase()) {
    case 'kg':
      return { n: n * 1000, u: 'g' };
    case 'g':
      return { n, u: 'g' };
    case 'l':
      return { n: n * 1000, u: 'ml' };
    case 'cl':
      return { n: n * 10, u: 'ml' };
    case 'ml':
      return { n, u: 'ml' };
    default:
      return { n, u: u || null };
  }
}

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

export function formatPart(p: QtyPart): string {
  if (p.n == null) return p.u ?? '';
  if (p.u === 'g') return p.n >= 1000 ? `${fmt(p.n / 1000)} kg` : `${fmt(p.n)} g`;
  if (p.u === 'ml') return p.n >= 1000 ? `${fmt(p.n / 1000)} L` : `${fmt(p.n)} ml`;
  if (p.u == null) return `×${fmt(p.n)}`;
  return `${fmt(p.n)} ${p.u}`;
}

export const formatQty = (q: QtyPart[]) => q.map(formatPart).join(' + ');

/** Additionne deux quantités : même unité → somme ; sinon les parties sont juxtaposées. */
export function mergeQty(a: QtyPart[], b: QtyPart[]): QtyPart[] {
  const out = a.map((p) => ({ ...p }));
  for (const p of b) {
    const same = out.find((q) => q.u === p.u && q.n != null && p.n != null);
    if (same && same.n != null && p.n != null) same.n += p.n;
    else out.push({ ...p });
  }
  return out;
}

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const UNIT = '(kg|g|ml|cl|l)';
const TRAILING = new RegExp(String.raw`^(.*\S)\s+${NUM}\s*${UNIT}$`, 'i');
const LEADING = new RegExp(String.raw`^${NUM}\s*${UNIT}?\s+(?:de\s+|d['’]\s*)?(.+)$`, 'i');
const toNumber = (s: string) => parseFloat(s.replace(',', '.'));
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Lit une saisie libre : « 2 lait », « lait 1L », « 500 g de farine », « pain ». */
export function parseEntry(raw: string): { name: string; qty: QtyPart[] } | null {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return null;
  let m = s.match(TRAILING);
  if (m) return { name: capitalize(m[1]!), qty: [makePart(toNumber(m[2]!), m[3])] };
  m = s.match(LEADING);
  if (m) return { name: capitalize(m[3]!), qty: [makePart(toNumber(m[1]!), m[2])] };
  return { name: capitalize(s), qty: [] };
}

/** Saisie multiple séparée par des virgules : « lait, pain, 6 œufs ». */
export const parseEntries = (raw: string) =>
  raw
    .split(',')
    .map(parseEntry)
    .filter((e): e is NonNullable<typeof e> => e !== null);

/** Lit le champ « Quantité » de la fiche article : « 2 », « 500 g », « 1,5 kg + 2 », « 3 gousses », « un peu ». */
export function parseQtyText(text: string): QtyPart[] {
  return text
    .split('+')
    .map((x) => x.trim().replace(/^[×x]\s*(?=\d)/i, ''))
    .filter(Boolean)
    .map((x) => {
      const m = x.match(new RegExp(String.raw`^${NUM}\s*(.*)$`));
      return m ? makePart(toNumber(m[1]!), m[2]!.trim() || null) : { n: null, u: x };
    });
}
