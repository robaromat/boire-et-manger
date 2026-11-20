import { useState } from 'preact/hooks';
import { Icon } from '../../components/Icon';
import { Sheet, sheetsSettled } from '../../components/Sheet';
import { showSnack } from '../../components/Snack';
import { navigate } from '../../router';
import { vintageLabel, wineName } from '../../cave/ops';
import { dropVisitWines } from '../../souvenirs/actions';
import { avgRating, deletePlace, fmtDistance, parseTags, placePhotos, removeVisit, updatePlace } from '../../souvenirs/ops';
import { googleMapsUrl } from '../../souvenirs/osm';
import type { Place, PlaceType, Visit } from '../../souvenirs/types';
import { caveEngine, mutateCave, mutateSouvenirs, souvenirsEngine } from '../../sync/store';
import { Stars, fmtNote, shortDate } from '../recettes/bits';
import { Viewer } from '../recettes/Page';
import { TypeChoice } from './AddPlace';
import { Shot, TYPE_ICONS, distanceTo, placeIcon, subLabel } from './bits';
import { MapView } from './MapView';
import { VisitSheet } from './VisitSheet';

// Fiche d'un lieu (maquette validée) : photos, J'y suis allé / Itinéraire / Partager, « À reprendre » (ou « Pourquoi y
// aller » pour un lieu à essayer), adresse et petite carte, visites (avec qui, note, photos, vins bus liés à la Cave).

type SheetKind = { k: 'visit'; visit?: Visit } | { k: 'reco' } | { k: 'more' } | { k: 'edit' } | { k: 'viewer'; photo: string } | null;

