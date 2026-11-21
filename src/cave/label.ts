import { RecipeError, askJson } from '../recipe/read';
import { emptyWineDraft, type WineDraft } from './ops';
import { COLORS, type Estimable, type WineColor, type WineLabel } from './types';

// Lecture d'une étiquette de vin par ChatGPT (photo), ou fiche complétée d'après le nom du vin (texte).
// Ce qui est lu sur l'étiquette est repris tel quel ; ce qui est déduit (région, cépages, style, fenêtre de dégustation,
// accords) est marqué « estimation » sur la fiche.

export interface LabelRead {
  is_wine: boolean;
  domaine: string;
  cuvee: string;
  vintage: number | null;
  color: WineColor;
  appellation: string;
  region: string;
  country: string;
  grapes: string;
  style: string;
  drink_from: number | null;
  drink_to: number | null;
  pairings: string[];
  recipes: number[];
  organic: boolean;
  biodynamic: boolean;
  no_added_sulfites: boolean;
}

export type LabelInput = { image: string } | { text: string };

const PROMPT = (year: number) => `Tu aides à tenir une cave à vin personnelle, en français. On te donne la photo d'une étiquette de vin
(ou la capture d'une carte des vins, d'une facture), ou bien le nom d'un vin à compléter.
Renvoie :
- is_wine : false si l'image ne montre pas de vin.
- domaine : le producteur (domaine, château, maison), tel qu'écrit sur l'étiquette.
- cuvee : le nom de la cuvée s'il y en a un, sinon chaîne vide. Ne répète pas l'appellation ni le domaine.
- vintage : le millésime (année) ; null s'il n'y en a pas (non millésimé).
- color : une valeur parmi rouge, blanc, rose, bulles (tout effervescent), doux (liquoreux, moelleux, vin muté).
- appellation : l'appellation (AOC, DOC…), sinon la dénomination.
- region : la région viticole (Loire, Bourgogne, Rhône, Piémont…).
- country : le pays, en français.
- grapes : les cépages, du principal au secondaire, séparés par des virgules (ce que tu sais du vin si l'étiquette ne le dit pas).
- style : 3 à 6 mots qui décrivent le vin (« fruit rouge, frais, tanins souples »).
- drink_from, drink_to : l'année de début et de fin de la fenêtre où ce vin sera bon à boire, pour ce millésime
  (nous sommes en ${year}) ; null si tu ne peux pas estimer.
- pairings : 2 à 4 plats qui vont bien avec ce vin, courts (« Volaille rôtie », « Comté affiné »).
- recipes : les numéros (dans la liste donnée) des recettes du carnet qui s'accorderaient bien avec ce vin, 0 à 3, les meilleures d'abord ;
  liste vide si aucune ne va vraiment.
- organic : true si l'étiquette porte un logo ou une mention bio (feuille européenne, AB, « vin biologique », « agriculture
  biologique »), ou si le domaine est notoirement certifié bio ; sinon false.
- biodynamic : true si l'étiquette porte Demeter, Biodyvin ou la mention biodynamie, ou si le domaine est notoirement
  certifié en biodynamie ; sinon false.
- no_added_sulfites : true seulement si l'étiquette dit « sans sulfites ajoutés » (ou « sans soufre ajouté », « zéro
  sulfite ajouté ») ou si cette cuvée est notoirement sans sulfites ajoutés ; sinon false.
N'invente pas un domaine ou une cuvée illisibles : laisse vide.`;

const SCHEMA = {
  name: 'vin',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['is_wine', 'domaine', 'cuvee', 'vintage', 'color', 'appellation', 'region', 'country', 'grapes', 'style', 'drink_from', 'drink_to', 'pairings', 'recipes', 'organic', 'biodynamic', 'no_added_sulfites'],
    properties: {
      is_wine: { type: 'boolean' },
      domaine: { type: 'string' },
      cuvee: { type: 'string' },
      vintage: { type: ['integer', 'null'] },
      color: { type: 'string', enum: [...COLORS] },
      appellation: { type: 'string' },
      region: { type: 'string' },
      country: { type: 'string' },
      grapes: { type: 'string' },
      style: { type: 'string' },
      drink_from: { type: ['integer', 'null'] },
      drink_to: { type: ['integer', 'null'] },
      pairings: { type: 'array', items: { type: 'string' } },
      recipes: { type: 'array', items: { type: 'integer' } },
      organic: { type: 'boolean' },
      biodynamic: { type: 'boolean' },
      no_added_sulfites: { type: 'boolean' },
    },
  },
} as const;

