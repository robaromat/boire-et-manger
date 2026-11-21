import { normalizeName } from './qty';
import type { HistoryEntry, RayonId } from './types';

// Dictionnaire local de classement par rayon. Aucun appel réseau.
// Mots-clés en français courant ; ils sont normalisés comme les noms d'articles
// (minuscules, sans accents, pluriels simples retirés), donc « Œufs » = « oeuf ».
// Règle de choix : le mot-clé qui commence le plus tôt dans le nom gagne (le nom principal
// est en tête en français : « yaourt à la fraise », « jus d'orange »), puis le plus long
// (« pomme de terre » plutôt que « pomme », « lait de coco » plutôt que « lait »).

const RAW: Record<Exclude<RayonId, 'div'>, string> = {
  fl: `
    abricot, ail, airelle, ananas, aneth, artichaut, asperge, aubergine, avocat, banane, basilic, betterave,
    blette, brocoli, butternut, cassis, celeri, celeri rave, cerfeuil, cerise, champignon, champignon de paris,
    chataigne, chou, chou fleur, chou kale, chou rouge, chou de bruxelles, chou chinois, ciboulette, citron,
    citron vert, citronnelle, clementine, coing, concombre, coriandre, cornichon frais, courge, courgette,
    cresson, echalote, endive, epinard, estragon, fenouil, feve, figue, fraise, framboise, fruit, fruit de la passion,
    gingembre, grenade, griotte, groseille, haricot vert, kaki, kiwi, laitue, legume, litchi, mache, mandarine,
    mangue, melon, menthe, mesclun, mirabelle, mure, myrtille, navet, nectarine, noix de coco fraiche, oignon,
    oignon nouveau, oignon rouge, orange, oseille, pamplemousse, panais, papaye, pasteque, patate douce, peche,
    persil, piment, pleurote, poire, poireau, pois gourmand, poivron, pomelo, pomme, pomme de terre, potimarron,
    potiron, prune, pousse, pousse d epinard, quetsche, radis, radis noir, raisin, reine claude, rhubarbe, romarin,
    roquette, rutabaga, salade, salsifis, sauge, shiitake, thym, tomate, tomate cerise, topinambour, laurier,
    feuille de laurier, girolle, cepe, chou romanesco, mais doux frais, physalis, citrouille, pak choi, kumquat,
    trevise, frisee, scarole, batavia, sucrine, pourpier, edamame frais, germe, gousse d ail, herbe, herbe fraiche
  `,
  boul: `
    pain, baguette, brioche, croissant, pain au chocolat, chocolatine, pain de mie, focaccia, fougasse, pain complet,
    pain aux cereales, pain de seigle, pain d epice, pain burger, pain pita, pita, tortilla, wrap, galette de ble,
    biscotte, pain grille, cracotte, chapelure, viennoiserie, tarte, gateau, cake, madeleine, muffin, cookie frais,
    chausson, pain au raisin, bagel, ciabatta, pain sans gluten, petit pain, crepe, gaufre, blini, pain naan, naan
  `,
  vrac: `
    farine, farine de ble, farine de sarrasin, farine de riz, fecule, maizena, pois chiche, lentille, lentille corail,
    lentille verte, haricot rouge, haricot blanc, haricot sec, flageolet, feve seche, pois casse, riz, riz basmati,
    riz complet, riz rond, risotto, arborio, pate, spaghetti, tagliatelle, penne, fusilli, coquillette, macaroni,
    lasagne, nouille, vermicelle, ramen, gnocchi, quinoa, boulgour, semoule, couscous, polenta, millet, sarrasin,
    avoine, flocon, flocon d avoine, muesli, granola, cereale, son d avoine, chia, graine, graine de chia,
    graine de lin, graine de courge, graine de tournesol, sesame, sucre, sucre de canne, sucre glace, sucre vanille,
    cassonade, rapadura, sirop d agave, sirop d erable, miel, confiture, compote, puree de fruit, pate a tartiner,
    nutella, puree d amande, puree de cacahuete, beurre de cacahuete, tahini, sel, fleur de sel, poivre, epice,
    cumin, curry, curcuma, paprika, cannelle, muscade, gingembre en poudre, herbe de provence, origan, piment d espelette,
    garam masala, ras el hanout, cardamome, clou de girofle, badiane, vanille, gousse de vanille, levure,
    levure boulangere, bicarbonate, poudre a lever, agar agar, huile, huile d olive, huile de colza, huile de tournesol,
    huile de sesame, huile de coco, vinaigre, vinaigre balsamique, vinaigre de cidre, moutarde, mayonnaise, ketchup,
    sauce soja, tamari, sauce tomate, coulis de tomate, passata, tomate pelee, concentre de tomate, pulpe de tomate,
    pesto, sauce, bouillon, cube, fond de veau, miso, nuoc mam, sriracha, harissa, tabasco, cornichon, capre, olive,
    tapenade, conserve, thon en boite, sardine, maquereau en boite, mais, petit pois en boite, haricot en boite,
    lait de coco, creme de coco, cafe, cafe en grain, cafe moulu, capsule, dosette, the, the vert, tisane, infusion,
    chicoree, chocolat, chocolat noir, chocolat au lait, chocolat patissier, cacao, pepite de chocolat, biscuit,
    gateau sec, cookie, sable, palet, petit beurre, speculoos, galette, barre de cereale, barre, chips, crackers,
    cracker, biscuit aperitif, cacahuete, amande, noisette, noix, noix de cajou, noix de pecan, pistache,
    noix du bresil, fruit sec, abricot sec, datte, figue seche, raisin sec, pruneau, cranberry, baie de goji, coco rapee,
    noix de coco rapee, galette de riz, galette de mais, pop corn, bonbon, chewing gum, cereale petit dejeuner,
    puree en flocon, soupe, veloute, levure maltee, proteine, seitan sec, proteine de soja, pain azyme, gelatine,
    arome, eau de fleur d oranger, extrait de vanille, sucre de coco, stevia, aide culinaire, croutons, nori, algue,
    wakame, sauce pesto, sauce curry, pate de curry, pate feuilletee seche
  `,
  cre: `
    lait, lait entier, lait demi ecreme, lait d avoine, lait d amande, lait de soja, lait de riz, boisson vegetale,
    boisson avoine, boisson soja, yaourt, yaourt nature, yaourt grec, yaourt vegetal, skyr, fromage blanc, faisselle,
    petit suisse, kefir, creme, creme fraiche, creme liquide, creme epaisse, creme dessert, creme de soja, beurre,
    beurre doux, beurre demi sel, margarine, oeuf, fromage, comte, emmental, gruyere, beaufort, cantal, mimolette,
    gouda, edam, cheddar, raclette, reblochon, tomme, morbier, saint nectaire, camembert, brie, coulommier,
    munster, maroilles, roquefort, bleu, gorgonzola, chevre, buchette, crottin, feta, halloumi, mozzarella, burrata,
    ricotta, mascarpone, parmesan, grana padano, pecorino, fromage rape, cancoillotte, saint marcellin,
    fromage frais, cream cheese, philadelphia, boursin, carre frais, kiri, vache qui rit, raclette, fondue,
    flan, riz au lait, mousse au chocolat, panna cotta, pate brisee, pate feuilletee, pate sablee, pate a pizza,
    dessert vegetal, compote fraiche, tofu soyeux
  `,
  trait: `
    tofu, tofu fume, tofu ferme, tempeh, seitan, falafel, steak vegetal, galette vegetale, houmous, tzatziki,
    taboule, guacamole, caviar d aubergine, poulet, blanc de poulet, cuisse de poulet, escalope, dinde, canard,
    magret, boeuf, steak, steak hache, viande hachee, roti, bourguignon, veau, porc, cote de porc, filet mignon,
    agneau, gigot, merguez, chipolata, saucisse, saucisse de strasbourg, knacki, saucisson, chorizo, jambon,
    jambon blanc, jambon cru, bacon, lardon, pate de campagne, rillette, terrine, foie gras, poisson, saumon, saumon fume, truite,
    cabillaud, colin, lieu, merlu, thon, dorade, bar, maquereau, sardine fraiche, crevette, moule, huitre,
    saint jacques, calamar, surimi, oeufs de lump, tarama, quiche, pizza fraiche, lasagne fraiche, ravioli,
    raviole, tortellini, gnocchi frais, pates fraiches, sushi, nem, samoussa, plat prepare, salade composee,
    sandwich, wrap garni, croque monsieur, cordon bleu, nugget, boulette, kebab, gyoza
  `,
  boi: `
    eau, eau gazeuse, eau petillante, perrier, badoit, san pellegrino, jus, jus d orange, jus de pomme,
    jus de raisin, jus multifruit, nectar, smoothie, limonade, soda, coca, cola, orangina, ice tea, the glace,
    sirop, kombucha, kefir de fruit, biere, biere sans alcool, cidre, vin, vin rouge, vin blanc, vin rose,
    champagne, cremant, prosecco, porto, rhum, whisky, vodka, gin, pastis, aperitif, liqueur, ginger beer,
    tonic, boisson energisante, eau de coco
  `,
  surg: `
    surgele, glace, creme glacee, sorbet, esquimau, cornet, batonnet glace, buche glacee, petits pois, frite,
    potatoe, pomme noisette, pizza, poelee, poelee de legume, legume surgele, epinard hache, haricot vert surgele,
    fruit rouge surgele, glacon, poisson pane, pane de poisson, fruit surgele, galette surgelee, nugget surgele,
    feuillete, mini pizza, croissant surgele, hachis parmentier, gratin, lasagne surgelee, wok de legume,
    soupe surgelee, legume pour soupe, herbe surgelee, persil surgele, pave de saumon surgele
  `,
  hyg: `
    moule a tarte, moule a gateau, moule a cake, moule a manque, moule a muffin, moule a cannele, moule a charlotte,
    moule a souffle, moule a madeleine, moule a kouglof, moule a savarin, moule a tartelette, moule en silicone, moule silicone,
    papier cuisson, film alimentaire, papier aluminium, papier alu, sac congelation, sachet congelation,
    savon, savon de marseille, savon noir, gel douche, shampoing, apres shampoing, dentifrice, brosse a dent,
    fil dentaire, bain de bouche, deodorant, creme hydratante, creme solaire, coton, coton tige, demaquillant,
    rasoir, mousse a raser, serviette hygienique, tampon, cup, protege slip, mouchoir, papier toilette, essuie tout,
    sopalin, lessive, adoucissant, detachant, liquide vaisselle, produit vaisselle, pastille lave vaisselle,
    tablette lave vaisselle, sel regenerant, liquide de rincage, eponge, lavette, serpillere, sac poubelle,
    nettoyant, nettoyant multi usage, vinaigre blanc, bicarbonate de soude, cristaux de soude, javel, desinfectant,
    anticalcaire, papier aluminium, aluminium, film alimentaire, papier cuisson, sac congelation, boite de conservation,
    allumette, bougie, pile, ampoule, couche, lingette, gant, insecticide, desodorisant, cire, cotons demaquillant,
    baume, huile essentielle, vernis, maquillage, lime a ongle, pansement, serviette en papier, nappe, gobelet,
    assiette en carton, paille, cure dent, filtre a cafe, sac de course, litiere, croquette, patee, nourriture chat,
    nourriture chien
  `,
};

