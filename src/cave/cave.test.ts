import { describe, expect, it } from 'vitest';
import { applyCtImport, buildCtImport, ctDate, decodeEntities, ctReason, dateOrder, frCountry, frRegion, scoreTo10 } from './cellartracker';
import { migrateRating, ratingFromComment } from './rating';
import { csvRecords, decodeText, parseCsv } from './csv';
import { draftFromLabel, type LabelRead } from './label';
import { mergeCave } from './merge';
import {
  addStock, addWine, bottles, knownWines, cellarPlan, setStock, placeOptions, setPlaces, shelfOptions, renamePlace, bottlesIn, passFilter, filterChoices, onlyPlace, NO_FILTER, drinkGroups, emptyWineDraft, findSame, matchWine, removeExit, takeBottle, tastings, wineName,
  type WineDraft,
} from './ops';
import { DEFAULT_PLACES, emptyCaveFile, parseCaveFile, type CaveFile } from './types';

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
    organic: true,
    biodynamic: false,
    no_added_sulfites: true,
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
    expect(d.labels).toEqual(['bio', 'sans-sulfites']);
    expect(d.estimated.sort()).toEqual(['grapes', 'labels', 'pairings', 'region', 'style', 'window']);
  });

  it('« Compléter » ne remplace pas ce qui est déjà saisi', () => {
    const d = draftFromLabel(read, recipes, draft({ domaine: 'Chave', grapes: 'Syrah', from: 2026, to: 2032, vintage: 2021 }));
    expect(d.domaine).toBe('Chave');
    expect(d.vintage).toBe(2021);
    expect(d.grapes).toBe('Syrah');
    expect([d.from, d.to]).toEqual([2026, 2032]);
    expect(d.estimated).not.toContain('window');
    expect(d.estimated).not.toContain('grapes');
    const checked = draftFromLabel(read, recipes, draft({ labels: ['biodynamie'] }));
    expect(checked.labels).toEqual(['biodynamie']);
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
  it('décode les entités HTML des exports', () => {
    expect(decodeEntities('Sams&#333; Cinsault')).toBe('Samsō Cinsault');
    expect(decodeEntities('Diszn&#x151;k&#337;')).toBe('Disznőkő');
    expect(decodeEntities('l&apos;apéritif &lt;20 mg &amp; co')).toBe("l'apéritif <20 mg & co");
    expect(decodeEntities('R&D &inconnu;')).toBe('R&D &inconnu;');
  });
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
    expect(scoreTo10(91)).toBe(9);
    expect(scoreTo10(87)).toBe(8.5);
    expect(scoreTo10(8)).toBe(8);
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
      ['2026-11-08', 'bue', 9, 'Parfait maintenant.'],
      ['2026-02-14', 'defaut', null, 'Bouchon'],
    ]);
    const bulles = plan.wines.find((w) => w.ctId === '202')!;
    expect([bulles.color, bulles.vintage]).toEqual(['bulles', null]);
    expect(plan.wines.find((w) => w.ctId === '303')!.size).toBe('Magnum');
    expect(plan.wines.find((w) => w.ctId === '505')!.history[0]).toMatchObject({ reason: 'exterieur', rating: 9 });
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

