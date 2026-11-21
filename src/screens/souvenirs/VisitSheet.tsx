import { useEffect, useMemo, useState } from 'preact/hooks';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { showSnack } from '../../components/Snack';
import { savePhoto } from '../../photos/photos';
import { imageToDataUrl } from '../../recipe/image';
import { RecipeError } from '../../recipe/read';
import { settings } from '../../settings/settings';
import { draftFromLabel, readLabel } from '../../cave/label';
import { addWine, emptyWineDraft, todayIso, vintageLabel, wineName, type WineDraft } from '../../cave/ops';
import { COLORS, COLOR_LABELS, type WineColor } from '../../cave/types';
import { syncVisitWines } from '../../souvenirs/actions';
import { addPlace, addVisit, knownPeople, updatePlace, updateVisit, type PlaceDraft } from '../../souvenirs/ops';
import type { Place, Visit } from '../../souvenirs/types';
import { caveEngine, mutateCave, mutateSouvenirs, souvenirsEngine } from '../../sync/store';
import { Dot, recipeList } from '../cave/bits';
import { Shot } from './bits';
import type { SouvenirDraft } from '../../souvenirs/pending';

// « J'y suis allé » (maquette validée) : date, avec qui, note, commentaire, photos, vins bus, « à reprendre ».
// Pour un nouveau lieu, le lieu n'est créé qu'à l'enregistrement de la visite.
// Les vins cochés deviennent des dégustations « ailleurs » dans la Cave ; un vin pas encore en Cave y est créé.

type PendingWine = { key: string; draft: WineDraft; label?: File };

