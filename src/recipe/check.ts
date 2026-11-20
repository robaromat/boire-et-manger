import { askJson } from './read';

// « Challenger la recette » : ChatGPT relit une recette comme un chef méfiant et signale ce qui cloche (quantités
// incohérentes, temps ou température de cuisson déconnants, portions improbables, ingrédient oublié dans les étapes…).
// Il ne corrige rien lui-même : il alerte, et c'est toi qui modifies la fiche si tu es d'accord.

export type CheckLevel = 'alerte' | 'doute';
export type CheckTopic = 'quantite' | 'cuisson' | 'temps' | 'portions' | 'ingredient' | 'autre';

export interface CheckAlert {
  level: CheckLevel;
  topic: CheckTopic;
  /** Ce qui cloche, en une phrase. */
  problem: string;
  /** Ce qui serait plus plausible. */
  suggestion: string;
}

export interface CheckResult {
  /** « Recette cohérente », « Deux points à vérifier »… */
  verdict: string;
  alerts: CheckAlert[];
}

const PROMPT = `Tu es un chef cuisinier expérimenté et méfiant. On te donne une recette lue automatiquement (photo, page web)
ou saisie à la main ; elle peut contenir des erreurs de lecture ou de l'auteur. Relis-la et signale UNIQUEMENT ce qui est
vraiment incohérent ou douteux :
- quantités : disproportionnées entre elles ou pour le nombre de portions (ex. 500 g de sel, 2 kg de pâtes pour 2,
  10 œufs pour une crème pour 4, unité probablement fausse : « 200 kg », « 3 l de farine ») ;
- cuisson : température ou durée déconnante pour le plat (ex. gâteau 10 min à 250 °C, rôti de 2 kg en 15 min,
  riz cuit 2 h, four à 400 °C) ;
- temps : repos, marinade, levée manifestement trop courts ou trop longs ;
- portions : nombre de portions incompatible avec les quantités ;
- ingrédient : utilisé dans les étapes mais absent de la liste, ou listé et jamais utilisé, s'il est important.
Pour chaque point : level « alerte » si c'est presque sûrement une erreur, « doute » si c'est inhabituel mais possible ;
problem en une phrase courte ; suggestion : la valeur ou la correction plausible, courte.
N'invente pas de problème : une recette correcte renvoie une liste vide. Pas de conseils de goût ni de variantes.
verdict : 3 à 6 mots qui résument (« Recette cohérente », « Une quantité suspecte », « Cuisson à vérifier »).
Réponds en français.`;

const SCHEMA = {
  name: 'verification',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['verdict', 'alerts'],
    properties: {
      verdict: { type: 'string' },
      alerts: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['level', 'topic', 'problem', 'suggestion'],
          properties: {
            level: { type: 'string', enum: ['alerte', 'doute'] },
            topic: { type: 'string', enum: ['quantite', 'cuisson', 'temps', 'portions', 'ingredient', 'autre'] },
            problem: { type: 'string' },
            suggestion: { type: 'string' },
          },
        },
      },
    },
  },
} as const;

export function buildCheckRequest(model: string, recipeText: string, withReasoning = true) {
  return {
    model,
    // Un peu de réflexion : il faut comparer des quantités et des temps, pas seulement lire.
    ...(withReasoning && model.startsWith('gpt-5') ? { reasoning_effort: 'low' } : {}),
    max_completion_tokens: 6000,
    response_format: { type: 'json_schema', json_schema: SCHEMA },
    messages: [
      { role: 'system', content: PROMPT },
      { role: 'user', content: `Voici la recette :\n\n${recipeText}` },
    ],
  };
}

export async function checkRecipe(key: string, recipeText: string, opts: { fetch?: typeof fetch; signal?: AbortSignal } = {}): Promise<CheckResult> {
  const r = await askJson<CheckResult>(key, (model, wr) => buildCheckRequest(model, recipeText, wr), opts);
  return normalizeCheck(r);
}

const TOPICS: readonly CheckTopic[] = ['quantite', 'cuisson', 'temps', 'portions', 'ingredient', 'autre'];

export function normalizeCheck(r: Partial<CheckResult>): CheckResult {
  const alerts = (r.alerts ?? [])
    .map((a) => ({
      level: (a.level === 'alerte' ? 'alerte' : 'doute') as CheckLevel,
      topic: (TOPICS.includes(a.topic) ? a.topic : 'autre') as CheckTopic,
      problem: String(a.problem ?? '').trim(),
      suggestion: String(a.suggestion ?? '').trim(),
    }))
    .filter((a) => a.problem)
    // Les alertes avant les doutes
    .sort((a, b) => (a.level === b.level ? 0 : a.level === 'alerte' ? -1 : 1));
  const verdict = String(r.verdict ?? '').trim() || (alerts.length ? 'Points à vérifier' : 'Recette cohérente');
  return { verdict, alerts };
}
