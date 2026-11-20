import { engine as coursesEngine } from '../sync/store';
import type { SyncView } from '../sync/engine';
import { relativeTime } from '../lib/time';
import { photosPending } from '../photos/photos';

const LABELS = {
  loading: 'Chargement…',
  ok: 'À jour',
  pending: 'En attente',
  syncing: 'Synchro…',
  offline: 'Hors ligne',
  error: 'Erreur de synchro',
} as const;

/** Indicateur discret de synchronisation d'un carnet ; un appui relance la synchro. */
export function SyncBadge({ engine, photos }: { engine?: SyncView | null; photos?: boolean }) {
  const e = engine === undefined ? coursesEngine.value : engine;
  if (!e) return null;
  let st = e.status.value;
  const last = e.lastSyncAt.value;
  const nPhotos = photos ? photosPending.value : 0;
  if (st === 'ok' && nPhotos) st = 'pending';
  const title = [
    e.error.value,
    last ? `Dernière synchro ${relativeTime(last)}` : null,
    e.hasPendingChanges ? 'Des modifications attendent d’être envoyées' : null,
    nPhotos ? `${nPhotos} photo${nPhotos > 1 ? 's' : ''} à envoyer` : null,
    'Appuyer pour synchroniser maintenant',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <button class={`sync s-${st}`} onClick={() => void e.sync()} title={title} aria-label={`${LABELS[st]}. ${title}`}>
      <span class="dot" aria-hidden="true" />
      {LABELS[st]}
    </button>
  );
}
