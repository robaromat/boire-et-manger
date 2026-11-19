import { computed, signal } from '@preact/signals';

// Réglages propres à CET appareil, gardés dans localStorage : jeton GitHub, clé OpenAI.
// Rien de tout ça ne part dans un dépôt.

export interface Settings {
  githubToken: string;
  owner: string;
  repo: string;
  openaiKey: string;
}

const DEFAULTS: Settings = {
  githubToken: '',
  owner: 'robaromat',
  repo: 'boire-et-manger-data',
  openaiKey: '',
};

const KEY = 'bm.settings.v1';
const LEGACY_KEY = 'courses.settings.v1'; // app « Courses », avant Boire & Manger

/** Réglages de l'ancienne app « Courses » → Boire & Manger : même jeton et même clé, dépôt renommé. */
export function migrateLegacySettings(raw: Partial<Settings>): Partial<Settings> {
  return raw.repo === 'courses-data' ? { ...raw, repo: 'boire-et-manger-data' } : raw;
}

function load(): Settings {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        raw = JSON.stringify(migrateLegacySettings(JSON.parse(legacy) as Partial<Settings>));
        localStorage.setItem(KEY, raw);
        localStorage.removeItem(LEGACY_KEY);
      }
    }
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = signal<Settings>(load());

export const isConfigured = computed(() => {
  const s = settings.value;
  return Boolean(s.githubToken && s.owner && s.repo);
});

export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings.value));
  } catch {
    // Stockage refusé (navigation privée…) : les réglages valent pour la session seulement.
  }
}

export function clearSettings(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* rien à faire */
  }
  settings.value = { ...DEFAULTS };
}

export function repoRef(s: Settings = settings.value) {
  return { token: s.githubToken.trim(), owner: s.owner.trim(), repo: s.repo.trim() };
}

/** « sk-…a3f9 » : pour montrer qu'une clé est enregistrée sans l'afficher. */
export function maskSecret(s: string): string {
  const t = s.trim();
  if (!t) return '';
  return t.length <= 8 ? '••••' : `${t.slice(0, 3)}…${t.slice(-4)}`;
}