interface Key {
  words: string[];
  r: RayonId;
}

const KEYS: Key[] = [];
for (const [r, block] of Object.entries(RAW) as [RayonId, string][]) {
  for (const raw of block.split(',')) {
    const k = normalizeName(raw);
    if (k) KEYS.push({ words: k.split(' '), r });
  }
}

/** Nombre de mots-clés (pour les tests et l'info). */
export const DICT_SIZE = KEYS.length;

/** Rayon d'après le dictionnaire seul, ou null si aucun mot-clé ne correspond. */
export function classifyByDict(name: string): RayonId | null {
  const words = normalizeName(name).split(' ').filter(Boolean);
  let best: { start: number; len: number; r: RayonId } | null = null;
  for (const k of KEYS) {
    const n = k.words.length;
    for (let i = 0; i + n <= words.length; i++) {
      if (best && i > best.start) break;
      let ok = true;
      for (let j = 0; j < n; j++) if (words[i + j] !== k.words[j]) { ok = false; break; }
      if (!ok) continue;
      if (!best || i < best.start || (i === best.start && n > best.len)) best = { start: i, len: n, r: k.r };
      break;
    }
  }
  return best?.r ?? null;
}

/** Rayon d'un article : d'abord ce que l'historique a appris (corrections de Robin), puis le dictionnaire, sinon Divers. */
export function classify(name: string, history: Record<string, HistoryEntry>): RayonId {
  return history[normalizeName(name)]?.rayon ?? classifyByDict(name) ?? 'div';
}
