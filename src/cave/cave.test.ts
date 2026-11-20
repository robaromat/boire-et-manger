import { describe, expect, it } from 'vitest';
import { applyCtImport, buildCtImport, ctDate, ctReason, dateOrder, scoreToStars } from './cellartracker';
import { csvRecords, decodeText, parseCsv } from './csv';
import { draftFromLabel, type LabelRead } from './label';
import { mergeCave } from './merge';
import {
  addStock, addWine, bottles, cellarPlan, drinkGroups, emptyWineDraft, findSame, matchWine, removeExit, takeBottle, tastings, wineName,
  type WineDraft,
} from './ops';
import { emptyCaveFile, parseCaveFile, type CaveFile } from './types';

const draft = (p: Partial<WineDraft>): WineDraft => ({ ...emptyWineDraft(), ...p });
const exit = { date: '2026-11-20', reason: 'bue' as const, rating: 4, comment: '', dish: '', where: '', detail: '', auteur: 'Robin' };

function cave(): { d: CaveFile; chinon: string; crozes: string } {
  let d = emptyCaveFile();
  const a = addWine(d, draft({ domaine: 'Domaine des Roches Neuves', cuvee: 'Terres de Chinon', vintage: 2020, appellation: 'Chinon', from: 2023, to: 2026 }), [
    { place: 'Cave', shelf: 'B2', n: 4 },
  ]);
  d = a.data;
  const b = addWine(d, draft({ domaine: 'Domaine Combier', vintage: 2018, appellation: 'Crozes-Hermitage', grapes: 'Syrah', from: 2022, to: 2025 }), [
    { place: 'Cave', shelf: 'B1', n: 2 },
    { place: 'Armoire cuisine', shelf: '1', n: 1 },
  ]);
  return { d: b.data, chinon: a.id, crozes: b.id };
}

describe('cave : opérations', () => {
  it('compte, nomme et cherche', () => {
    const { d, crozes } = cave();
    const w = d.wines.find((x) => x.id === crozes)!;
    expect(bottles(w)).toBe(3);
    expect(wineName(w)).toBe('Domaine Combier');
    expect(wineName(d.wines.find((x) => x.cuvee)!)).toBe('Domaine des Roches Neuves · Terres de Chinon');
    expect(matchWine(w, 'syrah crozes')).toBe(true);
    expect(matchWine(w, 'chinon')).toBe(false);
    expect(matchWine(w, '2018')).toBe(true);
  });

  it('sort une bouteille, puis l’annule', () => {
    const { d, crozes } = cave();
    const r = takeBottle(d, crozes, { ...exit, from: { place: 'Armoire cuisine', shelf: '1' } });
    const w = r.data.wines.find((x) => x.id === crozes)!;
    expect(bottles(w)).toBe(2);
    expect(w.stock.find((s) => s.place === 'Armoire cuisine')).toBeUndefined();
    expect(w.history).toHaveLength(1);
    const back = removeExit(r.data, crozes, r.exitId, true).wines.find((x) => x.id === crozes)!;
    expect(bottles(back)).toBe(3);
    expect(back.history).toHaveLength(0);
  });

  it('dégustée ailleurs : pas de stock en moins', () => {
    const { d, chinon } = cave();
    const r = takeBottle(d, chinon, { ...exit, reason: 'exterieur', where: 'Restaurant' });
    expect(bottles(r.data.wines.find((x) => x.id === chinon)!)).toBe(4);
    expect(tastings(r.data)).toHaveLength(1);
  });

  it('les sorties sans dégustation ne vont pas dans « Dégustés »', () => {
    const { d, chinon } = cave();
    const r = takeBottle(d, chinon, { ...exit, reason: 'offerte', rating: null, detail: 'à Paul', from: { place: 'Cave', shelf: 'B2' } });
    expect(tastings(r.data)).toHaveLength(0);
    expect(bottles(r.data.wines.find((x) => x.id === chinon)!)).toBe(3);
  });

  it('« À boire » : groupé par fin de fenêtre, fenêtre dépassée en tête', () => {
    let { d } = cave();
    d = addWine(d, draft({ domaine: 'Vajra', vintage: 2019, from: 2027, to: 2035 }), [{ place: 'Cave', shelf: 'C1', n: 2 }]).data;
    d = addWine(d, draft({ domaine: 'Inconnu' }), [{ place: 'Cave', shelf: '', n: 1 }]).data;
    const g = drinkGroups(d.wines, 2026);
    expect(g.ready.map((x) => [x.year, x.late, x.wines.length])).toEqual([
      [2025, true, 1],
      [2026, false, 1],
    ]);
    expect(g.young.map((w) => w.domaine)).toEqual(['Vajra']);
    expect(g.unknown).toHaveLength(1);
  });

  it('plan de la cave d’après les emplacements saisis', () => {
    const { d } = cave();
    const plan = cellarPlan(d.wines);
    expect(plan.map((p) => [p.place, p.n])).toEqual([
      ['Cave', 6],
      ['Armoire cuisine', 1],
    ]);
    expect(plan[0]!.shelves.map((s) => s.shelf)).toEqual(['B1', 'B2']);
  });

  it('ranger le même vin réutilise sa fiche', () => {
    const { d, chinon } = cave();
    const same = findSame(d, { domaine: 'domaine des roches-neuves', cuvee: 'Terres de Chinon', vintage: 2020 });
    expect(same?.id).toBe(chinon);
    expect(findSame(d, { domaine: 'Domaine des Roches Neuves', cuvee: 'Terres de Chinon', vintage: 2021 })).toBeUndefined();
    const more = addStock(d, chinon, [{ place: 'cave', shelf: 'b2', n: 2 }]);
    expect(more.wines.find((x) => x.id === chinon)!.stock).toEqual([{ place: 'Cave', shelf: 'B2', n: 6 }]);
  });

  it('relit cave.json en complétant les champs manquants', () => {
    const f = parseCaveFile({ schemaVersion: 1, wines: [{ id: 'w_1', domaine: 'X', stock: [{ place: 'Cave', n: 2 }], history: [{ id: 'x', reason: 'zzz' }] }] });
    expect(f?.wines[0]?.stock).toEqual([{ place: 'Cave', shelf: '', n: 2 }]);
    expect(f?.wines[0]?.history).toEqual([]);
    expect(f?.wishes).toEqual([]);
    expect(parseCaveFile({ schemaVersion: 2 })).toBeNull();
  });
});

