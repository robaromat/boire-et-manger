import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { showSnack } from '../../components/Snack';
import { readExif } from '../../souvenirs/exif';
import { OsmError, nearbyPlaces, reverse, searchPlaces, type OsmPlace } from '../../souvenirs/osm';
import { addPlace, distance, emptyPlaceDraft, findSamePlace, fmtDistance, parseTags, type PlaceDraft } from '../../souvenirs/ops';
import { PLACE_TYPES, TYPE_LABELS, type PlaceType, type SouvenirsFile } from '../../souvenirs/types';
import { mutateSouvenirs } from '../../sync/store';
import { TYPE_ICONS, here, locate } from './bits';
import { MapView, type MapApi } from './MapView';
import { VisitSheet } from './VisitSheet';

// « + Lieu » (maquette validée) : autour de moi, chercher par nom, depuis une photo (GPS et date), point posé à la main.
// Puis « J'y suis allé » (la visite) ou « À essayer ». Un lieu déjà enregistré est signalé et réutilisé.

type Photo = { file: File; date: string | null; time: string | null; lat: number; lon: number };
type Phase =
  | { k: 'pick'; error?: string }
  | { k: 'loading'; text: string }
  | { k: 'results'; title: string; list: OsmPlace[]; from: { lat: number; lon: number } | null; search?: boolean; photo?: Photo }
  | { k: 'point' }
  | { k: 'name'; draft: PlaceDraft }
  | { k: 'kind'; draft: PlaceDraft; photo?: Photo }
  | { k: 'todo'; draft: PlaceDraft }
  | { k: 'visit'; draft?: PlaceDraft; placeId?: string; photo?: Photo };

const draftFrom = (o: OsmPlace): PlaceDraft => ({ ...emptyPlaceDraft(), name: o.name, type: o.type, sub: o.sub, address: o.address, city: o.city, lat: o.lat, lon: o.lon, osm: o.osm });