describe('cave : caves et clayettes réglées', () => {
  it('par défaut Sens (aucune, 0 à 5), Bozel et En attente', () => {
    const d = emptyCaveFile();
    expect(placeOptions(d)).toEqual(['Sens', 'Bozel', 'En attente']);
    expect(shelfOptions(d, 'Sens')).toEqual(['', '0', '1', '2', '3', '4', '5']);
    expect(shelfOptions(d, 'Bozel')).toEqual(['']);
  });

  it('garde dans les listes les emplacements encore utilisés (import)', () => {
    let d = setPlaces(emptyCaveFile(), [{ name: 'Sens', shelves: ['1'] }]);
    d = addWine(d, draft({ domaine: 'X' }), [{ place: 'Cellar', shelf: 'B2', n: 1 }, { place: 'Sens', shelf: '9', n: 1 }]).data;
    expect(placeOptions(d)).toEqual(['Sens', 'Cellar']);
    expect(shelfOptions(d, 'Sens')).toEqual(['', '1', '9']);
    expect(shelfOptions(d, 'Cellar')).toEqual(['', 'B2']);
  });

  it('relecture et fusion des caves réglées', () => {
    expect(parseCaveFile({ schemaVersion: 1, wines: [], places: [{ name: ' Sens ', shelves: ['0', ' '] }, { name: '' }] })?.places).toEqual([{ name: 'Sens', shelves: ['0'] }]);
    expect(parseCaveFile({ schemaVersion: 1, wines: [] })?.places).toBeUndefined();
    const base = emptyCaveFile();
    const local = setPlaces(base, [...DEFAULT_PLACES, { name: 'Lyon', shelves: [] }]);
    expect(mergeCave(base, local, base).places?.map((p) => p.name)).toEqual(['Sens', 'Bozel', 'En attente', 'Lyon']);
    expect(mergeCave(base, base, local).places?.map((p) => p.name)).toContain('Lyon');
  });

  it('renommer une cave déplace ses bouteilles avec elle', () => {
    let d = addWine(emptyCaveFile(), draft({ domaine: 'X' }), [{ place: 'Sens', shelf: '2', n: 3 }]).data;
    d = renamePlace(d, 'sens', 'Sens (maison)');
    expect(d.wines[0]!.stock).toEqual([{ place: 'Sens (maison)', shelf: '2', n: 3 }]);
    expect(bottlesIn(d, 'Sens (maison)')).toBe(3);
  });

  it('cherche aussi par classification', () => {
    expect(matchWine({ ...draft({ domaine: 'Gramenon', labels: ['bio'] }) }, 'bio')).toBe(true);
  });
});

describe('CellarTracker : exports réels (My Cellar, Wish List)', () => {
  it('My Cellar sans emplacement, fenêtres 9999, sans soufre, liste d’envies', () => {
    const cellar = [
      'iWine,Type,Color,Category,Size,Currency,Value,Price,TotalQuantity,Quantity,Pending,Vintage,Wine,Locale,Producer,Varietal,MasterVarietal,Designation,Vineyard,Country,Region,SubRegion,Appellation,BeginConsume,EndConsume',
      '769061,White - Sparkling,White,Sparkling,750ml,EUR,"48,57","43",2,2,0,1001,Drappier Champagne Brut Nature Zero Dosage Sans Ajout de Soufre,"France, Champagne",Drappier,Pinot Noir,Pinot Noir,Brut Nature Zero Dosage Sans Ajout de Soufre,Unknown,France,Champagne,Unknown,Champagne,2023,2026',
      '4593088,Red,Red,Dry,750ml,EUR,"25,5","0",1,1,0,2019,Stéphanie Colinot Irancy Côte du Moutier,"France, Burgundy",Stéphanie Colinot,Pinot Blend,Pinot Noir,Côte du Moutier,Unknown,France,Burgundy,Côtes d’Auxerre,Irancy,9999,9999',
    ].join(String.fromCharCode(10));
    const wish = [
      'iWine,iTaggedWine,ListName,Vintage,Type,Wine,Locale,Color,Category,Varietal,MasterVarietal,Designation,Vineyard,Country,Region,SubRegion,Appellation,Size,Notes,BeginConsume,EndConsume',
      '1446996,1225809,*Wishlist,2009,Red,Domaine Brazey Pascal et Fils Mercurey Les Montots,"France, Burgundy",Red,Dry,Pinot Noir,Pinot Noir,Unknown,Les Montots,France,Burgundy,Côte Chalonnaise,Mercurey,750ml,"Bu chez plume",2013,2016',
    ].join(String.fromCharCode(10));
    const plan = buildCtImport([{ name: 'My Cellar.csv', text: cellar }, { name: 'My Wish List.csv', text: wish }], emptyCaveFile());
    expect(plan.files.map((f) => f.kind)).toEqual(['inventory', 'wishlist']);
    const drap = plan.wines.find((w) => w.ctId === '769061')!;
    expect([drap.labels, drap.price, drap.stock]).toEqual([['sans-sulfites'], 43, [{ place: '', shelf: '', n: 2 }]]);
    const irancy = plan.wines.find((w) => w.ctId === '4593088')!;
    expect([irancy.from, irancy.to, irancy.price]).toEqual([null, null, null]);
    expect(plan.wishes.map((e) => [e.domaine, e.cuvee, e.appellation, e.why])).toEqual([['Domaine Brazey Pascal et Fils', 'Les Montots', 'Mercurey', '2009 · Bu chez plume']]);
    const d = applyCtImport(emptyCaveFile(), plan, { '': 'En attente' });
    expect(d.wines.find((w) => w.ctId === '769061')!.stock).toEqual([{ place: 'En attente', shelf: '', n: 2 }]);
    expect(d.wishes).toHaveLength(1);
    expect(buildCtImport([{ name: 'w.csv', text: wish }], d).wishes).toHaveLength(0);
  });
});