export function PlacePage({ p, onBack, startVisit }: { p: Place; onBack: () => void; startVisit?: boolean }) {
  const [sheet, setSheet] = useState<SheetKind>(startVisit ? { k: 'visit' } : null);
  const close = () => setSheet(null);
  const avg = avgRating(p);
  const photos = placePhotos(p);
  const d = distanceTo(p);
  const maps = googleMapsUrl(p);

  const share = async () => {
    const text = [p.name, [p.address, p.city].filter(Boolean).join(', '), p.reco ? `À prendre : ${p.reco}` : '', maps].filter(Boolean).join('\n');
    try {
      if (navigator.share) await navigator.share({ title: p.name, text });
      else {
        await navigator.clipboard.writeText(text);
        showSnack('Adresse copiée : colle-la dans un message.');
      }
    } catch {
      /* partage annulé */
    }
  };

  const remove = async () => {
    const before = souvenirsEngine.value?.data.value;
    close();
    await sheetsSettled();
    onBack();
    mutateSouvenirs((s) => deletePlace(s, p.id));
    if (before) showSnack(`« ${p.name} » supprimé`, () => mutateSouvenirs(() => before));
  };

  return (
    <>
      <div class="rpage-scroll">
        <div class={`stop${photos.length >= 3 ? ' three' : ''}`}>
          {photos.length ? (
            <>
              <Shot id={photos[0]!} size="full" onOpen={() => setSheet({ k: 'viewer', photo: photos[0]! })} />
              {photos.length >= 3 && (
                <span class="side">
                  <Shot id={photos[1]!} onOpen={() => setSheet({ k: 'viewer', photo: photos[1]! })} />
                  <Shot id={photos[2]!} onOpen={() => setSheet({ k: 'viewer', photo: photos[2]! })} />
                </span>
              )}
            </>
          ) : p.lat != null ? (
            <MapView places={[p]} mini />
          ) : (
            <span class="stop-empty">
              <Icon name={placeIcon(p)} />
            </span>
          )}
          <button class="fbtn back" onClick={onBack} aria-label="Retour aux souvenirs">
            <Icon name="back" />
          </button>
          <button class="fbtn more" onClick={() => setSheet({ k: 'more' })} aria-label="Plus d’actions">
            <Icon name="more" />
          </button>
        </div>
        <div class="fiche">
          <h1>{p.name}</h1>
          <div class="chipsline">
            <span class="rtag plain">
              <Icon name={TYPE_ICONS[p.type]} />
              {subLabel(p)}
            </span>
            {p.city && <span class="rtag plain">{p.city}</span>}
            {p.tags.map((t) => (
              <span key={t} class="rtag">
                {t}
              </span>
            ))}
          </div>
          <div class="statline">
            {p.todo ? (
              <span class="rtag todo">à essayer</span>
            ) : p.visits.length ? (
              <>
                {avg != null && <Stars n={avg} />}
                <span>
                  {avg != null ? `${fmtNote(avg)} · ` : ''}
                  {p.visits.length} visite{p.visits.length > 1 ? 's' : ''} · dernière le {shortDate(p.visits[0]!.date)}
                </span>
              </>
            ) : (
              <span>Pas encore de visite notée</span>
            )}
          </div>
          <div class="ractions">
            <button class="act primary" onClick={() => setSheet({ k: 'visit' })}>
              <Icon name="check" />
              J’y suis allé
            </button>
            <a class="act" href={maps} target="_blank" rel="noopener noreferrer">
              <Icon name="route" />
              Itinéraire
            </a>
            <button class="act" onClick={() => void share()}>
              <Icon name="share" />
              Partager
            </button>
          </div>
          {p.todo ? (
            <button class="why" onClick={() => setSheet({ k: 'edit' })}>
              <small>Pourquoi y aller</small>
              <p>{p.why || <span class="meta">Conseillé par qui, vu où : touche pour l’écrire.</span>}</p>
            </button>
          ) : (
            <button class="adjust" onClick={() => setSheet({ k: 'reco' })}>
              <small>
                <span>À reprendre</span>
                <Icon name="pen" />
              </small>
              <p>{p.reco.trim() ? p.reco : <span class="meta">Les plats et les vins à recommander : touche pour l’écrire.</span>}</p>
            </button>
          )}

          <section class="block">
            <h2>Adresse</h2>
            <div class="saddr">
              {p.lat != null && photos.length > 0 && (
                <div class="smini">
                  <MapView places={[p]} mini />
                </div>
              )}
              <div style="display:grid;gap:4px;min-width:0">
                <b style="font-weight:600">{p.address || 'Adresse non renseignée'}</b>
                <span class="meta">{[p.city, d != null ? `${fmtDistance(d)} de toi` : ''].filter(Boolean).join(' · ')}</span>
                <a class="linkbtn" href={maps} target="_blank" rel="noopener noreferrer">
                  <Icon name="ext" />
                  Ouvrir dans Google Maps
                </a>
              </div>
            </div>
          </section>

          <section class="block">
            <h2>
              Visites{' '}
              <span class="meta" style="font-family:var(--f-ui)">
                {p.visits.length ? `${p.visits.length} fois` : ''}
              </span>
            </h2>
            <div class="journal">
              {p.visits.length ? (
                p.visits.map((v) => <VisitCard key={v.id} p={p} v={v} onEdit={() => setSheet({ k: 'visit', visit: v })} onPhoto={(ph) => setSheet({ k: 'viewer', photo: ph })} />)
              ) : (
                <p class="note">Pas encore de visite. « J’y suis allé » la note{p.todo ? ' et retire le lieu des « À essayer »' : ''}.</p>
              )}
            </div>
          </section>
        </div>
      </div>

      {sheet?.k === 'visit' && <VisitSheet place={p} visit={sheet.visit} onClose={close} onSaved={close} />}
      {sheet?.k === 'reco' && <RecoSheet p={p} onClose={close} />}
      {sheet?.k === 'edit' && <EditSheet p={p} onClose={close} />}
      {sheet?.k === 'viewer' && <Viewer photo={sheet.photo} onClose={close} />}
      {sheet?.k === 'more' && (
        <Sheet onClose={close} label="Plus d’actions">
          <div class="opts">
            <button class="opt" onClick={() => setSheet({ k: 'edit' })}>
              <Icon name="pen" />
              <span>
                Modifier le lieu<small>Nom, type, adresse, tags</small>
              </span>
            </button>
            <button
              class="opt"
              onClick={() => {
                mutateSouvenirs((s) => updatePlace(s, p.id, { todo: !p.todo, why: p.todo ? p.why : p.why || 'À retester' }));
                close();
                showSnack(p.todo ? 'Retiré des « À essayer »' : 'Remis dans « À essayer »');
              }}
            >
              <Icon name="bookmark" />
              <span>
                {p.todo ? 'Retirer des « À essayer »' : 'Remettre dans « À essayer »'}
                <small>{p.todo ? 'Sans noter de visite' : 'Par exemple pour un lieu qui a changé de chef'}</small>
              </span>
            </button>
            <button class="opt danger" onClick={() => void remove()}>
              <Icon name="trash" />
              <span>
                Supprimer le lieu<small>Avec ses visites, Annuler pendant quelques secondes</small>
              </span>
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

function VisitCard({ p, v, onEdit, onPhoto }: { p: Place; v: Visit; onEdit: () => void; onPhoto: (id: string) => void }) {
  const cave = caveEngine.value?.data.value;
  const remove = () => {
    const before = souvenirsEngine.value?.data.value;
    const caveBefore = caveEngine.value?.data.value;
    mutateSouvenirs((s) => removeVisit(s, p.id, v.id));
    if (v.wines.length) mutateCave((c) => dropVisitWines(c, v.wines));
    if (before)
      showSnack('Visite supprimée', () => {
        mutateSouvenirs(() => before);
        if (caveBefore && v.wines.length) mutateCave(() => caveBefore);
      });
  };
  return (
    <div class="svisit">
      <div class="hd">
        <button class="xmain" onClick={onEdit}>
          <b>{shortDate(v.date)}</b> {v.rating != null && <Stars n={v.rating} />}
        </button>
        <button class="iconbtn" aria-label={`Supprimer la visite du ${shortDate(v.date)}`} onClick={remove}>
          <Icon name="trash" />
        </button>
      </div>
      {v.with.length > 0 && (
        <span class="meta">
          <Icon name="users" /> avec {v.with.join(', ').replace(/, ([^,]*)$/, ' et $1')}
        </span>
      )}
      {v.comment && (
        <button class="xmain" onClick={onEdit}>
          <p>{v.comment}</p>
        </button>
      )}
      {v.photos.length > 0 && (
        <div class="thumbs">
          {v.photos.map((id) => (
            <Shot key={id} id={id} onOpen={() => onPhoto(id)} />
          ))}
        </div>
      )}
      {v.wines.length > 0 && (
        <div class="winechips">
          {v.wines.map((w) => {
            const wine = cave?.wines.find((x) => x.id === w.wineId);
            return (
              wine && (
                <button key={w.exitId} class="winechip" onClick={() => navigate({ name: 'tab', tab: 'cave', sub: wine.id })}>
                  <Icon name="glass" />
                  {wineName(wine)} {vintageLabel(wine)}
                </button>
              )
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecoSheet({ p, onClose }: { p: Place; onClose: () => void }) {
  const [text, setText] = useState(p.reco);
  return (
    <Sheet onClose={onClose} label="À reprendre">
      <h2>À reprendre</h2>
      <p class="note" style="margin-top:-6px">
        Les plats et les vins à recommander. Ils s’affichent en haut de la fiche.
      </p>
      <textarea class="ftext" style="min-height:110px" aria-label="À reprendre" value={text} onInput={(e) => setText(e.currentTarget.value)} autoFocus />
      <button
        class="btn primary block"
        onClick={() => {
          mutateSouvenirs((s) => updatePlace(s, p.id, { reco: text.trim() }));
          onClose();
        }}
      >
        Enregistrer
      </button>
    </Sheet>
  );
}

function EditSheet({ p, onClose }: { p: Place; onClose: () => void }) {
  const [f, setF] = useState({ name: p.name, sub: p.sub, address: p.address, city: p.city, tags: p.tags.join(', '), why: p.why });
  const [type, setType] = useState<PlaceType>(p.type);
  const set = (k: keyof typeof f) => (e: { currentTarget: { value: string } }) => {
    const v = e.currentTarget.value;
    setF((cur) => ({ ...cur, [k]: v }));
  };
  return (
    <Sheet onClose={onClose} label="Modifier le lieu" full>
      <div class="sheet-head">
        <h2>Modifier le lieu</h2>
        <button class="btn ghost small" onClick={onClose}>
          Annuler
        </button>
      </div>
      <div class="field">
        <label for="e-name">Nom</label>
        <input id="e-name" class="input" value={f.name} onInput={set('name')} />
      </div>
      <TypeChoice type={type} onChange={setType} />
      <div class="field">
        <label for="e-sub">Précision</label>
        <input id="e-sub" class="input" placeholder="Bistrot, italien, bar à vin…" value={f.sub} onInput={set('sub')} />
      </div>
      <div class="fgrid2">
        <div class="field">
          <label for="e-addr">Adresse</label>
          <input id="e-addr" class="input" value={f.address} onInput={set('address')} />
        </div>
        <div class="field">
          <label for="e-city">Ville</label>
          <input id="e-city" class="input" value={f.city} onInput={set('city')} />
        </div>
      </div>
      <div class="field">
        <label for="e-tags">Tags</label>
        <input id="e-tags" class="input" placeholder="terrasse, brunch…" value={f.tags} onInput={set('tags')} />
      </div>
      {p.todo && (
        <div class="field">
          <label for="e-why">Pourquoi y aller</label>
          <input id="e-why" class="input" placeholder="Conseillé par…, vu sur…" value={f.why} onInput={set('why')} />
        </div>
      )}
      <button
        class="btn primary block"
        disabled={!f.name.trim()}
        onClick={() => {
          mutateSouvenirs((s) =>
            updatePlace(s, p.id, { name: f.name.trim(), type, sub: f.sub.trim(), address: f.address.trim(), city: f.city.trim(), tags: parseTags(f.tags), why: f.why.trim() }),
          );
          onClose();
          showSnack('Lieu modifié');
        }}
      >
        Enregistrer
      </button>
    </Sheet>
  );
}