describe('cave : fusion entre deux téléphones', () => {
  it('une bouteille sortie sur chaque téléphone = deux bouteilles en moins, deux lignes d’historique', () => {
    const { d: base, chinon } = cave();
    const a = takeBottle(base, chinon, { ...exit, from: { place: 'Cave', shelf: 'B2' } }).data;
    const b = takeBottle(base, chinon, { ...exit, date: '2026-11-19', from: { place: 'Cave', shelf: 'B2' } }).data;
    const m = mergeCave(base, a, b).wines.find((x) => x.id === chinon)!;
    expect(bottles(m)).toBe(2);
    expect(m.history).toHaveLength(2);
  });

  it('un vin ajouté de chaque côté est gardé', () => {
    const { d: base } = cave();
    const a = addWine(base, draft({ domaine: 'A' })).data;
    const b = addWine(base, draft({ domaine: 'B' })).data;
    expect(mergeCave(base, a, b).wines).toHaveLength(4);
  });
});

describe('cave : lecture d’étiquette', () => {
  const read: LabelRead = {
    is_wine: true,
    domaine: 'Domaine Jean-Louis Chave',
    cuvee: 'Mon Cœur',
    vintage: 2022,
    color: 'rouge',
    appellation: 'Côtes-du-Rhône',
    region: 'Rhône',
    country: 'France',
    grapes: 'Syrah, grenache',
    style: 'Fruité, épicé',
    drink_from: 2030,
    drink_to: 2025,
    pairings: ['Agneau'],
    recipes: [1, 7],
  };
  const recipes = [
    { id: 'r_a', title: 'Curry', category: 'Plat' },
    { id: 'r_b', title: 'Gratin dauphinois', category: 'Plat' },
  ];

  it('marque les déductions comme estimations et relie les recettes', () => {
    const d = draftFromLabel(read, recipes);
    expect(d.domaine).toBe('Domaine Jean-Louis Chave');
    expect([d.from, d.to]).toEqual([2025, 2030]);
    expect(d.pairRecipes).toEqual(['r_b']);
    expect(d.estimated.sort()).toEqual(['grapes', 'pairings', 'region', 'style', 'window']);
  });

  it('« Compléter » ne remplace pas ce qui est déjà saisi', () => {
    const d = draftFromLabel(read, recipes, draft({ domaine: 'Chave', grapes: 'Syrah', from: 2026, to: 2032, vintage: 2021 }));
    expect(d.domaine).toBe('Chave');
    expect(d.vintage).toBe(2021);
    expect(d.grapes).toBe('Syrah');
    expect([d.from, d.to]).toEqual([2026, 2032]);
    expect(d.estimated).not.toContain('window');
    expect(d.estimated).not.toContain('grapes');
  });
});