export function AddPlace({ data, onClose, onDone, initialSearch }: { data: SouvenirsFile; onClose: () => void; onDone: (id: string) => void; initialSearch?: boolean }) {
  const [phase, setPhase] = useState<Phase>(initialSearch ? { k: 'results', title: 'Chercher un lieu', list: [], from: here.value, search: true } : { k: 'pick' });
  const [q, setQ] = useState('');
  const abort = useRef<AbortController | null>(null);
  const mapApi = useRef<MapApi | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const fail = (e: unknown) => setPhase({ k: 'pick', error: e instanceof OsmError ? e.message : e instanceof DOMException && e.name === 'AbortError' ? undefined : 'Recherche impossible : ' + String(e) });
  const ctrl = () => {
    abort.current?.abort();
    abort.current = new AbortController();
    return abort.current.signal;
  };

  const aroundMe = async () => {
    setPhase({ k: 'loading', text: 'Recherche de ta position…' });
    try {
      const me = await locate();
      setPhase({ k: 'loading', text: 'Lieux autour de toi…' });
      const list = await nearbyPlaces(me.lat, me.lon, 300, ctrl());
      setPhase({ k: 'results', title: 'Autour de toi', list, from: me });
    } catch (e) {
      fail(e);
    }
  };

  const search = async (text: string) => {
    if (!text.trim()) return;
    const from = phase.k === 'results' ? phase.from : here.value;
    setPhase({ k: 'results', title: 'Chercher un lieu', list: [], from, search: true });
    try {
      const list = await searchPlaces(text.trim(), from, ctrl());
      setPhase({ k: 'results', title: 'Chercher un lieu', list, from, search: true });
      if (!list.length) showSnack('Rien trouvé : ajoute la ville, ou pose un point sur la carte.');
    } catch (e) {
      fail(e);
    }
  };

  const fromPhoto = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setPhase({ k: 'loading', text: 'Lecture de la photo…' });
    try {
      const info = readExif(await file.slice(0, 256 * 1024).arrayBuffer());
      if (info.lat == null || info.lon == null) {
        setPhase({
          k: 'pick',
          error:
            'Cette photo ne contient pas de position : l’appareil photo ne l’a pas enregistrée, ou le téléphone l’a retirée. Cherche le lieu par son nom, ou pose un point sur la carte.',
        });
        return;
      }
      const photo: Photo = { file, date: info.date, time: info.time, lat: info.lat, lon: info.lon };
      setPhase({ k: 'loading', text: 'Lieux autour de la photo…' });
      const list = await nearbyPlaces(info.lat, info.lon, 80, ctrl());
      setPhase({ k: 'results', title: 'Où a été prise cette photo ?', list, from: { lat: info.lat, lon: info.lon }, photo });
    } catch (e) {
      fail(e);
    }
  };

  const choose = async (o: OsmPlace, photo?: Photo) => {
    const same = findSamePlace(data, o);
    if (same) {
      if (photo) setPhase({ k: 'visit', placeId: same.id, photo });
      else onDone(same.id);
      return;
    }
    let draft = draftFrom(o);
    // Beaucoup de lieux d'OpenStreetMap n'ont pas d'adresse : on demande celle du point.
    if (!draft.address || !draft.city) {
      setPhase({ k: 'loading', text: 'Adresse du lieu…' });
      try {
        const r = await reverse(o.lat, o.lon, ctrl());
        if (r) draft = { ...draft, address: draft.address || r.address, city: draft.city || r.city };
      } catch {
        /* sans adresse, tant pis : la position suffit */
      }
    }
    setPhase({ k: 'kind', draft, photo });
  };

  const pointChosen = async () => {
    const c = mapApi.current?.center();
    if (!c) return;
    setPhase({ k: 'loading', text: 'Adresse du point…' });
    let draft: PlaceDraft = { ...emptyPlaceDraft(), lat: c.lat, lon: c.lon };
    try {
      const r = await reverse(c.lat, c.lon, ctrl());
      if (r) draft = { ...draft, address: r.address, city: r.city };
    } catch {
      /* sans adresse, tant pis : la position suffit */
    }
    setPhase({ k: 'name', draft });
  };

  if (phase.k === 'visit') {
    const placeId = phase.placeId;
    const place = placeId ? data.places.find((p) => p.id === placeId) : undefined;
    return (
      <VisitSheet
        place={place}
        newPlace={place ? undefined : phase.draft}
        fromPhoto={phase.photo ? { file: phase.photo.file, date: phase.photo.date } : undefined}
        onClose={onClose}
        onSaved={onDone}
      />
    );
  }

  if (phase.k === 'loading')
    return (
      <Sheet onClose={onClose} label="Recherche" full>
        <div class="loading" role="status">
          <div class="spinner" aria-hidden="true" />
          <b>{phase.text}</b>
          <button
            class="btn ghost"
            onClick={() => {
              abort.current?.abort();
              setPhase({ k: 'pick' });
            }}
          >
            Annuler
          </button>
        </div>
      </Sheet>
    );

  if (phase.k === 'results') {
    const from = phase.from;
    const list = from ? [...phase.list].sort((a, b) => distance(from, a) - distance(from, b)) : phase.list;
    const photo = phase.photo;
    return (
      <Sheet onClose={onClose} label={phase.title} full>
        <div class="sheet-head">
          <h2>{phase.title}</h2>
          <button class="btn ghost small" onClick={onClose}>
            Annuler
          </button>
        </div>
        {photo && (
          <div class="exif">
            <PhotoPreview file={photo.file} />
            <div>
              <b>{photo.date ? `${new Date(photo.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}${photo.time ? `, ${photo.time.replace(':', ' h ')}` : ''}` : 'Date inconnue'}</b>
              <p class="note">Choisis le lieu : la visite sera datée du jour de la photo, avec la photo.</p>
            </div>
          </div>
        )}
        {phase.search && (
          <form
            class="addform"
            onSubmit={(e) => {
              e.preventDefault();
              void search(q);
            }}
          >
            <input type="search" enterKeyHint="search" aria-label="Nom du lieu" placeholder="Nom, et la ville si besoin" value={q} onInput={(e) => setQ(e.currentTarget.value)} autoFocus />
            <button type="submit" aria-label="Chercher" disabled={!q.trim()}>
              <Icon name="search" />
            </button>
          </form>
        )}
        <div class="opts">
          {list.map((o) => {
            const known = findSamePlace(data, o);
            return (
              <button key={o.osm} class={`opt${known ? ' known' : ''}`} onClick={() => void choose(o, photo)}>
                <Icon name={TYPE_ICONS[o.type]} />
                <span>
                  {o.name}
                  <small>{[o.sub || TYPE_LABELS[o.type], o.address, phase.search ? o.city : '', known ? 'déjà dans tes souvenirs' : ''].filter(Boolean).join(' · ')}</small>
                </span>
                {from && <span class="r">{fmtDistance(distance(from, o))}</span>}
              </button>
            );
          })}
          {!list.length && !phase.search && <p class="note">Aucun resto, bar, café ou commerce de bouche trouvé ici dans OpenStreetMap.</p>}
        </div>
        <p class="note">
          Pas dans la liste ?{' '}
          <button class="linkbtn" onClick={() => setPhase({ k: 'point' })}>
            Poser un point sur la carte
          </button>
        </p>
      </Sheet>
    );
  }

  if (phase.k === 'point')
    return (
      <Sheet onClose={onClose} label="Poser un point" full cls="pointsheet">
        <div class="sheet-head">
          <h2>Poser un point</h2>
          <button class="btn ghost small" onClick={onClose}>
            Annuler
          </button>
        </div>
        <p class="note" style="margin-top:-6px">
          Déplace la carte pour mettre la croix sur le lieu.
        </p>
        <MapView places={data.places} pick start={here.value} apiRef={mapApi} class="pickmap" />
        <button class="btn primary block" onClick={() => void pointChosen()}>
          Choisir ce point
        </button>
      </Sheet>
    );

  if (phase.k === 'name') return <NameSheet draft={phase.draft} onClose={onClose} onNext={(d) => setPhase({ k: 'kind', draft: d })} />;

  if (phase.k === 'kind')
    return (
      <Sheet onClose={onClose} label={phase.draft.name}>
        <h2>{phase.draft.name}</h2>
        <p class="note" style="margin-top:-8px">
          {[phase.draft.sub || TYPE_LABELS[phase.draft.type], phase.draft.address, phase.draft.city].filter(Boolean).join(' · ')}
        </p>
        <div class="big2">
          <button onClick={() => setPhase({ k: 'visit', draft: phase.draft, photo: phase.photo })}>
            <Icon name="check" />
            J’y suis allé
            <small>Noter la visite : date, avec qui, photos</small>
          </button>
          <button onClick={() => setPhase({ k: 'todo', draft: phase.draft })}>
            <Icon name="bookmark" />À essayer
            <small>Le garder pour plus tard</small>
          </button>
        </div>
      </Sheet>
    );

  if (phase.k === 'todo') return <TodoSheet draft={phase.draft} onClose={onClose} onDone={onDone} />;

  return (
    <Sheet onClose={onClose} label="Ajouter un lieu">
      <h2>Ajouter un lieu</h2>
      {phase.error && (
        <div class="notice" role="alert">
          {phase.error}
        </div>
      )}
      <div class="opts">
        <button class="opt" onClick={() => void aroundMe()}>
          <Icon name="locate" />
          <span>
            Autour de moi<small>Restos, bars, cafés et commerces à moins de 300 m</small>
          </span>
        </button>
        <button class="opt" onClick={() => setPhase({ k: 'results', title: 'Chercher un lieu', list: [], from: here.value, search: true })}>
          <Icon name="search" />
          <span>
            Chercher par nom<small>« Trattoria Nonna Lyon », « boulangerie rue Haute »…</small>
          </span>
        </button>
        <label class="opt">
          <Icon name="image" />
          <span>
            Depuis une photo<small>Le lieu et la date où elle a été prise</small>
          </span>
          <input type="file" accept="image/jpeg,image/*" hidden onChange={(e) => void fromPhoto(e.currentTarget)} />
        </label>
        <button class="opt" onClick={() => setPhase({ k: 'point' })}>
          <Icon name="pin" />
          <span>
            Poser un point sur la carte<small>Pour un lieu absent d’OpenStreetMap</small>
          </span>
        </button>
      </div>
      <p class="note">Les lieux viennent d’OpenStreetMap. Ta position reste sur le téléphone ; seule la recherche autour d’elle est envoyée.</p>
    </Sheet>
  );
}

