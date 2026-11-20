import { showSnack } from '../components/Snack';
import { addEntries, type Entry } from '../model/lists';
import { savePhoto } from '../photos/photos';
import { engine, mutate, mutateRecipes } from '../sync/store';
import { addRecipe, type RecipeDraft } from './ops';

// Actions qui touchent plusieurs magasins (photos, carnet, courses), partagées par les écrans.

const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

/** Range une recette dans le carnet ; les photos (source, plat) sont enregistrées d'abord. Renvoie son id. */
export async function saveNewRecipe(draft: RecipeDraft, files: { sourceFile?: File | null; coverFile?: File | null } = {}): Promise<string> {
  const d = { ...draft, source: { ...draft.source } };
  if (files.sourceFile) d.source.photo = await savePhoto(files.sourceFile);
  if (files.coverFile) d.cover = await savePhoto(files.coverFile);
  let id = '';
  mutateRecipes((cur) => {
    const r = addRecipe(cur, d);
    id = r.id;
    return r.data;
  });
  return id;
}

/** Ajoute des ingrédients à une liste de courses (« pour : titre »), avec Annuler. Renvoie les ids des articles. */
export function sendToCourses(destId: string, entries: Entry[], title: string, rid: string): string[] {
  const before = engine.value?.data.value;
  const dest = before?.lists.find((l) => l.id === destId);
  let ids: string[] = [];
  mutate((cur) => {
    const r = addEntries(
      cur,
      destId,
      entries.map((e) => ({ ...e, pour: { rid, title } })),
    );
    ids = r.ids;
    return r.data;
  });
  if (before)
    showSnack(`${plural(entries.length, 'article')} de « ${title} » ${entries.length > 1 ? 'ajoutés' : 'ajouté'} à ${dest?.name ?? ''}`, () =>
      mutate(() => before),
    );
  return ids;
}

/** Liste de courses proposée par défaut : la dernière ouverte dans Courses. */
export function defaultListId(): string | null {
  const lists = engine.value?.data.value?.lists ?? [];
  let last: string | null = null;
  try {
    last = localStorage.getItem('courses.lastList');
  } catch {
    /* rien */
  }
  return lists.find((l) => l.id === last)?.id ?? lists[0]?.id ?? null;
}
