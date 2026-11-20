import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { emptyDraft, draftFromRead } from '../../recettes/fromRead';
import type { RecipeDraft } from '../../recettes/ops';
import { imageToDataUrl } from '../../recipe/image';
import { LinkError, fetchRecipeText, normalizeUrl } from '../../recipe/link';
import { RecipeError, readRecipe } from '../../recipe/read';
import { navigate } from '../../router';
import { settings } from '../../settings/settings';
import { Editor, type EditorResult } from './Editor';

// « + Recette » : photo, galerie, lien (ou menu Partager d'Android), ou saisie à la main → fiche à vérifier.

type Phase =
  | { kind: 'pick'; error?: string }
  | { kind: 'loading'; preview: string | null; what: string }
  | { kind: 'edit'; draft: RecipeDraft; mode: 'read' | 'manual'; readFrom?: string; sourceFile: File | null };

export interface AddResult extends EditorResult {
  sourceFile: File | null;
}

export function AddSheet(props: { initialLink?: string; onClose: () => void; onSave: (r: AddResult) => void }) {
  const key = settings.value.openaiKey;
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const [link, setLink] = useState(props.initialLink ?? '');
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (props.initialLink && key) void onLink(props.initialLink);
    return () => abort.current?.abort();
  }, []);

  const fail = (e: unknown) =>
    setPhase({ kind: 'pick', error: e instanceof RecipeError || e instanceof LinkError ? e.message : 'Lecture impossible : ' + String(e) });

  const onLink = async (raw: string) => {
    const url = normalizeUrl(raw);
    if (!url) return setPhase({ kind: 'pick', error: 'Colle l’adresse complète de la page (elle commence par https://).' });
    const host = new URL(url).hostname.replace(/^www\./, '');
    setPhase({ kind: 'loading', preview: null, what: host });
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const page = await fetchRecipeText(url);
      if (ctrl.signal.aborted) return;
      const r = await readRecipe(key, { text: page.text }, { signal: ctrl.signal });
      if (!ctrl.signal.aborted)
        setPhase({ kind: 'edit', mode: 'read', readFrom: `sur ${host}`, sourceFile: null, draft: draftFromRead(r, { kind: 'link', url, label: host }) });
    } catch (e) {
      if (!ctrl.signal.aborted) fail(e);
    }
  };

  const onFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setPhase({ kind: 'loading', preview, what: 'photo' });
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const r = await readRecipe(key, await imageToDataUrl(file), { signal: ctrl.signal });
      if (!ctrl.signal.aborted) setPhase({ kind: 'edit', mode: 'read', readFrom: 'sur ta photo', sourceFile: file, draft: draftFromRead(r, { kind: 'photo' }) });
    } catch (e) {
      if (!ctrl.signal.aborted) fail(e);
    } finally {
      URL.revokeObjectURL(preview);
    }
  };

  if (phase.kind === 'edit') {
    const sourceFile = phase.sourceFile;
    return (
      <Editor
        initial={phase.draft}
        mode={phase.mode}
        readFrom={phase.readFrom}
        onClose={props.onClose}
        onSave={(r) => props.onSave({ ...r, sourceFile })}
      />
    );
  }

  if (phase.kind === 'loading') {
    return (
      <Sheet onClose={props.onClose} label="Lecture de la recette" full>
        <div class="loading" role="status">
          {phase.preview ? <img src={phase.preview} alt="Photo de la recette" /> : <p class="note">{phase.what}</p>}
          <div class="spinner" aria-hidden="true" />
          <div>
            <b>ChatGPT lit la recette…</b>
            <p class="note">Titre, ingrédients, étapes, portions, catégorie. Environ 10 à 40 secondes.</p>
          </div>
          <button
            class="btn ghost"
            onClick={() => {
              abort.current?.abort();
              setPhase({ kind: 'pick' });
            }}
          >
            Annuler
          </button>
        </div>
      </Sheet>
    );
  }

  const manual = () => setPhase({ kind: 'edit', mode: 'manual', sourceFile: null, draft: emptyDraft() });

  return (
    <Sheet onClose={props.onClose} label="Ajouter une recette">
      <h2>Ajouter une recette</h2>
      {phase.error && (
        <div class="notice" role="alert">
          {phase.error}
        </div>
      )}
      {key ? (
        <div class="opts">
          <label class="opt">
            <Icon name="camera" />
            <span>
              Prendre une photo<small>Livre, fiche manuscrite, écran</small>
            </span>
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e.currentTarget)} />
          </label>
          <label class="opt">
            <Icon name="image" />
            <span>
              Choisir dans la galerie<small>Capture d’écran d’un site ou d’Instagram</small>
            </span>
            <input type="file" accept="image/*" hidden onChange={(e) => void onFile(e.currentTarget)} />
          </label>
          <form
            class="field"
            onSubmit={(e) => {
              e.preventDefault();
              void onLink(link);
            }}
          >
            <label for="a-link">Ou coller le lien d’une recette</label>
            <div class="addform">
              <input
                id="a-link"
                type="url"
                inputMode="url"
                enterKeyHint="go"
                placeholder="https://www.marmiton.org/…"
                value={link}
                onInput={(e) => setLink(e.currentTarget.value)}
              />
              <button type="submit" aria-label="Lire la recette" disabled={!link.trim()}>
                <Icon name="check" />
              </button>
            </div>
          </form>
          <button class="opt" onClick={manual}>
            <Icon name="pen" />
            <span>
              Saisir à la main<small>Une recette de famille, sans photo</small>
            </span>
          </button>
        </div>
      ) : (
        <div class="opts">
          <div class="notice">
            La lecture des photos et des liens passe par ChatGPT : colle d’abord ta clé OpenAI dans les Réglages (elle reste sur ce
            téléphone).
            <button
              class="btn small"
              onClick={() => {
                props.onClose();
                setTimeout(() => navigate({ name: 'settings' }), 50);
              }}
            >
              Ouvrir les réglages
            </button>
          </div>
          <button class="opt" onClick={manual}>
            <Icon name="pen" />
            <span>
              Saisir à la main<small>Une recette de famille, sans photo</small>
            </span>
          </button>
        </div>
      )}
      <p class="note">
        Depuis Chrome, tu peux aussi partager une page de recette vers B&M. Les photos et pages sont lues par ChatGPT (environ 1 centime
        par recette) ; tu vérifies tout avant d’enregistrer.
      </p>
    </Sheet>
  );
}
