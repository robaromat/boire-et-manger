import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { TAB_LABELS } from '../router';
import { closeTuto, tutoOpen } from './state';

// Panneau de visite. Chaque étape a une petite illustration dessinée avec les classes de l'app et des données
// inventées ; elle est inerte (rien n'y est cliquable).

const row = (rc: string, name: string, qty: string, done = false) => (
  <div class={`row${done ? ' done' : ''}`} style={`--rc:var(--r-${rc})`}>
    <div class="row-inner">
      <span class="check">
        <Icon name="check" />
      </span>
      <span class="row-text">
        <span class="name">{name}</span>
        {qty && <span class="qty">{qty}</span>}
      </span>
    </div>
  </div>
);

const ILLUS: Record<string, () => JSX.Element> = {
  'courses.listes': () => (
    <div class="tabs" style="border:0;padding:0">
      <span class="tab" aria-selected="true">
        Biocoop <span class="n">7</span>
      </span>
      <span class="tab">
        Picard <span class="n">1</span>
      </span>
      <span class="tab add">
        <Icon name="plus" />
      </span>
    </div>
  ),
  'courses.saisie': () => (
    <div class="addform">
      <input value="2 lait, pain, farine 500 g" readOnly tabIndex={-1} aria-hidden="true" />
      <span class="addbtn">
        <Icon name="plus" />
      </span>
    </div>
  ),
  'courses.fiche': () => (
    <div class="row" style="--rc:var(--r-fl)">
      <div class="row-del">Supprimer</div>
      <div class="row-inner" style="transform:translateX(-90px)">
        <span class="check">
          <Icon name="check" />
        </span>
        <span class="row-text">
          <span class="name">Poireaux</span>
          <span class="qty">×3</span>
        </span>
      </div>
    </div>
  ),
  'courses.panier': () => (
    <div>
      {row('cre', 'Œufs', '×6', true)}
      {row('fl', 'Bananes', '', true)}
    </div>
  ),
};

export function TutoSheet() {
  const t = tutoOpen.value;
  const [i, setI] = useState(0);
  if (!t) return null;
  const step = t.steps[Math.min(i, t.steps.length - 1)]!;
  const last = i >= t.steps.length - 1;
  const close = () => {
    setI(0);
    closeTuto();
  };
  const Illus = ILLUS[step.id];

  return (
    <Sheet onClose={close} label={`Découvrir ${TAB_LABELS[t.tab]}`}>
      <div class="tuto-k">
        <span>{TAB_LABELS[t.tab]}</span>
        <span>
          {i + 1} / {t.steps.length}
        </span>
      </div>
      <h2>{step.title}</h2>
      {Illus && (
        <div class="tuto-illus" inert aria-hidden="true">
          <Illus />
        </div>
      )}
      <p class="tuto-text">{step.text}</p>
      {t.steps.length > 1 && (
        <div class="tuto-dots" aria-hidden="true">
          {t.steps.map((s, k) => (
            <i key={s.id} class={k === i ? 'on' : ''} />
          ))}
        </div>
      )}
      <div class="btnrow tuto-btns">
        {!last ? (
          <button class="btn ghost" onClick={close}>
            Passer
          </button>
        ) : (
          <span />
        )}
        <button class="btn primary" onClick={() => (last ? close() : setI(i + 1))} autoFocus>
          {last ? "C'est parti" : 'Suivant'}
        </button>
      </div>
    </Sheet>
  );
}