describe('cave : filtres de la recherche', () => {
  it('couleur, région, appellation, cave', () => {
    let d = emptyCaveFile();
    d = addWine(d, draft({ domaine: 'A', color: 'rouge', region: 'Bordeaux', appellation: 'Margaux' }), [{ place: 'Sens', shelf: '1', n: 3 }, { place: 'Bozel', shelf: '', n: 1 }]).data;
    d = addWine(d, draft({ domaine: 'B', color: 'blanc', region: 'Bourgogne', appellation: 'Chablis' }), [{ place: 'Sens', shelf: '2', n: 2 }]).data;
    const [b, a] = d.wines;
    expect(passFilter(a!, { ...NO_FILTER, color: 'rouge' })).toBe(true);
    expect(passFilter(b!, { ...NO_FILTER, color: 'rouge' })).toBe(false);
    expect(passFilter(a!, { ...NO_FILTER, region: 'bordeaux', appellation: 'MARGAUX' })).toBe(true);
    expect(passFilter(b!, { ...NO_FILTER, place: 'Bozel' })).toBe(false);
    expect(passFilter(a!, { ...NO_FILTER, place: 'Bozel' })).toBe(true);
    expect(passFilter(a!, { ...NO_FILTER, place: 'Bozel' }, { place: 'Sens' })).toBe(false);
    expect(passFilter(a!, { ...NO_FILTER, place: 'Bozel' }, null)).toBe(false);
    expect(onlyPlace(d.wines, 'Bozel').map((w) => [w.domaine, w.stock])).toEqual([['A', [{ place: 'Bozel', shelf: '', n: 1 }]]]);
    const c = filterChoices(d.wines);
    expect(c.places).toEqual([['Sens', 5], ['Bozel', 1]]);
    expect(c.regions).toEqual([['Bordeaux', 4], ['Bourgogne', 2]]);
  });
});

describe('CellarTracker : régions en français', () => {
  it('traduit les régions et pays connus, garde les autres', () => {
    expect([frRegion('Burgundy'), frRegion('Loire Valley'), frRegion('Rhône'), frRegion('Southwest France'), frRegion("Valle d'Aosta"), frRegion('Mars')]).toEqual([
      'Bourgogne', 'Loire', 'Rhône', 'Sud-Ouest', 'Vallée d’Aoste', 'Mars',
    ]);
    expect([frCountry('Italy'), frCountry('France')]).toEqual(['Italie', 'France']);
  });
});

