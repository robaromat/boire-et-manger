// Lecture d'une recette en photo par l'API OpenAI (Chat Completions, vision + réponse JSON imposée).
// Appel direct depuis le téléphone avec la clé des Réglages : l'image ne passe par aucun autre serveur.

const API = 'https://api.openai.com/v1';

/** Modèles essayés dans l'ordre : le premier disponible sur le compte est utilisé. */
export const PREFERRED_MODELS = ['gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini', 'gpt-5', 'gpt-4.1', 'gpt-4o'];

export interface RecipeIngredient {
  name: string;
  quantity: number | null;
  unit: string | null;
}

export interface Recipe {
  title: string;
  servings: number | null;
  ingredients: RecipeIngredient[];
}

export class RecipeError extends Error {
  constructor(
    public kind: 'key' | 'quota' | 'network' | 'empty' | 'server' | 'aborted',
    message: string,
  ) {
    super(message);
  }
}

const PROMPT = `Tu lis une recette (photo de livre, fiche, capture d'écran, ou texte d'une page web) pour préparer une liste de courses en français.
Renvoie :
- title : le titre de la recette (ou une courte description si absent).
- servings : le nombre de portions/personnes indiqué, sinon null.
- ingredients : chaque ingrédient à acheter, dans l'ordre de la recette.
  - name : nom court tel qu'on l'écrit sur une liste de courses, en français, avec une majuscule, sans la préparation
    (« 2 oignons émincés » → « Oignons » ; « 200 g de comté râpé » → « Comté »). Garde ce qui change le produit acheté
    (« Lait de coco », « Farine T65 », « Tomates pelées »).
  - quantity : nombre (décimal avec un point) pour la quantité totale de la recette, ou null si non précisée.
  - unit : « g », « kg », « ml », « cl », « l » quand c'est un poids ou un volume ; sinon l'unité telle qu'écrite au singulier
    ou pluriel naturel (« gousses », « c. à s. », « c. à c. », « pincée », « bouquet », « boîte ») ; null pour un simple nombre d'unités.
Ignore l'eau du robinet. Si un ingrédient apparaît plusieurs fois, additionne. Si l'image contient plusieurs recettes, prends la principale.
Si l'image n'est pas une recette, renvoie une liste d'ingrédients vide.`;

const SCHEMA = {
  name: 'recette',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'servings', 'ingredients'],
    properties: {
      title: { type: 'string' },
      servings: { type: ['integer', 'null'] },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'quantity', 'unit'],
          properties: {
            name: { type: 'string' },
            quantity: { type: ['number', 'null'] },
            unit: { type: ['string', 'null'] },
          },
        },
      },
    },
  },
} as const;

type Fetch = typeof fetch;
let cachedModel: { key: string; model: string } | null = null;

/** Choisit un modèle disponible sur le compte (liste des modèles : gratuit). */
export async function pickModel(key: string, f: Fetch = fetch, signal?: AbortSignal): Promise<string> {
  if (cachedModel?.key === key) return cachedModel.model;
  const res = await call(() => f(`${API}/models`, { headers: { Authorization: `Bearer ${key}` }, signal }));
  const body = (await res.json()) as { data?: { id: string }[] };
  const ids = new Set((body.data ?? []).map((m) => m.id));
  const model = PREFERRED_MODELS.find((m) => ids.has(m));
  if (!model) throw new RecipeError('server', 'Aucun modèle de vision connu n’est disponible sur ce compte OpenAI.');
  cachedModel = { key, model };
  return model;
}

/** Ce qu'on fait lire : une photo (data URL) ou le texte d'une page de recette. */
export type RecipeInput = { image: string } | { text: string };

export function buildRequest(model: string, input: RecipeInput, withReasoning = true) {
  const user =
    'image' in input
      ? [
          { type: 'text', text: 'Voici la recette.' },
          { type: 'image_url', image_url: { url: input.image, detail: 'high' } },
        ]
      : `Voici le texte d'une page de recette :

${input.text}`;
  return {
    model,
    ...(withReasoning && model.startsWith('gpt-5') ? { reasoning_effort: 'minimal' } : {}),
    max_completion_tokens: 4000,
    response_format: { type: 'json_schema', json_schema: SCHEMA },
    messages: [
      { role: 'system', content: PROMPT },
      { role: 'user', content: user },
    ],
  };
}

/** Envoie l'image (data URL) ou le texte, et renvoie la recette lue. */
export async function readRecipe(key: string, input: string | RecipeInput, opts: { fetch?: Fetch; signal?: AbortSignal } = {}): Promise<Recipe> {
  const f = opts.fetch ?? fetch;
  const k = key.trim();
  const what: RecipeInput = typeof input === 'string' ? { image: input } : input;
  const model = await pickModel(k, f, opts.signal);
  const post = (withReasoning: boolean) =>
    f(`${API}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequest(model, what, withReasoning)),
      signal: opts.signal,
    });

  let res: Response;
  try {
    res = await call(() => post(true));
  } catch (e) {
    // Certains modèles refusent le réglage de raisonnement : on réessaie sans.
    if (e instanceof RecipeError && e.kind === 'server' && /reasoning/i.test(e.message)) res = await call(() => post(false));
    else throw e;
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
  };
  const msg = body.choices?.[0]?.message;
  if (!msg?.content) throw new RecipeError('empty', msg?.refusal ? `OpenAI a refusé : ${msg.refusal}` : 'OpenAI n’a rien renvoyé.');
  return normalizeRecipe(JSON.parse(msg.content) as Recipe);
}

export function normalizeRecipe(r: Recipe): Recipe {
  const ingredients = (r.ingredients ?? [])
    .map((i) => ({
      name: (i.name ?? '').trim(),
      quantity: typeof i.quantity === 'number' && i.quantity > 0 ? i.quantity : null,
      unit: i.unit?.trim() || null,
    }))
    .filter((i) => i.name);
  if (!ingredients.length) throw new RecipeError('empty', 'Aucun ingrédient trouvé sur cette image. Essaie une photo plus nette, bien cadrée sur la liste des ingrédients.');
  const servings = typeof r.servings === 'number' && r.servings > 0 ? Math.round(r.servings) : null;
  return { title: r.title?.trim() || 'Recette', servings, ingredients };
}

/** Exécute une requête et traduit les erreurs HTTP en messages lisibles. */
async function call(doFetch: () => Promise<Response>): Promise<Response> {
  let res: Response;
  try {
    res = await doFetch();
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new RecipeError('aborted', 'Annulé.');
    throw new RecipeError('network', 'Pas de connexion : la lecture des recettes a besoin d’internet.');
  }
  if (res.ok) return res;
  let detail = '';
  let code = '';
  try {
    const b = (await res.json()) as { error?: { message?: string; code?: string } };
    detail = b.error?.message ?? '';
    code = b.error?.code ?? '';
  } catch {
    /* corps illisible */
  }
  if (res.status === 401) throw new RecipeError('key', 'Clé OpenAI refusée : vérifie-la dans les Réglages.');
  if (res.status === 429)
    throw new RecipeError(
      'quota',
      code === 'insufficient_quota'
        ? 'Crédit OpenAI épuisé : recharge ton compte sur platform.openai.com (Billing).'
        : 'OpenAI limite les requêtes : réessaie dans une minute.',
    );
  throw new RecipeError('server', `OpenAI a répondu ${res.status}${detail ? ` : ${detail}` : ''}`);
}