function PhotoPreview({ file }: { file: File }) {
  const [url] = useState(() => URL.createObjectURL(file));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt="" />;
}

/** Point posé à la main : le nom et le type du lieu. */
function NameSheet({ draft, onClose, onNext }: { draft: PlaceDraft; onClose: () => void; onNext: (d: PlaceDraft) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<PlaceType>('resto');
  return (
    <Sheet onClose={onClose} label="Nouveau lieu">
      <h2>Nouveau lieu</h2>
      <p class="note" style="margin-top:-8px">
        {[draft.address, draft.city].filter(Boolean).join(', ') || 'Adresse inconnue : la position sur la carte suffit.'}
      </p>
      <div class="field">
        <label for="n-name">Nom</label>
        <input id="n-name" class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} autoFocus />
      </div>
      <TypeChoice type={type} onChange={setType} />
      <button class="btn primary block" disabled={!name.trim()} onClick={() => onNext({ ...draft, name: name.trim(), type })}>
        Continuer
      </button>
    </Sheet>
  );
}

export function TypeChoice({ type, onChange }: { type: PlaceType; onChange: (t: PlaceType) => void }) {
  return (
    <div class="field">
      <label>Type</label>
      <div class="choice" role="group" aria-label="Type">
        {PLACE_TYPES.map((t) => (
          <button key={t} aria-pressed={type === t} onClick={() => onChange(t)}>
            <Icon name={TYPE_ICONS[t]} />
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>
    </div>
  );
}

function TodoSheet({ draft, onClose, onDone }: { draft: PlaceDraft; onClose: () => void; onDone: (id: string) => void }) {
  const [why, setWhy] = useState('');
  const [tags, setTags] = useState('');
  return (
    <Sheet onClose={onClose} label="À essayer">
      <div class="sheet-head">
        <h2>À essayer</h2>
        <button class="btn ghost small" onClick={onClose}>
          Annuler
        </button>
      </div>
      <p class="note" style="margin-top:-6px">
        {draft.name}
      </p>
      <div class="field">
        <label for="t-why">Pourquoi, conseillé par qui</label>
        <input id="t-why" class="input" placeholder="ex. Conseillé par Julie, pour le brunch" value={why} onInput={(e) => setWhy(e.currentTarget.value)} />
      </div>
      <div class="field">
        <label for="t-tags">Tags</label>
        <input id="t-tags" class="input" placeholder="brunch, terrasse…" value={tags} onInput={(e) => setTags(e.currentTarget.value)} />
      </div>
      <button
        class="btn primary block"
        onClick={() => {
          let id = '';
          mutateSouvenirs((d) => {
            const r = addPlace(d, { ...draft, todo: true, why: why.trim(), tags: parseTags(tags) });
            id = r.id;
            return r.data;
          });
          showSnack(`« ${draft.name} » ajouté aux « À essayer »`);
          onDone(id);
        }}
      >
        Ajouter aux « À essayer »
      </button>
    </Sheet>
  );
}
