// Recette depuis un lien. Le navigateur n'a pas le droit de lire directement une page d'un autre site : on passe par
// le relais public r.jina.ai, comme « Depuis un article » dans Culture (seule l'adresse de la page lui est transmise).
// La plupart des sites de recettes publient pour Google une fiche « Recipe » (schema.org, en JSON-LD) : si on la
// trouve, on n'envoie à ChatGPT que ses lignes (titre, portions, ingrédients) ; sinon, le texte de la page.

const RELAY = 'https://r.jina.ai/';
const MAX_TEXT = 15000;

export class LinkError extends Error {}

export function normalizeUrl(raw: string): string | null {
  const t = raw.trim().match(/https?:\/\/\S+/)?.[0] ?? (/^[\w-]+(\.[\w-]+)+\//.test(raw.trim()) ? `https://${raw.trim()}` : null);
  if (!t) return null;
  try {
    return new URL(t).href;
  } catch {
    return null;
  }
}

export interface JsonLdRecipe {
  name: string;
  yield: string | null;
  ingredients: string[];
}

type Json = Record<string, unknown>;
const isRecipe = (o: Json) => {
  const t = o['@type'];
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
};

function findRecipe(node: unknown): Json | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n);
      if (r) return r;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  const o = node as Json;
  if (isRecipe(o)) return o;
  return findRecipe(o['@graph']) ?? findRecipe(o['mainEntity']);
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** Cherche la fiche Recipe dans les blocs <script type="application/ld+json"> d'une page HTML. */
export function extractJsonLdRecipe(html: string): JsonLdRecipe | null {
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of blocks) {
    let json: unknown;
    try {
      json = JSON.parse(m[1]!.trim());
    } catch {
      continue;
    }
    const r = findRecipe(json);
    if (!r) continue;
    const ingredients = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : [])
      .map((x) => decode(String(x)))
      .filter(Boolean);
    if (!ingredients.length) continue;
    const y = r.recipeYield;
    const yieldText = Array.isArray(y) ? y.map(String).join(' / ') : y != null ? String(y) : null;
    return { name: decode(String(r.name ?? '')), yield: yieldText, ingredients };
  }
  return null;
}

export const jsonLdToText = (r: JsonLdRecipe) =>
  [`Titre : ${r.name}`, r.yield ? `Portions : ${r.yield}` : '', 'Ingrédients :', ...r.ingredients.map((i) => `- ${i}`)]
    .filter(Boolean)
    .join('\n');

async function relay(url: string, html: boolean): Promise<Response> {
  return fetch(RELAY + url, html ? { headers: { 'X-Return-Format': 'html' } } : undefined);
}

/** Texte à faire lire pour une adresse de recette : la fiche Recipe si la page en a une, sinon son texte. */
export async function fetchRecipeText(url: string): Promise<{ text: string; structured: boolean }> {
  try {
    const res = await relay(url, true);
    if (res.ok) {
      const r = extractJsonLdRecipe(await res.text());
      if (r) return { text: jsonLdToText(r), structured: true };
    }
  } catch {
    /* on retente en texte simple ci-dessous */
  }
  let res: Response;
  try {
    res = await relay(url, false);
  } catch {
    throw new LinkError('Le service de lecture des pages ne répond pas. Fais plutôt une capture d’écran de la recette.');
  }
  if (res.status === 429) throw new LinkError('Trop de pages lues d’un coup : réessaie dans une minute.');
  if (!res.ok) throw new LinkError(`Page illisible (${res.status}). Fais plutôt une capture d’écran de la recette.`);
  const raw = await res.text();
  const body = raw.split(/^Markdown Content:\s*$/m)[1] ?? raw;
  if (body.trim().length < 80)
    throw new LinkError('Page vide ou réservée aux comptes connectés (Instagram, TikTok…). Fais plutôt une capture d’écran.');
  return { text: body.slice(0, MAX_TEXT), structured: false };
}
