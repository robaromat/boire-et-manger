import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { TAB_LABELS } from '../router';
import { closeTuto, tutoOpen } from './state';
import { BottleArt } from '../screens/cave/bits';
import '../styles/cave.css';

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

const wrow = (color: 'rouge' | 'blanc' | 'bulles', name: string, meta: string, n: string, win: string, cls = 'plain') => (
  <div class="wrow" style="padding:6px 4px;border:0">
    <span class="bottle">
      <BottleArt color={color} />
    </span>
    <span class="t">
      <b>{name}</b>
      <span class="meta">{meta}</span>
    </span>
    <span class="side">
      <span class="n">{n}</span>
      <span class={`wtag ${cls}`}>{win}</span>
    </span>
  </div>
);

const ILLUS: Record<string, () => JSX.Element> = {
  'cave.boire': () => (
    <div>
      <div class="sec-h late" style="padding:4px 4px 2px">
        <h2 style="font-size:16px">Fenêtre dépassée</h2>
      </div>
      {wrow('rouge', 'Domaine Combier', '2018 · Crozes-Hermitage', '×3', '2022–2025', 'late')}
      <div class="sec-h" style="padding:4px 4px 2px">
        <h2 style="font-size:16px">À boire en 2026</h2>
      </div>
      {wrow('blanc', 'Domaine du Closel', '2019 · Savennières', '×2', '2022–2026')}
    </div>
  ),
  'cave.sortir': () => (
    <div class="opts tight">
      <div class="opt">
        <Icon name="glass" />
        <span>Bue à la maison</span>
      </div>
      <div class="opt">
        <Icon name="gift" />
        <span>Offerte</span>
      </div>
      <div class="opt">
        <Icon name="alert" />
        <span>Bouchonnée ou abîmée</span>
      </div>
    </div>
  ),
  'cave.ajout': () => (
    <div class="estbox" style="gap:6px">
      <div class="h">
        <span>Estimations ChatGPT</span>
        <span class="wtag est">à vérifier</span>
      </div>
      {wrow('bulles', 'Champagne Bérêche', 'NM · Champagne', '×2', '2025–2027', 'est')}
    </div>
  ),
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
  'courses.recette': () => (
    <div class="tuto-recette">
      <span class="chip">Photo</span>
      <span class="chip">Galerie</span>
      <span class="chip">Lien</span>
      <span class="fab tuto-fab">
        <Icon name="camera" />
        Recette
      </span>
    </div>
  ),
  'recettes.carnet': () => (
    <div class="tuto-rec">
      <div class="search">
        <Icon name="search" />
        <span>poireau</span>
      </div>
      <div class="rrow">
        <div class="cover">
          <Icon name="book" />
        </div>
        <span class="t">
          <b>Poireaux vinaigrette</b>
          <span class="meta">
            Entrée · contient <mark>Poireaux</mark>
          </span>
        </span>
      </div>
    </div>
  ),
  'recettes.ajout': () => (
    <div class="tuto-recette">
      <span class="chip">Photo</span>
      <span class="chip">Lien</span>
      <span class="chip">À la main</span>
      <span class="fab tuto-fab">
        <Icon name="plus" />
        Recette
      </span>
    </div>
  ),
  'recettes.fiche': () => (
    <div class="ractions">
      <span class="act primary">
        <Icon name="cart" />
        Aux courses
      </span>
      <span class="act">
        <Icon name="flame" />
        Mode cuisine
      </span>
      <span class="act">
        <Icon name="check" />
        Je l’ai fait
      </span>
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