describe('cave : rapports', () => {
  it('fenêtres, couleurs, top, sorties par an', async () => {
    const { windowBuckets, byColor, top, exitsPerYear } = await import('./reports');
    let d = emptyCaveFile();
    d = addWine(d, draft({ domaine: 'A', color: 'rouge', region: 'Bordeaux', grapes: 'Merlot, cabernet', from: 2020, to: 2025 }), [{ place: 'Sens', shelf: '1', n: 3 }]).data;
    d = addWine(d, draft({ domaine: 'B', color: 'blanc', region: 'Loire', grapes: 'Chenin', from: 2024, to: 2026 }), [{ place: 'Bozel', shelf: '', n: 2 }]).data;
    d = addWine(d, draft({ domaine: 'C', color: 'rouge', region: 'Bordeaux', from: 2028, to: 2040 }), [{ place: 'Sens', shelf: '2', n: 1 }]).data;
    d = addWine(d, draft({ domaine: 'D', color: 'bulles' }), [{ place: 'Sens', shelf: '', n: 4 }]).data;
    const wb = windowBuckets(d.wines, 2026);
    expect(wb.map((b) => b.n)).toEqual([3, 2, 0, 0, 0, 1, 4]);
    expect(byColor(d.wines)).toEqual([{ color: 'rouge', n: 4 }, { color: 'blanc', n: 2 }, { color: 'bulles', n: 4 }]);
    expect(top(d.wines, 'region')).toEqual([{ label: 'Bordeaux', n: 4 }, { label: 'Loire', n: 2 }]);
    expect(top(d.wines, 'grapes')[0]).toEqual({ label: 'Merlot', n: 3 });
    expect(top(d.wines, 'place')).toEqual([{ label: 'Sens', n: 8 }, { label: 'Bozel', n: 2 }]);
    expect(top(d.wines, 'region', 1)).toEqual([{ label: 'Autres', n: 6 }]);
    const a = d.wines.find((w) => w.domaine === 'A')!;
    let e = takeBottle(d, a.id, { ...exit, date: '2024-05-01', from: { place: 'Sens', shelf: '1' } }).data;
    e = takeBottle(e, a.id, { ...exit, date: '2026-01-01', reason: 'offerte', from: { place: 'Sens', shelf: '1' } }).data;
    e = takeBottle(e, a.id, { ...exit, date: '2026-02-01', reason: 'exterieur' }).data;
    expect(exitsPerYear(e.wines)).toEqual([
      { year: 2024, drunk: 1, other: 0 },
      { year: 2025, drunk: 0, other: 0 },
      { year: 2026, drunk: 0, other: 1 },
    ]);
  });
});

