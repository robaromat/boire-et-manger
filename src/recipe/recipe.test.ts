import { describe, expect, it } from 'vitest';
import { RecipeError, buildRequest, readRecipe, type Recipe } from './read';
import { linesToEntries, reviewLines, scaleAmount } from './review';
import { data, hist, item, list } from '../sync/fixtures';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Faux OpenAI : liste de modèles + réponse de lecture. */
function fakeOpenAI(opts: { models?: string[]; reply?: (body: any) => Response }) {
  const calls: { url: string; body?: any }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    if (url.endsWith('/models')) return json(200, { data: (opts.models ?? ['gpt-4.1-mini']).map((id) => ({ id })) });
    return opts.reply!(body);
  }) as typeof fetch;
  return { f, calls };
}

const RECIPE: Recipe = {
  title: 'Curry de pois chiches',
  servings: 4,
  ingredients: [
    { name: 'Pois chiches', quantity: 800, unit: 'g' },
    { name: 'Lait de coco', quantity: 40, unit: 'cl' },
    { name: 'Oignons', quantity: 2, unit: null },
    { name: 'Ail', quantity: 3, unit: 'gousses' },
    { name: 'Sel', quantity: null, unit: 'selon le goût' },
  ],
};
const ok = (r: unknown) => () => json(200, { choices: [{ message: { content: JSON.stringify(r) } }] });

describe('lecture par OpenAI', () => {
  it('choisit le premier modèle disponible et demande une réponse JSON avec l’image', async () => {
    const { f, calls } = fakeOpenAI({ models: ['gpt-4o', 'gpt-5-mini', 'dall-e-3'], reply: ok(RECIPE) });
    const r = await readRecipe('sk-test-1', 'data:image/jpeg;base64,AAAA', { fetch: f });
    expect(r.title).toBe('Curry de pois chiches');
    expect(r.ingredients).toHaveLength(5);
    const req = calls[1]!.body;
    expect(req.model).toBe('gpt-5-mini');
    expect(req.reasoning_effort).toBe('minimal');
    expect(req.response_format.type).toBe('json_schema');
    expect(req.messages[1].content[1].image_url.url).toBe('data:image/jpeg;base64,AAAA');
  });

  it('pas de réglage de raisonnement pour les modèles qui ne le connaissent pas', () => {
    expect(buildRequest('gpt-4.1-mini', 'x')).not.toHaveProperty('reasoning_effort');
  });

  it('réessaie sans raisonnement si le modèle le refuse', async () => {
    let n = 0;
    const { f } = fakeOpenAI({
      models: ['gpt-5-mini'],
      reply: (b) => (n++ === 0 && b.reasoning_effort ? json(400, { error: { message: "Unsupported value: 'reasoning_effort'" } }) : ok(RECIPE)()),
    });
    expect((await readRecipe('sk-test-2', 'x', { fetch: f })).servings).toBe(4);
  });

  it.each([
    [401, {}, 'key'],
    [429, { error: { code: 'insufficient_quota' } }, 'quota'],
    [500, { error: { message: 'boom' } }, 'server'],
  ])('erreur HTTP %i → %s', async (status, body, kind) => {
    const { f } = fakeOpenAI({ models: ['gpt-4o-mini'], reply: () => json(status, body) });
    await expect(readRecipe(`sk-test-${status}`, 'x', { fetch: f })).rejects.toMatchObject({ kind });
  });

  it('image sans recette → message clair', async () => {
    const { f } = fakeOpenAI({ models: ['gpt-4o-mini'], reply: ok({ title: '', servings: null, ingredients: [] }) });
    const e = await readRecipe('sk-test-empty', 'x', { fetch: f }).catch((x) => x);
    expect(e).toBeInstanceOf(RecipeError);
    expect(e.kind).toBe('empty');
  });

  it('pas de réseau', async () => {
    const f = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    await expect(readRecipe('sk-test-net', 'x', { fetch: f })).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('revue', () => {
  it('arrondis achetables', () => {
    expect(scaleAmount(800, 'g', 6 / 4)).toBe(1200);
    expect(scaleAmount(15, 'g', 0.5)).toBe(8);
    expect(scaleAmount(70, 'ml', 0.5)).toBe(35);
    expect(scaleAmount(2, null, 0.5)).toBe(1);
    expect(scaleAmount(3, null, 1.5)).toBe(5);
    expect(scaleAmount(3, 'gousses', 0.5)).toBe(1.5);
  });

  it('portions, conversion cl → ml, fusion avec la liste, basiques repérés', () => {
    const d = data(
      [list('bio', [item('a', { name: 'Pois chiches', qty: [{ n: 500, u: 'g' }] })])],
      { sel: hist('Sel', { rayon: 'vrac', staple: true }) },
    );
    const lines = reviewLines(d, 'bio', RECIPE, 2);
    expect(lines[0]).toMatchObject({
      qty: [{ n: 400, u: 'g' }], rayon: 'vrac', existing: [{ n: 500, u: 'g' }], merged: [{ n: 900, u: 'g' }],
    });
    expect(lines[1]!.qty).toEqual([{ n: 200, u: 'ml' }]);
    expect(lines[2]!.qty).toEqual([{ n: 1, u: null }]);
    expect(lines[4]).toMatchObject({ name: 'Sel', qty: [], staple: true });
    expect(linesToEntries(lines, [true, false, true, false, false]).map((e) => e.name)).toEqual(['Pois chiches', 'Oignons']);
  });

  it('portions inconnues : quantités telles quelles', () => {
    const lines = reviewLines(data([list('bio')]), 'bio', { ...RECIPE, servings: null }, 3);
    expect(lines[0]!.qty).toEqual([{ n: 800, u: 'g' }]);
  });
});