export interface RecipeRef {
  id: string;
  title: string;
  category: string;
}

export function buildLabelRequest(model: string, input: LabelInput, recipes: RecipeRef[], year: number, withReasoning = true) {
  const list = recipes.length ? recipes.map((r, i) => `${i}. ${r.title} (${r.category})`).join('\n') : '(carnet vide)';
  const intro = `Recettes du carnet :\n${list}\n\n`;
  const user =
    'image' in input
      ? [
          { type: 'text', text: `${intro}Voici l'étiquette.` },
          { type: 'image_url', image_url: { url: input.image, detail: 'high' } },
        ]
      : `${intro}Vin à compléter : ${input.text}`;
  return {
    model,
    ...(withReasoning && model.startsWith('gpt-5') ? { reasoning_effort: 'minimal' } : {}),
    max_completion_tokens: 3000,
    response_format: { type: 'json_schema', json_schema: SCHEMA },
    messages: [
      { role: 'system', content: PROMPT(year) },
      { role: 'user', content: user },
    ],
  };
}

export async function readLabel(
  key: string,
  input: LabelInput,
  recipes: RecipeRef[],
  opts: { fetch?: typeof fetch; signal?: AbortSignal; year?: number } = {},
): Promise<LabelRead> {
  const year = opts.year ?? new Date().getFullYear();
  const r = await askJson<LabelRead>(key, (model, wr) => buildLabelRequest(model, input, recipes.slice(0, 200), year, wr), opts);
  if (!r.is_wine) throw new RecipeError('empty', 'Pas d’étiquette de vin reconnue. Essaie une photo plus nette, bien cadrée sur l’étiquette.');
  return r;
}

const clean = (s: string | null | undefined) => (s ?? '').trim();
const year = (n: number | null | undefined) => (typeof n === 'number' && n > 1800 && n < 2200 ? Math.round(n) : null);

/**
 * Fiche à vérifier d'après la lecture. Avec `base` (vin déjà en fiche, « Compléter avec ChatGPT »), seuls les champs
 * vides sont remplis.
 */
export function draftFromLabel(r: LabelRead, recipes: RecipeRef[], base?: WineDraft): WineDraft {
  const d = base ? { ...base } : emptyWineDraft();
  const est = new Set<Estimable>(d.estimated);
  const take = (k: 'domaine' | 'cuvee' | 'appellation' | 'country', v: string) => {
    if (!d[k].trim() && v) d[k] = v;
  };
  take('domaine', clean(r.domaine));
  take('cuvee', clean(r.cuvee));
  take('appellation', clean(r.appellation));
  take('country', clean(r.country));
  if (!base) {
    d.vintage = year(r.vintage);
    d.color = (COLORS as readonly string[]).includes(r.color) ? r.color : 'rouge';
  }
  if (!d.region.trim() && clean(r.region)) {
    d.region = clean(r.region);
    est.add('region');
  }
  if (!d.grapes.trim() && clean(r.grapes)) {
    d.grapes = clean(r.grapes);
    est.add('grapes');
  }
  if (!d.style.trim() && clean(r.style)) {
    d.style = clean(r.style);
    est.add('style');
  }
  if (d.from == null && d.to == null && (year(r.drink_from) || year(r.drink_to))) {
    d.from = year(r.drink_from);
    d.to = year(r.drink_to);
    if (d.from && d.to && d.from > d.to) [d.from, d.to] = [d.to, d.from];
    est.add('window');
  }
  if (!d.pairings.length && !d.pairRecipes.length) {
    d.pairings = (r.pairings ?? []).map(clean).filter(Boolean).slice(0, 4);
    d.pairRecipes = [...new Set((r.recipes ?? []).map((i) => recipes[i]?.id).filter((x): x is string => !!x))].slice(0, 3);
    if (d.pairings.length || d.pairRecipes.length) est.add('pairings');
  }
  // Classification : seulement si la fiche n'en a pas encore ; à vérifier sur l'écran de revue.
  if (!d.labels?.length) {
    const labels: WineLabel[] = [];
    if (r.organic || r.biodynamic) labels.push('bio');
    if (r.biodynamic) labels.push('biodynamie');
    if (r.no_added_sulfites) labels.push('sans-sulfites');
    d.labels = labels;
    if (labels.length) est.add('labels');
  }
  d.estimated = [...est];
  return d;
}