describe('cave : achats et évolution', () => {
  it('note une entrée quand on ajoute des bouteilles, pas quand on en retire', () => {
    let d = emptyCaveFile();
    const a = addWine(d, draft({ domaine: 'A', price: 12 }), [{ place: 'Sens', shelf: '1', n: 3 }]);
    d = a.data;
    expect(d.wines[0]!.purchases).toMatchObject([{ n: 3, price: 12 }]);
    d = addStock(d, a.id, [{ place: 'Sens', shelf: '2', n: 2 }]);
    expect(d.wines[0]!.purchases!.map((p) => p.n).sort()).toEqual([2, 3]);
    d = setStock(d, a.id, [{ place: 'Sens', shelf: '1', n: 1 }]);
    expect(d.wines[0]!.purchases).toHaveLength(2);
    d = setStock(d, a.id, [{ place: 'Sens', shelf: '1', n: 4 }]);
    expect(d.wines[0]!.purchases!.map((p) => p.n).sort()).toEqual([2, 3, 3]);
    // Un vin noté sans stock (bu ailleurs) n'a pas d'entrée.
    expect(addWine(d, draft({ domaine: 'B' })).data.wines[0]!.purchases).toBeUndefined();
  });

  it('relit les achats importés (ctId comme identifiant) et les fusionne d’un appareil à l’autre', () => {
    const raw = {
      schemaVersion: 1,
      wines: [{ id: 'w1', stock: [], history: [], purchases: [{ date: '2024-07-04', n: 11, price: 39, note: 'Vinissimus', ctId: 'p:1' }, { date: 'x', n: 1 }], updatedAt: '2026-01-01' }],
      wishes: [],
    };
    const d = parseCaveFile(raw)!;
    expect(d.wines[0]!.purchases).toEqual([{ id: 'p:1', date: '2024-07-04', n: 11, price: 39, note: 'Vinissimus', ctId: 'p:1' }]);
    const p2 = { id: 'p_2', date: '2026-11-21', n: 2, price: null, note: '' };
    const p3 = { id: 'p_3', date: '2026-11-22', n: 1, price: null, note: '' };
    const l: CaveFile = { ...d, wines: [{ ...d.wines[0]!, purchases: [p2, ...d.wines[0]!.purchases!], updatedAt: '2026-11-21' }] };
    const r: CaveFile = { ...d, wines: [{ ...d.wines[0]!, purchases: [p3, ...d.wines[0]!.purchases!], updatedAt: '2026-11-22' }] };
    expect(mergeCave(d, l, r).wines[0]!.purchases!.map((p) => p.id)).toEqual(['p_3', 'p_2', 'p:1']);
  });

  it('importe l’export « Purchases » de CellarTracker sans le prendre pour du stock', () => {
    const csv = [
      'iWine,iPurchase,PurchaseDate,DeliveryDate,StoreName,Currency,Price,Quantity,Remaining,OrderNumber,Vintage,Wine,Producer,Type',
      '42,900,04/07/2026,04/07/2026,Unknown,EUR,39,11,10,Vinissimus,1001,Famille Moussé Champagne,Famille Moussé,White - Sparkling',
      '42,901,27/06/2025,27/06/2025,Unknown,EUR,0,1,0,Offert Clémence,1001,Famille Moussé Champagne,Famille Moussé,White - Sparkling',
    ].join('\n');
    let d = emptyCaveFile();
    const a = addWine(d, draft({ domaine: 'Famille Moussé', color: 'bulles' }), [{ place: 'Sens', shelf: '', n: 10 }]);
    d = { ...a.data, wines: a.data.wines.map((w) => ({ ...w, ctId: '42', purchases: [] })) };
    const plan = buildCtImport([{ name: 'My Purchases.csv', text: csv }], d);
    expect(plan.files[0]!.kind).toBe('purchases');
    expect(plan.stats.bottles).toBe(0);
    expect(plan.stats.purchases).toBe(2);
    const out = applyCtImport(d, plan, {});
    const w = out.wines[0]!;
    expect(bottles(w)).toBe(10);
    expect(w.purchases).toEqual([
      { id: 'p:900', date: '2026-07-04', n: 11, price: 39, note: 'Vinissimus', ctId: 'p:900' },
      { id: 'p:901', date: '2025-06-27', n: 1, price: null, note: 'Offert Clémence', ctId: 'p:901' },
    ]);
    // Réimporter n'ajoute rien.
    expect(applyCtImport(out, buildCtImport([{ name: 'My Purchases.csv', text: csv }], out), {}).wines[0]!.purchases).toHaveLength(2);
  });

  it('retrace le stock en fin d’année à rebours depuis aujourd’hui', async () => {
    const { stockPerYear } = await import('./reports');
    let d = emptyCaveFile();
    const a = addWine(d, draft({ domaine: 'A' }), [{ place: 'Sens', shelf: '', n: 5 }]);
    d = { ...a.data, wines: a.data.wines.map((w) => ({ ...w, purchases: [{ id: 'p1', date: '2023-03-01', n: 6, price: null, note: '' }, { id: 'p2', date: '2025-05-01', n: 2, price: null, note: '' }] })) };
    d = takeBottle(d, a.id, { ...exit, date: '2024-06-01', from: { place: 'Sens', shelf: '' } }).data;
    d = takeBottle(d, a.id, { ...exit, date: '2026-02-01', reason: 'offerte', from: { place: 'Sens', shelf: '' } }).data;
    d = takeBottle(d, a.id, { ...exit, date: '2026-03-01', reason: 'exterieur' }).data;
    // Stock actuel : 3. À rebours : fin 2025 = 3 + 1 sortie 2026 = 4 ; fin 2024 = 4 − 2 entrées 2025 = 2 ; fin 2023 = 2 + 1 sortie 2024 = 3.
    // (Les achats ne collent pas au stock de départ : c'est voulu, le stock réel d'aujourd'hui fait foi.)
    expect(stockPerYear(d.wines, 2026)).toEqual([
      { year: 2023, added: 6, removed: 0, end: 3 },
      { year: 2024, added: 0, removed: 1, end: 2 },
      { year: 2025, added: 2, removed: 0, end: 4 },
      { year: 2026, added: 0, removed: 1, end: 3 },
    ]);
    expect(stockPerYear(emptyCaveFile().wines, 2026)).toEqual([]);
  });
});