describe('CSV', () => {
  it('guillemets, séparateurs et retours à la ligne', () => {
    expect(parseCsv('a,b\n"x, y","il a dit ""bon""\nvraiment"\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'il a dit "bon"\nvraiment'],
    ]);
    expect(csvRecords('Producer;Bin\nLapierre;B 2')).toEqual([{ producer: 'Lapierre', bin: 'B 2' }]);
  });

  it('UTF-8 ou Windows-1252', () => {
    expect(decodeText(new TextEncoder().encode('Rosé'))).toBe('Rosé');
    expect(decodeText(new Uint8Array([0x52, 0x6f, 0x73, 0xe9]))).toBe('Rosé');
  });
});

describe('CellarTracker', () => {
  const inventory = [
    'iInventory,Barcode,Location,Bin,Size,Currency,Valuation,Price,StoreName,PurchaseDate,iWine,Type,Color,Category,Vintage,Wine,Producer,Varietal,Designation,Vineyard,Country,Region,SubRegion,Appellation,BeginConsume,EndConsume',
    '1,,Cellar,B2,750ml,EUR,30,16,Salon,3/15/2023,101,Red,Red,Dry,2020,Domaine des Roches Neuves Chinon Terres de Chinon,Domaine des Roches Neuves,Cabernet Franc,Terres de Chinon,Unknown,France,Loire Valley,Touraine,Chinon,2023,2026',
    '2,,Cellar,B2,750ml,EUR,30,16,Salon,3/15/2023,101,Red,Red,Dry,2020,Domaine des Roches Neuves Chinon Terres de Chinon,Domaine des Roches Neuves,Cabernet Franc,Terres de Chinon,Unknown,France,Loire Valley,Touraine,Chinon,2023,2026',
    '3,,Kitchen,1,750ml,EUR,50,42,,,202,White - Sparkling,White,Sparkling,1001,Bérêche Brut Réserve,Bérêche et Fils,Champagne Blend,Brut Réserve,,France,Champagne,,Champagne,,',
    '4,,,,1.5L,EUR,0,,,,303,Red,Red,Dry,2016,Pomerol,Château La Conseillante,Merlot,,,France,Bordeaux,,Pomerol,2026,2040',
  ].join('\n');
  const consumed = [
    'iConsumed,iWine,Type,Consumed,Size,ShortType,Price,ConsumptionNote,Location,Bin,Vintage,Wine,Producer,Color,Category,Appellation',
    '9,101,Red,11/8/2026,750ml,Drank from my cellar,16,,Cellar,B2,2020,Chinon,Domaine des Roches Neuves,Red,Dry,Chinon',
    '10,101,Red,2/14/2026,750ml,Spoiled (corked/oxidized) and returned to vendor,16,Bouchon,Cellar,B2,2020,Chinon,Domaine des Roches Neuves,Red,Dry,Chinon',
    '11,404,Red,9/20/2026,750ml,Gave away as a gift,,,Cellar,A1,2019,Barolo,Vajra,Red,Dry,Barolo',
  ].join('\n');
  const notes = [
    'iNote,iWine,Type,Vintage,Wine,Producer,TastingDate,Rating,TastingNotes',
    '50,101,Red,2020,Chinon,Domaine des Roches Neuves,11/9/2026,91,Parfait maintenant.',
    '51,505,White,2020,Le Mont,Huet,9/20/2026,88,Chez les Martin.',
  ].join('\n');

  it('reconnaît les dates, les raisons et les notes', () => {
    expect(dateOrder(['11/8/2026', '2/14/2026'])).toBe('mdy');
    expect(dateOrder(['20/09/2026'])).toBe('dmy');
    expect(ctDate('11/8/2026', 'mdy')).toBe('2026-11-08');
    expect(ctDate('2026-11-08 00:00', 'mdy')).toBe('2026-11-08');
    expect(ctReason('Spoiled (corked/oxidized) but not returned')).toEqual({ reason: 'defaut', where: '', detail: '' });
    expect(ctReason('Spoiled (corked/oxidized) and returned to vendor').detail).toBe('rapportée au caviste');
    expect(ctReason('Drank from a friend’s cellar'.replace('’', "'")).reason).toBe('exterieur');
    expect(ctReason('Missing or presumed drunk').reason).toBe('disparue');
    expect(scoreToStars(91)).toBe(4);
    expect(scoreToStars(96)).toBe(5);
  });

  it('prépare l’import : vins, stock, lieux, dégustations, autres sorties', () => {
    const plan = buildCtImport(
      [
        { name: 'inventory.csv', text: inventory },
        { name: 'consumed.csv', text: consumed },
        { name: 'notes.csv', text: notes },
      ],
      emptyCaveFile(),
    );
    expect(plan.files.map((f) => f.kind)).toEqual(['inventory', 'consumed', 'notes']);
    expect(plan.stats).toMatchObject({ wines: 3, bottles: 4, tastings: 2, exits: 2, noWindow: 1, elsewhere: 2, merged: 0 });
    expect(plan.locations.map((l) => [l.name, l.bottles, l.bins])).toEqual([
      ['Cellar', 2, ['B2']],
      ['Kitchen', 1, ['1']],
      ['', 1, []],
    ]);
    const chinon = plan.wines.find((w) => w.ctId === '101')!;
    expect(chinon).toMatchObject({ domaine: 'Domaine des Roches Neuves', cuvee: 'Terres de Chinon', vintage: 2020, appellation: 'Chinon', price: 16, from: 2023, to: 2026 });
    expect(chinon.history.map((x) => [x.date, x.reason, x.rating, x.comment])).toEqual([
      ['2026-11-08', 'bue', 4, 'Parfait maintenant.'],
      ['2026-02-14', 'defaut', null, 'Bouchon'],
    ]);
    const bulles = plan.wines.find((w) => w.ctId === '202')!;
    expect([bulles.color, bulles.vintage]).toEqual(['bulles', null]);
    expect(plan.wines.find((w) => w.ctId === '303')!.size).toBe('Magnum');
    expect(plan.wines.find((w) => w.ctId === '505')!.history[0]).toMatchObject({ reason: 'exterieur', rating: 3 });
  });

  it('écrit l’import avec les lieux renommés, sans doublon au 2e import', () => {
    const files = [
      { name: 'i.csv', text: inventory },
      { name: 'c.csv', text: consumed },
    ];
    let d = cave().d;
    const plan = buildCtImport(files, d);
    expect(plan.stats.merged).toBe(1); // le Chinon déjà en cave
    d = applyCtImport(d, plan, { Cellar: 'Cave', Kitchen: 'Armoire cuisine', '': '' });
    const chinon = d.wines.find((w) => w.domaine === 'Domaine des Roches Neuves')!;
    expect(chinon.stock).toEqual([{ place: 'Cave', shelf: 'B2', n: 2 }]);
    expect(chinon.history).toHaveLength(2);
    expect(d.wines.find((w) => w.ctId === '303')!.stock).toEqual([{ place: 'À ranger', shelf: '', n: 1 }]);
    const again = applyCtImport(d, buildCtImport(files, d), { Cellar: 'Cave', Kitchen: 'Armoire cuisine' });
    expect(again.wines).toHaveLength(d.wines.length);
    expect(again.wines.find((w) => w.id === chinon.id)!.history).toHaveLength(2);
  });
});
