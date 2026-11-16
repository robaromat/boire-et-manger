// Appels à l'API OpenAI, faits directement depuis le navigateur avec la clé saisie dans les Réglages.
// L'étape 4 y ajoutera la lecture des recettes en photo ; ici, seulement la vérification de la clé.

const API = 'https://api.openai.com/v1';

export type KeyTest = { ok: true } | { ok: false; message: string };

/** Vérifie la clé en listant les modèles (gratuit, ne consomme pas de crédit). */
export async function testOpenAIKey(key: string): Promise<KeyTest> {
  let res: Response;
  try {
    res = await fetch(`${API}/models`, { headers: { Authorization: `Bearer ${key.trim()}` }, cache: 'no-store' });
  } catch {
    return { ok: false, message: "Pas de connexion à OpenAI." };
  }
  if (res.ok) return { ok: true };
  if (res.status === 401) return { ok: false, message: 'Clé refusée par OpenAI : elle a peut-être été révoquée ou mal copiée.' };
  if (res.status === 429) return { ok: false, message: 'OpenAI limite les requêtes ou le crédit est épuisé.' };
  return { ok: false, message: `OpenAI a répondu ${res.status}.` };
}
