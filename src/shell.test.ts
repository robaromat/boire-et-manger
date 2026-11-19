import { describe, expect, it } from 'vitest';
import { chooseStartTab } from './lib/lastUse';
import { markSeen, pendingSteps, type TutoStep } from './tuto/tuto';
import { migrateLegacySettings } from './settings/settings';

const H = 3600 * 1000;
const NOW = Date.parse('2026-11-19T20:00:00Z');

describe('ouverture : règle des 24 h', () => {
  it('moins de 24 h : dernier onglet', () => {
    expect(chooseStartTab({ tab: 'cave', at: NOW - 3 * H }, NOW)).toBe('cave');
  });
  it('24 h ou plus : Courses', () => {
    expect(chooseStartTab({ tab: 'cave', at: NOW - 30 * H }, NOW)).toBe('courses');
    expect(chooseStartTab({ tab: 'cave', at: NOW - 24 * H }, NOW)).toBe('courses');
  });
  it('rien d’enregistré, onglet inconnu ou horloge déréglée : Courses', () => {
    expect(chooseStartTab(null, NOW)).toBe('courses');
    expect(chooseStartTab({ tab: 'bidule', at: NOW - H }, NOW)).toBe('courses');
    expect(chooseStartTab({ tab: 'cave', at: NOW + 5 * H }, NOW)).toBe('courses');
  });
});

describe('tuto', () => {
  const steps: TutoStep[] = [
    { id: 'a', tab: 'courses', since: '2026-11-19', title: 'A', text: '' },
    { id: 'b', tab: 'courses', since: '2026-12-10', title: 'B', text: '' },
    { id: 'c', tab: 'cave', since: '2026-11-19', title: 'C', text: '' },
  ];
  it('jamais vu : toutes les étapes de l’onglet', () => {
    expect(pendingSteps('courses', {}, steps).map((s) => s.id)).toEqual(['a', 'b']);
  });
  it('vu : plus rien ; une étape mise à jour depuis redevient nouvelle, seule', () => {
    const seen = markSeen({}, steps.slice(0, 2), '2026-11-20');
    expect(pendingSteps('courses', seen, steps).map((s) => s.id)).toEqual(['b']);
    expect(pendingSteps('courses', markSeen(seen, steps, '2026-12-11'), steps)).toEqual([]);
  });
});

describe('passage de Courses à Boire & Manger', () => {
  it('le dépôt courses-data devient boire-et-manger-data, jeton et clé gardés', () => {
    expect(migrateLegacySettings({ githubToken: 'tok', owner: 'robaromat', repo: 'courses-data', openaiKey: 'k' })).toEqual({
      githubToken: 'tok', owner: 'robaromat', repo: 'boire-et-manger-data', openaiKey: 'k',
    });
  });
  it('un autre dépôt choisi à la main n’est pas touché', () => {
    expect(migrateLegacySettings({ repo: 'mon-depot' })).toEqual({ repo: 'mon-depot' });
  });
});
