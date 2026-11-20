import { signal } from '@preact/signals';
import { Icon } from '../../components/Icon';
import { showSnack } from '../../components/Snack';
import { Topbar } from '../../components/Topbar';
import { OsmError } from '../../souvenirs/osm';
import { avgRating, bookMonths, fmtDistance, matchPlace } from '../../souvenirs/ops';
import { PLACE_TYPES, TYPE_PLURALS, type Place, type PlaceType, type SouvenirsFile } from '../../souvenirs/types';
import { souvenirsEngine } from '../../sync/store';
import { Stars, shortDate } from '../recettes/bits';
import { PlaceRow, PlaceTile, Shot, TYPE_ICONS, distanceTo, here, locate, subLabel } from './bits';
import { MapView, type MapApi } from './MapView';

// Accueil des souvenirs (maquette validée le 20/11/2026) : Carte (par défaut), Liste, Livre ; recherche et filtres.

type View = 'carte' | 'liste' | 'livre';
const VIEWS: [View, string][] = [
  ['carte', 'Carte'],
  ['liste', 'Liste'],
  ['livre', 'Livre'],
];

// Gardés pendant la session : ouvrir une fiche puis revenir retrouve la même vue.
const view = signal<View>('carte');
const query = signal('');
const status = signal<'tous' | 'visites' | 'essayer'>('tous');
const type = signal<PlaceType | null>(null);
const sort = signal<'recent' | 'note' | 'proche'>('recent');
const selected = signal<string | null>(null);
const mapApi: { current: MapApi | null } = { current: null };

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function Home({ data, openId, onOpen, onAdd }: { data: SouvenirsFile | null; openId?: string; onOpen: (id: string) => void; onAdd: () => void }) {
  const e = souvenirsEngine.value;
  const q = query.value.trim();
  const pass = (p: Place) =>
    (status.value === 'tous' || (status.value === 'essayer' ? p.todo : !p.todo)) && (!type.value || p.type === type.value) && matchPlace(p, q);
  const list = data ? data.places.filter(pass) : [];
  const used = data ? PLACE_TYPES.filter((t) => data.places.some((p) => p.type === t)) : [];

  const placeMe = async () => {
    try {
      const me = await locate();
      if (view.value === 'carte') mapApi.current?.flyTo(me.lat, me.lon, 16);
    } catch (err) {
      showSnack(err instanceof OsmError ? err.message : 'Position introuvable.');
    }
  };

  let body;
  if (!data) {
    body = e?.error.value ? (
      <div class="empty" role="alert">
        <b>Impossible de charger les souvenirs</b>
        {e.error.value}
      </div>
    ) : (
      <p class="empty">Chargement des souvenirs…</p>
    );
  } else if (!data.places.length) {
    body = (
      <div class="empty">
        <b>Pas encore de souvenir</b>
        Ajoute un resto, un bar ou une adresse gourmande : autour de toi, par son nom, ou depuis une photo.
        <div>
          <button class="btn primary" style="margin-top:14px" onClick={onAdd}>
            <Icon name="plus" />
            Premier lieu
          </button>
        </div>
      </div>
    );
  } else if (view.value === 'carte') {
    const sel = list.find((p) => p.id === selected.value);
    return (
      <div class="rec-home">
        <Topbar title="Souvenirs" engine={e} photos />
        {controls(used)}
        <div class="smapwrap">
          <MapView places={list} selected={selected.value} onSelect={(id) => (selected.value = id)} me={here.value} apiRef={mapApi} />
          <button class="mapbtn" onClick={() => void placeMe()} aria-label="Me placer sur la carte">
            <Icon name="locate" />
          </button>
          {sel && (
            <button class="spreview" onClick={() => onOpen(sel.id)}>
              <PlaceTile p={sel} />
              <span class="t">
                <b>{sel.name}</b>
                <span class="meta">{[subLabel(sel), distanceTo(sel) != null ? fmtDistance(distanceTo(sel)!) : ''].filter(Boolean).join(' · ')}</span>
                <span>
                  {sel.todo ? (
                    <span class="rtag todo">à essayer</span>
                  ) : (
                    <>
                      {avgRating(sel) != null && <Stars n={avgRating(sel)!} />}{' '}
                      <span class="meta">
                        {sel.visits.length} visite{sel.visits.length > 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                </span>
              </span>
              <Icon name="back" class="flip" />
            </button>
          )}
          {!list.length && <p class="spreview">Aucun lieu ne correspond.</p>}
        </div>
        <button class={`fab${sel ? ' up' : ''}`} onClick={onAdd}>
          <Icon name="plus" />
          Lieu
        </button>
      </div>
    );
  } else if (view.value === 'liste') {
    const dist = (p: Place) => distanceTo(p) ?? Infinity;
    const sorted = [...list].sort((a, b) =>
      sort.value === 'proche'
        ? dist(a) - dist(b)
        : sort.value === 'note'
          ? (avgRating(b) ?? -1) - (avgRating(a) ?? -1)
          : // Les lieux jamais visités (à essayer) après ceux qu'on a visités, du plus récemment ajouté au plus ancien.
            (b.visits[0]?.date ?? '').localeCompare(a.visits[0]?.date ?? '') || b.createdAt.localeCompare(a.createdAt),
    );
    body = (
      <>
        <div class="sec-h">
          <h2>
            {list.length} lieu{list.length > 1 ? 'x' : ''}
          </h2>
          <select
            aria-label="Trier"
            value={sort.value}
            onChange={(ev) => {
              sort.value = ev.currentTarget.value as typeof sort.value;
              if (sort.value === 'proche' && !here.value) void placeMe();
            }}
          >
            <option value="recent">Visite récente</option>
            <option value="note">Mieux notés</option>
            <option value="proche">Plus proches</option>
          </select>
        </div>
        {sorted.map((p) => (
          <PlaceRow key={p.id} p={p} current={p.id === openId} onOpen={() => onOpen(p.id)} />
        ))}
        {!list.length && <p class="hint">Aucun lieu ne correspond.</p>}
      </>
    );
  } else {
    const months = bookMonths(list);
    body = (
      <>
        {months.map((m) => {
          const [y, mo] = m.month.split('-');
          return (
            <div key={m.month}>
              <div class="bmonth">
                {MONTHS[+mo! - 1]!.replace(/^./, (c) => c.toUpperCase())} {y}
                <span>
                  {m.items.length} visite{m.items.length > 1 ? 's' : ''}
                </span>
              </div>
              {m.items.map(({ place, visit }) => {
                const shots = visit.photos.slice(0, 3);
                return (
                  <button key={visit.id} class="bpage" onClick={() => onOpen(place.id)}>
                    {shots.length > 0 ? (
                      <span class={`bshots n${shots.length}`}>
                        {shots.map((id, k) => (
                          <Shot key={id} id={id} size={k === 0 ? 'full' : 'thumb'} />
                        ))}
                      </span>
                    ) : (
                      <span class={`bshots n0 t-${place.type}`}>
                        <Icon name={TYPE_ICONS[place.type]} />
                      </span>
                    )}
                    <span class="bcap">
                      <b>{place.name}</b>
                      <span class="meta">
                        {shortDate(visit.date)}
                        {visit.with.length ? ` · avec ${visit.with.join(', ').replace(/, ([^,]*)$/, ' et $1')}` : ''} {visit.rating != null && <Stars n={visit.rating} />}
                      </span>
                      {visit.comment && <p>{visit.comment}</p>}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
        {!months.length && <p class="hint" style="padding-top:12px">{q ? 'Aucune visite ne correspond.' : 'Le livre se remplit avec les photos de tes visites.'}</p>}
      </>
    );
  }

  return (
    <div class="rec-home">
      <Topbar title="Souvenirs" engine={e} photos />
      {controls(used)}
      <div class="rec-scroll">{body}</div>
      {data && (
        <button class="fab" onClick={onAdd}>
          <Icon name="plus" />
          Lieu
        </button>
      )}
    </div>
  );
}

function controls(used: PlaceType[]) {
  return (
    <div class="scontrols">
      <div class="seg" role="group" aria-label="Vue">
        {VIEWS.map(([k, n]) => (
          <button
            key={k}
            aria-pressed={view.value === k}
            onClick={() => {
              view.value = k;
              selected.value = null;
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <div class="searchrow">
        <label class="search">
          <Icon name="search" />
          <input
            type="search"
            value={query.value}
            placeholder="Lieu, quartier, plat, tag…"
            aria-label="Chercher un lieu"
            enterKeyHint="search"
            onInput={(ev) => (query.value = ev.currentTarget.value)}
          />
          {query.value && (
            <button class="iconbtn" aria-label="Effacer la recherche" onClick={() => (query.value = '')}>
              <Icon name="close" />
            </button>
          )}
        </label>
      </div>
      <div class="pills" role="group" aria-label="Filtres">
        {(
          [
            ['tous', 'Tous'],
            ['visites', 'Visités'],
            ['essayer', 'À essayer'],
          ] as const
        ).map(([k, n]) => (
          <button key={k} class="pill-b" aria-pressed={status.value === k} onClick={() => (status.value = k)}>
            {n}
          </button>
        ))}
        {used.length > 1 && <span class="pill-sep" aria-hidden="true" />}
        {used.length > 1 &&
          used.map((t) => (
            <button key={t} class="pill-b" aria-pressed={type.value === t} onClick={() => (type.value = type.value === t ? null : t)}>
              <Icon name={TYPE_ICONS[t]} />
              {TYPE_PLURALS[t]}
            </button>
          ))}
      </div>
    </div>
  );
}
