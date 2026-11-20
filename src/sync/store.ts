import { signal } from '@preact/signals';
import { createSyncEngine, type PersistedState, type SyncEngine } from './engine';
import { COURSES_FILE, GitHubError, countItems, readDataFile, readJsonFile, writeDataFile, writeJsonFile } from './github';
import { idbClear, idbGet, idbSet } from './idb';
import { mergeData } from './merge';
import { repoRef, settings } from '../settings/settings';
import type { DataFile } from '../model/types';
import { mergeRecipes } from '../recettes/merge';
import { RECIPES_FILE, emptyRecipesFile, parseRecipesFile, type RecipesFile } from '../recettes/types';
import { flushPhotos } from '../photos/photos';
import { mergeCave } from '../cave/merge';
import { CAVE_FILE, emptyCaveFile, parseCaveFile, type CaveFile } from '../cave/types';

// Les instances de synchro de l'app (une par carnet, un fichier chacun), branchées sur les réglages de l'appareil
// et sur IndexedDB.

const STATE_KEY = 'sync-state';

export const engine = signal<SyncEngine<DataFile> | null>(null);
export const recipesEngine = signal<SyncEngine<RecipesFile> | null>(null);
export const caveEngine = signal<SyncEngine<CaveFile> | null>(null);

const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

/** (Re)démarre la synchro avec les réglages actuels (au lancement, ou après changement de jeton/dépôt). */
export function startSync(): Promise<void> {
  const ref = repoRef(settings.value);
  const key = `${STATE_KEY}:${ref.owner}/${ref.repo}/${COURSES_FILE}`;
  const e = createSyncEngine<DataFile>({
    read: () => readDataFile(repoRef()),
    write: (d, sha, msg) => writeDataFile(repoRef(), d, sha, msg),
    load: () => loadState(key, ref.owner),
    save: (s) => idbSet(key, s),
    merge: mergeData,
    message: (d) => `Courses depuis l'app (${plural(countItems(d), 'article')})`,
  });
  engine.value = e;

  const rkey = `${STATE_KEY}:${ref.owner}/${ref.repo}/${RECIPES_FILE}`;
  const r = createSyncEngine<RecipesFile>({
    // Pas encore de recettes.json : le carnet part vide, le fichier est créé au premier enregistrement.
    read: () =>
      readJsonFile(repoRef(), RECIPES_FILE, parseRecipesFile).catch((err: unknown) => {
        if (err instanceof GitHubError && err.kind === 'not_found') return { data: emptyRecipesFile(), sha: '' };
        throw err;
      }),
    write: (d, sha, msg) => writeJsonFile(repoRef(), RECIPES_FILE, d, sha || null, msg),
    load: () => idbGet<PersistedState<RecipesFile>>(rkey),
    save: (s) => idbSet(rkey, s),
    merge: mergeRecipes,
    message: (d) => `Recettes depuis l'app (${plural(d.recipes.length, 'recette')})`,
  });
  recipesEngine.value = r;

  const ckey = `${STATE_KEY}:${ref.owner}/${ref.repo}/${CAVE_FILE}`;
  const c = createSyncEngine<CaveFile>({
    read: () =>
      readJsonFile(repoRef(), CAVE_FILE, parseCaveFile).catch((err: unknown) => {
        if (err instanceof GitHubError && err.kind === 'not_found') return { data: emptyCaveFile(), sha: '' };
        throw err;
      }),
    write: (d, sha, msg) => writeJsonFile(repoRef(), CAVE_FILE, d, sha || null, msg),
    load: () => idbGet<PersistedState<CaveFile>>(ckey),
    save: (s) => idbSet(ckey, s),
    merge: mergeCave,
    message: (d) => `Cave depuis l'app (${plural(d.wines.length, 'vin')})`,
  });
  caveEngine.value = c;
  return Promise.all([e.init(), r.init(), c.init()]).then(() => undefined);
}

/**
 * Cache local. Au premier lancement de Boire & Manger, reprend les modifications pas encore envoyées
 * par l'ancienne app « Courses » (dépôt courses-data, fichier data.json) : elles seront fusionnées avec
 * courses.json au premier envoi. Sans modification en attente, on repart simplement de GitHub.
 */
async function loadState(key: string, owner: string): Promise<PersistedState<DataFile> | undefined> {
  const s = await idbGet<PersistedState<DataFile>>(key);
  if (s) return s;
  const legacy = await idbGet<PersistedState<DataFile>>(`${STATE_KEY}:${owner}/courses-data`);
  if (legacy?.dirty && legacy.local) return { local: legacy.local, base: null, dirty: true, lastSyncAt: legacy.lastSyncAt };
  return undefined;
}

/** Raccourci pour les écrans : modifier les données. */
export function mutate(fn: (d: DataFile) => DataFile): void {
  engine.value?.mutate(fn);
}

/** Pareil pour le carnet de recettes. */
export function mutateRecipes(fn: (d: RecipesFile) => RecipesFile): void {
  recipesEngine.value?.mutate(fn);
}

/** Pareil pour la cave. */
export function mutateCave(fn: (d: CaveFile) => CaveFile): void {
  caveEngine.value?.mutate(fn);
}

/** Oublie le cache local (déconnexion de l'appareil). */
export async function resetLocal(): Promise<void> {
  engine.value = null;
  recipesEngine.value = null;
  caveEngine.value = null;
  await idbClear();
}

let listening = false;
let lastFocusSync = 0;

/** Resynchronise au retour du réseau, au retour sur l'app, et réessaie régulièrement s'il reste des modifs. */
export function installSyncTriggers(): void {
  if (listening) return;
  listening = true;
  const all = () => [engine.value, recipesEngine.value, caveEngine.value].filter((x) => x !== null);
  window.addEventListener('online', () => all().forEach((x) => void x.sync()));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastFocusSync < 20_000) return;
    lastFocusSync = now;
    all().forEach((x) => void x.sync());
  });
  setInterval(() => {
    for (const x of all()) if (x.hasPendingChanges && navigator.onLine) void x.sync();
    void flushPhotos();
  }, 60_000);
}
