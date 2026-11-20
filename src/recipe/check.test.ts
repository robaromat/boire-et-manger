import { describe, expect, it } from 'vitest';
import { checkRecipe, normalizeCheck } from './check';
import { normalizeAdvice, wineAdvice, wineDescription } from '../cave/advice';
import { emptyWineDraft } from '../cave/ops';
import type { Wine } from '../cave/types';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeOpenAI(reply: unknown, models = ['gpt-5-mini']) {
  const calls: any[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push(body);
    if (url.endsWith('/models')) return json(200, { data: models.map((id) => ({ id })) });
    return json(200, { choices: [{ message: { content: JSON.stringify(reply) } }] });
  }) as typeof fetch;
  return { f, calls };
}

describe('Challenger la recette', () => {
  it('envoie la recette en texte, avec un peu de réflexion, et range les alertes avant les doutes', async () => {
    const { f, calls } = fakeOpenAI({
      verdict: 'Deux points à vérifier',
      alerts: [
        { level: 'doute', topic: 'temps', problem: 'Marinade de 10 min, c’est court.', suggestion: '2 h' },
        { level: 'alerte', topic: 'quantite', problem: '500 g de sel pour 4.', suggestion: '5 g' },
      ],
    });
    const r = await checkRecipe('sk-test-check', 'Gratin\n- Sel : 500 g', { fetch: f });
    expect(r.alerts.map((a) => a.level)).toEqual(['alerte', 'doute']);
    expect(r.verdict).toBe('Deux points à vérifier');
    const req = calls[1];
    expect(req.reasoning_effort).toBe('low');
    expect(req.messages[1].content).toContain('500 g');
    expect(req.response_format.json_schema.name).toBe('verification');
  });

  it('complète une réponse incomplète', () => {
    expect(normalizeCheck({ alerts: [] })).toEqual({ verdict: 'Recette cohérente', alerts: [] });
    expect(normalizeCheck({ alerts: [{ level: 'zzz' as never, topic: 'yyy' as never, problem: ' Trop cuit ', suggestion: '' }] }).alerts[0]).toEqual({
      level: 'doute',
      topic: 'autre',
      problem: 'Trop cuit',
      suggestion: '',
    });
  });
});

describe('Donne-moi des infos (vin)', () => {
  const wine: Wine = {
    ...emptyWineDraft(),
    id: 'w_1',
    domaine: 'Château La Conseillante',
    vintage: 2016,
    color: 'rouge',
    appellation: 'Pomerol',
    region: 'Bordeaux',
    grapes: 'Merlot, cabernet franc',
    from: 2026,
    to: 2040,
    stock: [],
    history: [],
    createdAt: '',
    updatedAt: '',
  };

  it('décrit le vin et lit les conseils', async () => {
    expect(wineDescription(wine)).toContain('Millésime : 2016');
    expect(wineDescription(wine)).toContain('Fenêtre de dégustation notée : 2026–2040');
    const { f, calls } = fakeOpenAI({
      decant: 'oui',
      decant_detail: '1 h en carafe.',
      temperature: '16–17 °C',
      temperature_tip: 'Sortir de la cave 30 min avant.',
      glass: 'Verre à bordeaux',
      timing: 'Juste à son début d’apogée.',
      about: 'Grand Pomerol.',
      tips: ['', 'Bouchon long'],
    });
    const s = await wineAdvice('sk-test-advice', wine, { fetch: f, year: 2026 });
    expect(s).toMatchObject({ decant: 'oui', temperature: '16–17 °C', tips: ['Bouchon long'] });
    expect(calls[1].messages[0].content).toContain('nous sommes en 2026');
  });

  it('carafe inconnue : « facultatif »', () => {
    expect(normalizeAdvice({ decant: 'peut-être' }, 'x').decant).toBe('facultatif');
  });
});