export function VisitSheet(props: {
  place?: Place;
  newPlace?: PlaceDraft;
  visit?: Visit;
  /** Photo d'où vient le lieu : sa date et elle-même sont reprises. */
  fromPhoto?: { file: File; date: string | null };
  /** Souvenir proposé après une recette ou un vin. */
  prefill?: SouvenirDraft;
  onClose: () => void;
  onSaved: (placeId: string) => void;
}) {
  const name = props.place?.name ?? props.newPlace?.name ?? '';
  const v = props.visit;
  const cave = caveEngine.value?.data.value;
  const people = useMemo(() => (souvenirsEngine.value?.data.value ? knownPeople(souvenirsEngine.value.data.value) : []), []);
  const [date, setDate] = useState(v?.date ?? props.fromPhoto?.date ?? props.prefill?.date ?? todayIso());
  const [who, setWho] = useState<string[]>(v?.with ?? []);
  const [extraPeople, setExtraPeople] = useState<string[]>([]);
  const [newWho, setNewWho] = useState('');
  const [rating, setRating] = useState<number | null>(v?.rating ?? null);
  const [comment, setComment] = useState(v?.comment ?? props.prefill?.comment ?? '');
  const [photos, setPhotos] = useState<string[]>(v?.photos ?? props.prefill?.photos ?? []);
  const [files, setFiles] = useState<File[]>(props.fromPhoto ? [props.fromPhoto.file] : []);
  const [wines, setWines] = useState<string[]>((v?.wines ?? props.prefill?.links ?? []).map((w) => w.wineId));
  const [pending, setPending] = useState<PendingWine[]>([]);
  const [wineText, setWineText] = useState('');
  const [newColor, setNewColor] = useState<WineColor>('rouge');
  const [reading, setReading] = useState(false);
  const [reco, setReco] = useState(props.place?.reco ?? '');
  const [busy, setBusy] = useState(false);
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const label = (id: string) => {
    const w = cave?.wines.find((x) => x.id === id);
    return w ? `${wineName(w)} ${vintageLabel(w)}` : 'Vin supprimé';
  };
  const options = useMemo(() => (cave?.wines ?? []).map((w) => ({ id: w.id, text: `${wineName(w)} ${vintageLabel(w)}` })), [cave]);
  const allPeople = [...new Set([...people, ...who, ...extraPeople])];

  const pickWine = (text: string) => {
    const o = options.find((x) => x.text.toLowerCase() === text.trim().toLowerCase());
    if (o) {
      if (!wines.includes(o.id)) setWines([...wines, o.id]);
      setWineText('');
    } else setWineText(text);
  };
  const addNewWine = () => {
    const t = wineText.trim();
    if (!t) return;
    const m = /^(.*?)\s+((?:19|20)\d\d)$/.exec(t);
    setPending([...pending, { key: String(Date.now()), draft: { ...emptyWineDraft(), domaine: m ? m[1]! : t, vintage: m ? +m[2]! : null, color: newColor } }]);
    setWineText('');
  };
  const readWineLabel = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setReading(true);
    try {
      const recipes = recipeList();
      const r = await readLabel(settings.value.openaiKey, { image: await imageToDataUrl(file) }, recipes);
      setPending((cur) => [...cur, { key: String(Date.now()), draft: draftFromLabel(r, recipes), label: file }]);
    } catch (e) {
      showSnack(e instanceof RecipeError ? e.message : 'Étiquette illisible.');
    } finally {
      setReading(false);
    }
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const newPhotos: string[] = [];
      for (const f of files) newPhotos.push(await savePhoto(f));
      // Vins pas encore en Cave : créés maintenant, avec la photo d'étiquette s'il y en a une.
      const created: string[] = [];
      for (const pw of pending) {
        const lab = pw.label ? await savePhoto(pw.label) : undefined;
        mutateCave((d) => {
          const r = addWine(d, { ...pw.draft, ...(lab ? { label: lab } : {}) });
          created.push(r.id);
          return r.data;
        });
      }
      const wineIds = [...wines, ...created];
      const s = souvenirsEngine.value?.data.value;
      if (!s) throw new Error('souvenirs');
      // Le lieu (nouveau ou existant) et la visite
      let placeId = props.place?.id ?? '';
      let placeName = name;
      let visitId = v?.id ?? '';
      mutateSouvenirs((d) => {
        let next = d;
        if (!placeId && props.newPlace) {
          const a = addPlace(next, props.newPlace);
          next = a.data;
          placeId = a.id;
        }
        placeName = next.places.find((p) => p.id === placeId)?.name ?? name;
        const draft = { date: date || todayIso(), with: who, rating, comment: comment.trim(), photos: [...photos, ...newPhotos], wines: v?.wines ?? props.prefill?.links ?? [], auteur: 'Robin' };
        if (v) next = updateVisit(next, placeId, v.id, draft);
        else {
          const r = addVisit(next, placeId, draft);
          next = r.data;
          visitId = r.visitId;
        }
        if (reco.trim() !== (props.place?.reco ?? '').trim()) next = updatePlace(next, placeId, { reco: reco.trim() });
        return next;
      });
      // Les vins bus, dans la Cave
      let links = v?.wines ?? props.prefill?.links ?? [];
      mutateCave((c) => {
        const r = syncVisitWines(c, { id: placeId, name: placeName }, { date: date || todayIso(), rating }, links, wineIds);
        links = r.wines;
        return r.cave;
      });
      mutateSouvenirs((d) => updateVisit(d, placeId, visitId, { wines: links }));
      props.onSaved(placeId);
      const wasTodo = props.place?.todo;
      showSnack(
        v
          ? 'Visite modifiée'
          : wasTodo
            ? 'Visite notée : le lieu quitte « À essayer »'
            : links.length
              ? `Visite notée, ${links.length} vin${links.length > 1 ? 's' : ''} dans les « Dégustés » de la Cave`
              : 'Visite notée',
      );
    } catch {
      setBusy(false);
      showSnack('Photo illisible : réessaie avec une autre.');
    }
  };

  return (
    <Sheet onClose={props.onClose} label="J’y suis allé" full>
      <div class="sheet-head">
        <h2>{v ? 'Modifier la visite' : 'J’y suis allé'}</h2>
        <button class="btn ghost small" onClick={props.onClose}>
          Annuler
        </button>
      </div>
      <p class="note" style="margin-top:-6px">
        {name}
        {props.newPlace ? ' · nouveau lieu' : ''}
      </p>
      <div class="field">
        <label for="v-date">Quand{props.fromPhoto?.date ? ' (date de la photo)' : ''}</label>
        <input id="v-date" class="input" type="date" value={date} max={todayIso()} onInput={(e) => setDate(e.currentTarget.value)} />
      </div>
      <div class="field">
        <label>Avec qui</label>
        <div class="choice" role="group" aria-label="Avec qui">
          {allPeople.map((p) => (
            <button key={p} aria-pressed={who.includes(p)} onClick={() => setWho(who.includes(p) ? who.filter((x) => x !== p) : [...who, p])}>
              {p}
            </button>
          ))}
        </div>
        <form
          class="addform"
          onSubmit={(e) => {
            e.preventDefault();
            const n = newWho.trim();
            if (!n) return;
            if (!allPeople.includes(n)) setExtraPeople([...extraPeople, n]);
            if (!who.includes(n)) setWho([...who, n]);
            setNewWho('');
          }}
        >
          <input aria-label="Ajouter un prénom" placeholder="Ajouter un prénom" value={newWho} onInput={(e) => setNewWho(e.currentTarget.value)} />
          <button type="submit" aria-label="Ajouter" disabled={!newWho.trim()}>
            <Icon name="plus" />
          </button>
        </form>
      </div>
      <div class="field">
        <label>Ta note</label>
        <div class="rate" role="group" aria-label="Note sur 5">
          {[1, 2, 3, 4, 5].map((k) => (
            <button key={k} class={rating != null && k <= rating ? 'on' : ''} aria-label={`${k} sur 5`} aria-pressed={rating === k} onClick={() => setRating(rating === k ? null : k)}>
              ★
            </button>
          ))}
        </div>
      </div>
      <div class="field">
        <label for="v-com">Commentaire</label>
        <textarea id="v-com" class="ftext" placeholder="Ce que tu as mangé, l’ambiance, le service…" value={comment} onInput={(e) => setComment(e.currentTarget.value)} />
      </div>
      <div class="field">
        <label>Photos (plats, menu, carte des vins)</label>
        <div class="vphotos">
          {photos.map((id) => (
            <span class="vph" key={id}>
              <Shot id={id} />
              <button class="x" aria-label="Retirer la photo" onClick={() => setPhotos(photos.filter((x) => x !== id))}>
                <Icon name="close" />
              </button>
            </span>
          ))}
          {urls.map((u, k) => (
            <span class="vph" key={u}>
              <span class="shot">
                <img src={u} alt="" />
              </span>
              <button class="x" aria-label="Retirer la photo" onClick={() => setFiles(files.filter((_, j) => j !== k))}>
                <Icon name="close" />
              </button>
            </span>
          ))}
          <label class="vadd" aria-label="Ajouter des photos">
            <Icon name="camera" />
            <input type="file" accept="image/*" multiple hidden onChange={(e) => setFiles([...files, ...[...(e.currentTarget.files ?? [])]])} />
          </label>
        </div>
      </div>
      <div class="field">
        <label for="v-wine">Vins bus</label>
        {(wines.length > 0 || pending.length > 0) && (
          <div class="winechips">
            {wines.map((id) => (
              <button key={id} class="winechip" onClick={() => setWines(wines.filter((x) => x !== id))} aria-label={`Retirer ${label(id)}`}>
                <Icon name="glass" />
                {label(id)}
                <Icon name="close" />
              </button>
            ))}
            {pending.map((p) => (
              <button key={p.key} class="winechip" onClick={() => setPending(pending.filter((x) => x.key !== p.key))} aria-label={`Retirer ${wineName(p.draft)}`}>
                <Icon name="glass" />
                {wineName(p.draft)} {vintageLabel(p.draft)} <small>nouveau</small>
                <Icon name="close" />
              </button>
            ))}
          </div>
        )}
        <input id="v-wine" class="input" list="v-wines" placeholder="Un vin de ta Cave, ou le nom d’un autre" value={wineText} onInput={(e) => pickWine(e.currentTarget.value)} />
        <datalist id="v-wines">
          {options.map((o) => (
            <option key={o.id} value={o.text} />
          ))}
        </datalist>
        {wineText.trim() && (
          <div class="newwine">
            <div class="choice" role="group" aria-label="Couleur">
              {COLORS.map((c) => (
                <button key={c} aria-pressed={newColor === c} onClick={() => setNewColor(c)}>
                  <Dot color={c} size={10} />
                  {COLOR_LABELS[c]}
                </button>
              ))}
            </div>
            <button class="btn small" onClick={addNewWine}>
              <Icon name="plus" />
              Ajouter « {wineText.trim()} » à la Cave
            </button>
          </div>
        )}
        {settings.value.openaiKey && (
          <label class="btn ghost small" style="justify-self:start">
            <Icon name="camera" />
            {reading ? 'ChatGPT lit l’étiquette…' : 'Photo de l’étiquette'}
            <input type="file" accept="image/*" capture="environment" hidden disabled={reading} onChange={(e) => void readWineLabel(e.currentTarget)} />
          </label>
        )}
        <p class="note">Ils vont aussi dans la Cave, sous « Dégustés », avec ce lieu.</p>
      </div>
      <div class="field">
        <label for="v-reco">À reprendre la prochaine fois</label>
        <input id="v-reco" class="input" placeholder="ex. la côte de veau, le baba" value={reco} onInput={(e) => setReco(e.currentTarget.value)} />
      </div>
      <button class="btn primary block" disabled={busy || reading} onClick={() => void save()}>
        {v ? 'Enregistrer' : 'Enregistrer la visite'}
      </button>
    </Sheet>
  );
}
