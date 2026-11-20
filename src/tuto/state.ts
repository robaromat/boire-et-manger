import { signal } from '@preact/signals';
import type { TabId } from '../router';
import { markSeen, pendingSteps, stepsOf, type TutoSeen, type TutoStep } from './tuto';

// État du tuto sur cet appareil (localStorage) et visite en cours.

const KEY = 'bm.tuto.v1';

function load(): TutoSeen {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as TutoSeen;
  } catch {
    return {};
  }
}

export const tutoSeen = signal<TutoSeen>(load());

/** Visite affichée : les étapes, et l'onglet concerné. */
export const tutoOpen = signal<{ tab: TabId; steps: TutoStep[] } | null>(null);

/** Onglets dont la visite a été fermée pendant cette session (on ne la réimpose pas à chaque passage). */
const dismissed = new Set<TabId>();

export const hasPending = (tab: TabId) => pendingSteps(tab, tutoSeen.value).length > 0;

/** À l'entrée dans un onglet : ouvre la visite s'il reste des étapes nouvelles. */
export function maybeOpenTuto(tab: TabId): void {
  if (tutoOpen.value || dismissed.has(tab)) return;
  const steps = pendingSteps(tab, tutoSeen.value);
  if (steps.length) tutoOpen.value = { tab, steps };
}

/** « Revoir le tuto » : toutes les étapes de l'onglet. */
export function replayTuto(tab: TabId): void {
  const steps = stepsOf(tab);
  if (steps.length) tutoOpen.value = { tab, steps };
}

export function closeTuto(): void {
  const t = tutoOpen.value;
  if (!t) return;
  dismissed.add(t.tab);
  // Heure comprise : une étape mise à jour plus tard dans la journée redevient « nouvelle », mais pas avant.
  tutoSeen.value = markSeen(tutoSeen.value, t.steps, new Date().toISOString().slice(0, 16));
  try {
    localStorage.setItem(KEY, JSON.stringify(tutoSeen.value));
  } catch {
    /* sans stockage, la visite reviendra au prochain lancement */
  }
  tutoOpen.value = null;
}

export function resetTuto(): void {
  dismissed.clear();
  tutoSeen.value = {};
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* rien */
  }
}
