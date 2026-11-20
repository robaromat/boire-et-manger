import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { imageToDataUrl } from '../../recipe/image';
import { RecipeError } from '../../recipe/read';
import { navigate } from '../../router';
import { settings } from '../../settings/settings';
import { draftFromLabel, readLabel } from '../../cave/label';
import { emptyWineDraft, type WineDraft } from '../../cave/ops';
import type { CaveFile } from '../../cave/types';
import { recipeList } from './bits';
import { WineEditor, type WineEditorResult, type WineKind } from './WineEditor';

// « + Vin » : photo de l'étiquette (ou galerie), ou saisie à la main → fiche à vérifier → en cave, dégusté ailleurs, ou envie.

export interface AddWineResult extends WineEditorResult {
  labelFile: File | null;
}

type Phase =
  | { kind: 'pick'; error?: string }
  | { kind: 'loading'; preview: string }
  | { kind: 'edit'; draft: WineDraft; mode: 'read' | 'manual'; labelFile: File | null };

export function AddSheet(props: {
  data: CaveFile;
  /** Envie achetée : la fiche s'ouvre pré-remplie, « En cave ». */
  prefill?: { draft: WineDraft; kind: WineKind };
  onClose: () => void;
  onSave: (r: AddWineResult) => void;
}) {
  const key = settings.value.openaiKey;
  const [phase, setPhase] = useState<Phase>(props.prefill ? { kind: 'edit', draft: props.prefill.draft, mode: 'manual', labelFile: null } : { kind: 'pick' });
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const onFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setPhase({ kind: 'loading', preview });
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const recipes = recipeList();
      const r = await readLabel(key, { image: await imageToDataUrl(file) }, recipes, { signal: ctrl.signal });
      if (!ctrl.signal.aborted) setPhase({ kind: 'edit', mode: 'read', labelFile: file, draft: draftFromLabel(r, recipes) });
    } catch (e) {
      if (!ctrl.signal.aborted) setPhase({ kind: 'pick', error: e instanceof RecipeError ? e.message : 'Lecture impossible : ' + String(e) });
    } finally {
      URL.revokeObjectURL(preview);
    }
  };

  if (phase.kind === 'edit') {
    const labelFile = phase.labelFile;
    return (
      <WineEditor
        data={props.data}
        initial={phase.draft}
        mode={phase.mode}
        kind={props.prefill?.kind}
        title={props.prefill ? 'Ranger en cave' : undefined}
        onClose={props.onClose}
        onSave={(r) => props.onSave({ ...r, labelFile })}
      />
    );
  }

  if (phase.kind === 'loading')
    return (
      <Sheet onClose={props.onClose} label="Lecture de l’étiquette" full>
        <div class="loading" role="status">
          <img src={phase.preview} alt="Photo de l’étiquette" />
          <div class="spinner" aria-hidden="true" />
          <div>
            <b>ChatGPT lit l’étiquette…</b>
            <p class="note">Domaine, cuvée, millésime, appellation, puis une estimation de la fenêtre de dégustation et des accords.</p>
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

  const manual = () => setPhase({ kind: 'edit', mode: 'manual', labelFile: null, draft: emptyWineDraft() });

  return (
    <Sheet onClose={props.onClose} label="Ajouter un vin">
      <h2>Ajouter un vin</h2>
      {phase.error && (
        <div class="notice" role="alert">
          {phase.error}
        </div>
      )}
      <div class="opts">
        {key ? (
          <>
            <label class="opt">
              <Icon name="camera" />
              <span>
                Photographier l’étiquette<small>ChatGPT lit le domaine, la cuvée, le millésime</small>
              </span>
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e.currentTarget)} />
            </label>
            <label class="opt">
              <Icon name="image" />
              <span>
                Choisir dans la galerie<small>Photo d’étiquette, capture d’une carte des vins</small>
              </span>
              <input type="file" accept="image/*" hidden onChange={(e) => void onFile(e.currentTarget)} />
            </label>
          </>
        ) : (
          <div class="notice">
            La lecture des étiquettes passe par ChatGPT : colle d’abord ta clé OpenAI dans les Réglages (elle reste sur ce téléphone).
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
        )}
        <button class="opt" onClick={manual}>
          <Icon name="pen" />
          <span>Saisir à la main</span>
        </button>
      </div>
      <p class="note">Ensuite tu choisis : en cave, dégusté ailleurs, ou envie. Environ 1 centime par étiquette lue.</p>
    </Sheet>
  );
}
