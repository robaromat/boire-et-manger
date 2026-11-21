import { signal } from '@preact/signals';
import { showSnack } from '../components/Snack';
import { navigate } from '../router';
import type { VisitWine } from './types';

// « Créer un souvenir » après une recette faite ou un vin bu : le carnet Souvenirs s'ouvre sur l'ajout d'une visite,
// pré-remplie (date, commentaire, photo, vin déjà noté dans la Cave).

export interface SouvenirDraft {
  title: string;
  date: string;
  comment: string;
  photos: string[];
  links: VisitWine[];
}

export const pendingSouvenir = signal<SouvenirDraft | null>(null);

/** Message de confirmation avec un bouton « Souvenir ». */
export function snackWithSouvenir(text: string, draft: SouvenirDraft): void {
  showSnack(text, undefined, {
    label: 'Souvenir',
    run: () => {
      pendingSouvenir.value = draft;
      navigate({ name: 'tab', tab: 'souvenirs' });
    },
  });
}
