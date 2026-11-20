import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { newId } from '../lib/ids';
import { repoRef } from '../settings/settings';
import { GitHubError, getBinary, putBinary } from '../sync/github';
import { idbGet, idbSet } from '../sync/idb';

// Magasin de photos (recettes, puis cave et souvenirs) : chaque photo est réduite sur le téléphone en deux tailles,
//   photos/<id>.jpg    grande (~250 Ko), pour l'afficher en plein écran
//   photos/<id>.t.jpg  vignette (~30 Ko), pour les listes
// gardées dans IndexedDB (affichage immédiat, hors connexion) puis envoyées dans le dépôt privé en arrière-plan.
// Une photo prise hors connexion attend dans la file d'envoi ; un autre appareil la télécharge à la première vue.

export type PhotoSize = 'full' | 'thumb';

const QUEUE_KEY = 'photos:queue';
const FULL = { side: 1600, quality: 0.8 };
const THUMB = { side: 420, quality: 0.72 };

export const photoPath = (id: string, size: PhotoSize) => `photos/${id}${size === 'thumb' ? '.t' : ''}.jpg`;
const cacheKey = (id: string, size: PhotoSize) => `photo:${photoPath(id, size)}`;

/** Nombre de photos pas encore envoyées sur GitHub. */
export const photosPending = signal(0);

async function resize(file: Blob, { side, quality }: { side: number; quality: number }): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, side / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Photo illisible.'))), 'image/jpeg', quality));
}

const urls = new Map<string, string>();
function urlFor(key: string, blob: Blob): string {
  let u = urls.get(key);
  if (!u) {
    u = URL.createObjectURL(blob);
    urls.set(key, u);
  }
  return u;
}

/** Enregistre une photo (réduite) dans le téléphone et la met en file d'envoi. Renvoie son identifiant. */
export async function savePhoto(file: Blob): Promise<string> {
  const id = newId('p');
  const [full, thumb] = await Promise.all([resize(file, FULL), resize(file, THUMB)]);
  await idbSet(cacheKey(id, 'full'), full);
  await idbSet(cacheKey(id, 'thumb'), thumb);
  const queue = (await idbGet<string[]>(QUEUE_KEY)) ?? [];
  await idbSet(QUEUE_KEY, [...queue, id]);
  photosPending.value = queue.length + 1;
  void flushPhotos();
  return id;
}

const toBase64 = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error('lecture'));
    r.readAsDataURL(b);
  });

let flushing: Promise<void> | null = null;

/** Envoie les photos en attente, une par une. Sans réseau, elles attendent le prochain essai. */
export function flushPhotos(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      for (;;) {
        const queue = (await idbGet<string[]>(QUEUE_KEY)) ?? [];
        photosPending.value = queue.length;
        const id = queue[0];
        if (!id || !navigator.onLine) return;
        for (const size of ['thumb', 'full'] as const) {
          const blob = await idbGet<Blob>(cacheKey(id, size));
          if (blob) await putBinary(repoRef(), photoPath(id, size), await toBase64(blob), `Photo ${id}`);
        }
        const now = (await idbGet<string[]>(QUEUE_KEY)) ?? [];
        await idbSet(
          QUEUE_KEY,
          now.filter((x) => x !== id),
        );
      }
    } catch {
      // Réseau ou GitHub indisponible : nouvel essai plus tard (retour du réseau, retour sur l'app, minuterie).
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

const loading = new Map<string, Promise<string | null>>();

/** Adresse affichable d'une photo : depuis le téléphone, sinon téléchargée du dépôt (puis gardée). */
export function loadPhoto(id: string, size: PhotoSize): Promise<string | null> {
  const key = cacheKey(id, size);
  const known = urls.get(key);
  if (known) return Promise.resolve(known);
  let p = loading.get(key);
  if (!p) {
    p = (async () => {
      const local = await idbGet<Blob>(key);
      if (local) return urlFor(key, local);
      try {
        const blob = await getBinary(repoRef(), photoPath(id, size));
        await idbSet(key, blob);
        return urlFor(key, blob);
      } catch (e) {
        // Grande photo absente (envoi interrompu) : on se rabat sur la vignette.
        if (size === 'full' && e instanceof GitHubError && e.kind === 'not_found') return loadPhoto(id, 'thumb');
        return null;
      } finally {
        loading.delete(key);
      }
    })();
    loading.set(key, p);
  }
  return p;
}

export function usePhoto(id: string | undefined | null, size: PhotoSize = 'thumb'): string | null {
  const [url, setUrl] = useState<string | null>(() => (id ? urls.get(cacheKey(id, size)) ?? null : null));
  useEffect(() => {
    if (!id) return setUrl(null);
    let alive = true;
    void loadPhoto(id, size).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id, size]);
  return url;
}

let installed = false;
export function installPhotoTriggers(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('online', () => void flushPhotos());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void flushPhotos());
  setInterval(() => photosPending.value > 0 && void flushPhotos(), 60_000);
  void flushPhotos();
}
