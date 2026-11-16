import { describe, expect, it } from 'vitest';
import { GitHubError, readDataFile, writeDataFile } from './github';
import { data, item, list } from './fixtures';

// Test ponctuel contre le vrai dépôt, sur un fichier jetable (pas data.json), supprimé à la fin.
// Lancé seulement si COURSES_IT_TOKEN est défini (ex. COURSES_IT_TOKEN=$(gh auth token) npm test).
const token = process.env.COURSES_IT_TOKEN;
const ref = { token: token ?? '', owner: 'robaromat', repo: 'courses-data', path: 'test-sync.json' };

describe.runIf(!!token)('GitHub (intégration)', () => {
  it('crée, relit (UTF-8), met à jour avec sha, refuse un sha périmé, puis nettoie', async () => {
    const sample = data([list('l_test', [item('i_1', { name: 'Œufs « plein air »', qty: [{ n: 6, u: null }] })], { name: 'Décathlon' })]);
    const sha1 = await writeDataFile(ref, sample, null, 'test: création');
    try {
      const r1 = await readDataFile(ref);
      expect(r1.sha).toBe(sha1);
      expect(r1.data.lists[0]?.name).toBe('Décathlon');
      expect(r1.data.lists[0]?.items[0]?.name).toBe('Œufs « plein air »');

      const next = data([list('l_test', [], { name: 'Biocoop ✓' })]);
      const sha2 = await writeDataFile(ref, next, sha1, 'test: mise à jour');
      expect(sha2).not.toBe(sha1);
      expect((await readDataFile(ref)).data.lists[0]?.name).toBe('Biocoop ✓');

      await expect(writeDataFile(ref, sample, sha1, 'test: sha périmé')).rejects.toMatchObject({ kind: 'conflict' });
      await expect(readDataFile({ ...ref, token: 'jeton_invalide' })).rejects.toBeInstanceOf(GitHubError);
    } finally {
      const cur = await readDataFile(ref).catch(() => null);
      if (cur)
        await fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${ref.path}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
          body: JSON.stringify({ message: 'test: nettoyage', sha: cur.sha }),
        });
    }
  }, 30_000);
});
