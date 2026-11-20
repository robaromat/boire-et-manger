import { useEffect, useState } from 'preact/hooks';
import '../../styles/recettes.css';
import { Icon } from '../../components/Icon';
import { sheetsSettled } from '../../components/Sheet';
import { Snack, showSnack } from '../../components/Snack';
import { saveNewRecipe } from '../../recettes/actions';
import { back, navigate } from '../../router';
import { consumeSharedLink, sharedLink } from '../../share';
import { recipesEngine } from '../../sync/store';
import { AddSheet, type AddResult } from './AddSheet';
import { Home } from './Home';
import { Page } from './Page';

// Onglet Recettes : l'accueil du carnet, et la fiche ouverte (#/recettes/r_…).
// Sur un écran large (Fold déplié), les deux côte à côte.

export function Recettes({ openId }: { openId?: string }) {
  const e = recipesEngine.value;
  const data = e?.data.value ?? null;
  const [add, setAdd] = useState<{ link?: string } | null>(null);
  const [coursesFor, setCoursesFor] = useState<string | null>(null);
  const recipe = openId ? data?.recipes.find((r) => r.id === openId) : undefined;

  const open = (id: string) => {
    if (openId) navigate({ name: 'tab', tab: 'recettes', sub: id }, { replace: true });
    else navigate({ name: 'tab', tab: 'recettes', sub: id });
  };
  const close = () => back({ name: 'tab', tab: 'recettes' });

  // Lien de recette reçu par le menu Partager : lecture directe, dès que le carnet est chargé.
  const shared = sharedLink.value;
  useEffect(() => {
    if (!shared || !data) return;
    consumeSharedLink();
    setAdd({ link: shared });
  }, [shared, !!data]);

  // Fiche supprimée (ou absente sur cet appareil) : retour à l'accueil.
  useEffect(() => {
    if (openId && data && !recipe) navigate({ name: 'tab', tab: 'recettes' }, { replace: true });
  }, [openId, !!data, !!recipe]);

  const onSave = async (r: AddResult) => {
    setAdd(null);
    try {
      const id = await saveNewRecipe(r.draft, { sourceFile: r.sourceFile, coverFile: r.coverFile });
      await sheetsSettled();
      if (r.alsoCourses) setCoursesFor(id);
      open(id);
      showSnack('Recette enregistrée dans ton carnet');
    } catch {
      showSnack('Photo illisible : la recette n’a pas été enregistrée.');
    }
  };

  return (
    <div class="rec" data-open={recipe ? '' : undefined}>
      <Home data={data} openId={recipe?.id} onOpen={open} onAdd={() => setAdd({})} />
      <div class="rec-page">
        {recipe ? (
          <Page key={recipe.id} r={recipe} onBack={close} startCourses={coursesFor === recipe.id} />
        ) : (
          <div class="rec-page-empty">
            <div>
              <Icon name="book" />
              <p>Choisis une recette à gauche.</p>
            </div>
          </div>
        )}
      </div>
      {add && <AddSheet initialLink={add.link} onClose={() => setAdd(null)} onSave={(r) => void onSave(r)} />}
      <Snack />
    </div>
  );
}
