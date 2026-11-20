import { askJson } from '../recipe/read';
import { COLOR_LABELS, type Wine, type WineService } from './types';

// « Donne-moi des infos » sur un vin : conseils de service par ChatGPT (carafe, température, verre, quand le boire,
// un mot sur le domaine et l'appellation). Gardés dans la fiche, marqués « estimation ».

const PROMPT = (year: number) => `Tu es sommelier. On te donne un vin d'une cave personnelle. Donne des conseils de service
concrets et courts, en français, pour CE vin et CE millésime (nous sommes en ${year}) :
- decant : « oui », « non » ou « facultatif » ; decant_detail : combien de temps et pourquoi, en une phrase
  (ex. « 1 h en carafe pour l'aérer », « juste l'ouvrir 30 min avant », « carafer délicatement pour le dépôt ») ;
- temperature : la température de service en °C (ex. « 16–17 °C ») ; temperature_tip : comment y arriver en une phrase
  (ex. « sortir de la cave 30 min avant », « 20 min au réfrigérateur ») ;
- glass : le type de verre (ex. « verre à bourgogne, large »);
- timing : où en est ce vin aujourd'hui en une phrase (« à son apogée », « encore fermé, attendre 2–3 ans »…) ;
- about : 2 phrases sur le domaine et l'appellation, utiles à table ; rien d'inventé : si tu ne connais pas le domaine,
  parle seulement de l'appellation et du cépage ;
- tips : 0 à 3 conseils pratiques en plus (bouchon fragile, servir à l'apéritif…), courts.`;

const SCHEMA = {
  name: 'service',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['decant', 'decant_detail', 'temperature', 'temperature_tip', 'glass', 'timing', 'about', 'tips'],
    properties: {
      decant: { type: 'string', enum: ['oui', 'non', 'facultatif'] },
      decant_detail: { type: 'string' },
      temperature: { type: 'string' },
      temperature_tip: { type: 'string' },
      glass: { type: 'string' },
      timing: { type: 'string' },
      about: { type: 'string' },
      tips: { type: 'array', items: { type: 'string' } },
    },
  },
} as const;

type Raw = { decant: string; decant_detail: string; temperature: string; temperature_tip: string; glass: string; timing: string; about: string; tips: string[] };

export function wineDescription(w: Pick<Wine, 'domaine' | 'cuvee' | 'vintage' | 'color' | 'appellation' | 'region' | 'country' | 'grapes' | 'size' | 'from' | 'to'>): string {
  return [
    `Domaine : ${w.domaine || 'inconnu'}`,
    w.cuvee && `Cuvée : ${w.cuvee}`,
    `Millésime : ${w.vintage ?? 'non millésimé'}`,
    `Couleur : ${COLOR_LABELS[w.color]}`,
    w.appellation && `Appellation : ${w.appellation}`,
    (w.region || w.country) && `Région : ${[w.region, w.country].filter(Boolean).join(', ')}`,
    w.grapes && `Cépages : ${w.grapes}`,
    w.size && `Format : ${w.size}`,
    (w.from || w.to) && `Fenêtre de dégustation notée : ${w.from ?? '?'}–${w.to ?? '?'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildAdviceRequest(model: string, description: string, year: number, withReasoning = true) {
  return {
    model,
    ...(withReasoning && model.startsWith('gpt-5') ? { reasoning_effort: 'minimal' } : {}),
    max_completion_tokens: 3000,
    response_format: { type: 'json_schema', json_schema: SCHEMA },
    messages: [
      { role: 'system', content: PROMPT(year) },
      { role: 'user', content: description },
    ],
  };
}

export function normalizeAdvice(r: Partial<Raw>, at = new Date().toISOString()): WineService {
  const s = (x: unknown) => String(x ?? '').trim();
  return {
    decant: r.decant === 'oui' || r.decant === 'non' ? r.decant : 'facultatif',
    decantDetail: s(r.decant_detail),
    temperature: s(r.temperature),
    temperatureTip: s(r.temperature_tip),
    glass: s(r.glass),
    timing: s(r.timing),
    about: s(r.about),
    tips: (r.tips ?? []).map(s).filter(Boolean).slice(0, 3),
    at,
  };
}

export async function wineAdvice(key: string, w: Wine, opts: { fetch?: typeof fetch; signal?: AbortSignal; year?: number } = {}): Promise<WineService> {
  const year = opts.year ?? new Date().getFullYear();
  const r = await askJson<Raw>(key, (model, wr) => buildAdviceRequest(model, wineDescription(w), year, wr), opts);
  return normalizeAdvice(r);
}
