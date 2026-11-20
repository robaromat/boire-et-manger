import { signal } from '@preact/signals';
import { Icon, type IconName } from '../../components/Icon';
import { usePhoto, type PhotoSize } from '../../photos/photos';
import { avgRating, distance, fmtDistance } from '../../souvenirs/ops';
import { myPosition } from '../../souvenirs/osm';
import { TYPE_LABELS, type Place, type PlaceType } from '../../souvenirs/types';
import { Stars, shortDate } from '../recettes/bits';

// Petits morceaux communs aux écrans des souvenirs.

export const TYPE_ICONS: Record<PlaceType, IconName> = { resto: 'fork', bar: 'glass', cafe: 'cup', cave: 'bottle', boul: 'bread', marche: 'cart', autre: 'pin' };
export const placeIcon = (p: Pick<Place, 'type' | 'todo'>): IconName => (p.todo ? 'bookmark' : TYPE_ICONS[p.type]);
export const subLabel = (p: Pick<Place, 'type' | 'sub'>) => p.sub || TYPE_LABELS[p.type];

/** Ta position, connue après « me placer », « autour de moi » ou le tri par distance (gardée pendant la session). */
export const here = signal<{ lat: number; lon: number } | null>(null);
export async function locate(): Promise<{ lat: number; lon: number }> {
  const p = await myPosition();
  here.value = p;
  return p;
}
export function distanceTo(p: { lat: number | null; lon: number | null }): number | null {
  const h = here.value;
  return h && p.lat != null && p.lon != null ? distance(h, { lat: p.lat, lon: p.lon }) : null;
}

/** Photo de la dernière visite, ou pastille du type de lieu. */
export function PlaceTile({ p, size = 'thumb' }: { p: Place; size?: PhotoSize }) {
  const photo = p.visits.find((v) => v.photos.length)?.photos[0];
  const url = usePhoto(photo, size);
  return (
    <span class={`ptile t-${p.type}${p.todo ? ' todo' : ''}`}>
      {url ? <img src={url} alt="" loading="lazy" /> : <Icon name={placeIcon(p)} />}
    </span>
  );
}

export function PlaceRow({ p, current, onOpen }: { p: Place; current?: boolean; onOpen: () => void }) {
  const avg = avgRating(p);
  const d = distanceTo(p);
  return (
    <button class="prow" onClick={onOpen} aria-current={current ? 'true' : undefined}>
      <PlaceTile p={p} />
      <span class="t">
        <b>{p.name}</b>
        <span class="meta">
          {[subLabel(p), p.city, d != null ? fmtDistance(d) : ''].filter(Boolean).join(' · ')}
        </span>
        <span>
          {p.todo ? (
            <>
              <span class="rtag todo">à essayer</span> {p.why && <span class="meta">{p.why}</span>}
            </>
          ) : p.visits.length ? (
            <>
              {avg != null && <Stars n={avg} />}{' '}
              <span class="meta">
                {p.visits.length} visite{p.visits.length > 1 ? 's' : ''} · {shortDate(p.visits[0]!.date)}
              </span>
            </>
          ) : (
            <span class="meta">pas encore de visite notée</span>
          )}
        </span>
      </span>
    </button>
  );
}

/** Une photo de visite (vignette ou grande). */
export function Shot({ id, size = 'thumb', onOpen }: { id: string; size?: PhotoSize; onOpen?: () => void }) {
  const url = usePhoto(id, size);
  const img = url ? <img src={url} alt="" loading="lazy" /> : <span class="spinner small" aria-label="Chargement" />;
  return onOpen ? (
    <button class="shot" onClick={onOpen} aria-label="Agrandir la photo">
      {img}
    </button>
  ) : (
    <span class="shot">{img}</span>
  );
}