describe('cave : notes sur 10', () => {
  it('lit la note écrite dans un commentaire', () => {
    const cases: [string, number | null][] = [
      ['7/10', 7], ['9/10.tres bien', 9], ['6,5/10. pas désagréable', 6.5], ['Pas mal. Très mineral. 8/10', 8],
      ['Très bien. Assez sucré, parfait en apero , 9/10.', 9], ['7', 7], ['5. Fort en sulfites', 5], ['8.5' + String.fromCharCode(10) + 'Très bon', 8.5],
      ['7.5 bien', 7.5], ['7 pas mal mais un peu vieux', 7], ['Bien ! 8.5', 8.5], ['10/10', 10],
      ['cadeau hubert noel 2019', null], ['Noël 2020.pas mal', null], ['Anni 30 ans la tête dans les olives', null], ['2023 · très bien', null],
    ];
    for (const [c, n] of cases) expect(ratingFromComment(c), c).toBe(n);
  });
  it('convertit les anciennes étoiles, la note « /10 » écrite l’emporte', () => {
    expect(migrateRating(4, '')).toBe(8);
    expect(migrateRating(2, 'Bien 8/10')).toBe(8);
    expect(migrateRating(null, '7.5 bien')).toBe(7.5);
    expect(migrateRating(3, 'Mieux sur saumon' + String.fromCharCode(10) + '1')).toBe(6);
    expect(migrateRating(null, 'cadeau')).toBeNull();
  });
  it('convertit un ancien cave.json une seule fois', () => {
    const exit = (rating: number | null, comment: string) => ({ id: 'x_1', date: '2024-01-01', reason: 'bue', rating, comment, dish: '', where: '', detail: '' });
    const wine = (h: object[]) => ({ id: 'w_1', domaine: 'D', stock: [], history: h });
    const old = parseCaveFile({ schemaVersion: 1, wines: [wine([exit(4, ''), exit(null, '6/10')])], wishes: [] })!;
    expect(old.ratingScale).toBe(10);
    expect(old.wines[0]!.history.map((x) => x.rating)).toEqual([8, 6]);
    const again = parseCaveFile(JSON.parse(JSON.stringify(old)))!;
    expect(again.wines[0]!.history.map((x) => x.rating)).toEqual([8, 6]);
  });
});

describe('cave : filtre par note', () => {
  it('garde les vins dont la moyenne (ou la dégustation) atteint la note', () => {
    const ex = (rating: number | null) => ({ id: 'x_' + rating, date: '2024-01-01', reason: 'bue' as const, rating, comment: '', dish: '', where: '', detail: '' });
    const w = { ...parseCaveFile({ schemaVersion: 1, ratingScale: 10, wines: [{ id: 'w_1', domaine: 'D', stock: [], history: [ex(8), ex(7)] }], wishes: [] })!.wines[0]! };
    expect(passFilter(w, { ...NO_FILTER, minRating: 7 })).toBe(true);
    expect(passFilter(w, { ...NO_FILTER, minRating: 8 })).toBe(false);
    expect(passFilter(w, { ...NO_FILTER, minRating: 8 }, undefined, 8)).toBe(true);
    expect(passFilter({ ...w, history: [] }, { ...NO_FILTER, minRating: 5 })).toBe(false);
  });
});

describe('cave : vins déjà eus (saisie à la main)', () => {
  it('retrouve un domaine sans accents ni majuscules, une ligne par cuvée, sans millésime', () => {
    let d = emptyCaveFile();
    d = addWine(d, { ...emptyWineDraft(), domaine: 'Château Labégorce', appellation: 'Margaux', vintage: 2012, from: 2019, to: 2030, grapes: 'Merlot' }, []).data;
    d = addWine(d, { ...emptyWineDraft(), domaine: 'Château Labégorce', appellation: 'Margaux', vintage: 2015 }, []).data;
    d = addWine(d, { ...emptyWineDraft(), domaine: 'Domaine Lapierre', cuvee: 'Morgon', color: 'rouge' }, []).data;
    const r = knownWines(d, 'labeg');
    expect(r).toHaveLength(1);
    expect(r[0]!.draft).toMatchObject({ domaine: 'Château Labégorce', appellation: 'Margaux', vintage: null, from: null, to: null });
    expect(r[0]!.vintages).toEqual([2015, 2012]);
    expect(knownWines(d, 'morgon')[0]!.draft.domaine).toBe('Domaine Lapierre');
    expect(knownWines(d, 'l')).toEqual([]);
  });
});
