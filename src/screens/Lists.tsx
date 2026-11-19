import { useEffect, useRef, useState } from 'preact/hooks';
import '../styles/lists.css';
import { Icon } from '../components/Icon';
import { Snack, showSnack } from '../components/Snack';
import { Topbar } from '../components/Topbar';
import { classify } from '../model/dict';
import {
  addEntries, createList, deleteList, finishShopping, habituels, moveItem, removeItem, renameList, suggestions,
  toggleItem, updateItem, type Entry,
} from '../model/lists';
import { formatQty, parseEntries, parseEntry } from '../model/qty';
import { RAYONS, type DataFile, type HistoryEntry, type Item, type ShopList } from '../model/types';
import { navigate } from '../router';
import { engine, mutate } from '../sync/store';
import { ItemSheet } from './ItemSheet';
import { ListSheet } from './ListSheet';

// Écran principal (maquette v1) : onglets magasins, articles rangés par rayon, panier, saisie rapide en bas.

const LAST_LIST_KEY = 'courses.lastList';
const CART_OPEN_KEY = 'courses.cartOpen';
const readLocal = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeLocal = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* stockage indisponible : simple confort perdu */
  }
};

const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

/** Applique une modification et propose « Annuler » (retour à l'état d'avant). */
function mutateWithUndo(fn: (d: DataFile) => DataFile, text: string) {
  const before = engine.value?.data.value;
  mutate(fn);
  if (before) showSnack(text, () => mutate(() => before));
}

type SheetState = { kind: 'item'; id: string } | { kind: 'newList' } | { kind: 'list'; id: string } | null;

export function Lists() {
  const e = engine.value;
  const d = e?.data.value;
  const error = e?.error.value;
  const [currentId, setCurrentId] = useState<string | null>(() => readLocal(LAST_LIST_KEY));
  const [cartOpen, setCartOpen] = useState(() => readLocal(CART_OPEN_KEY) !== '0');
  const [sheet, setSheet] = useState<SheetState>(null);
  const [flashIds, setFlashIds] = useState<string[]>([]);
  const mainRef = useRef<HTMLDivElement>(null);

  const list: ShopList | undefined = d?.lists.find((l) => l.id === currentId) ?? d?.lists[0];

  const selectList = (id: string) => {
    setCurrentId(id);
    writeLocal(LAST_LIST_KEY, id);
    mainRef.current?.scrollTo({ top: 0 });
  };

  // Met en évidence les articles qui viennent d'être ajoutés, et les fait défiler à l'écran.
  useEffect(() => {
    if (!flashIds.length) return;
    const el = mainRef.current?.querySelector(`[data-id="${flashIds[flashIds.length - 1]}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const t = setTimeout(() => setFlashIds([]), 1300);
    return () => clearTimeout(t);
  }, [flashIds]);

  const newListSheet = d && sheet?.kind === 'newList' && (
    <ListSheet
      onClose={() => setSheet(null)}
      onSubmit={(name) => {
        let id = '';
        mutate((cur) => {
          const r = createList(cur, name);
          id = r.id;
          return r.data;
        });
        if (id) selectList(id);
        setSheet(null);
      }}
    />
  );

  if (!d || !list) {
    return (
      <div class="shop">
        <Topbar title="Courses" />
        <div class="shop-main">
          {!d && !error && <p class="empty">Chargement des listes…</p>}
          {!d && error && (
            <div class="empty" role="alert">
              <b>Impossible de charger les listes</b>
              {error}
              <p>
                <button class="btn" onClick={() => navigate({ name: 'settings' })}>
                  Ouvrir les réglages
                </button>
              </p>
            </div>
          )}
          {d && (
            <div class="empty">
              <b>Aucune liste</b>
              Crée une liste par magasin.
              <p>
                <button class="btn primary" onClick={() => setSheet({ kind: 'newList' })}>
                  Nouvelle liste
                </button>
              </p>
            </div>
          )}
        </div>
        {newListSheet}
        <Snack />
      </div>
    );
  }

  const todo = list.items.filter((i) => !i.checked);
  const done = list.items.filter((i) => i.checked);

  const add = (entries: Entry[]) => {
    if (!entries.length) return;
    let ids: string[] = [];
    mutate((cur) => {
      const r = addEntries(cur, list.id, entries);
      ids = r.ids;
      return r.data;
    });
    setFlashIds(ids);
  };

  const remove = (it: Item) => mutateWithUndo((cur) => removeItem(cur, it.id), `« ${it.name} » supprimé`);

  const finish = () => {
    const n = done.length;
    mutateWithUndo(
      (cur) => finishShopping(cur, list.id).data,
      `${plural(n, 'article')} ${n > 1 ? 'rangés' : 'rangé'} dans l'historique`,
    );
  };

  const rows = (items: Item[]) =>
    items.map((it) => (
      <Row
        key={it.id}
        item={it}
        flash={flashIds.includes(it.id)}
        onToggle={() => mutate((cur) => toggleItem(cur, it.id))}
        onEdit={() => setSheet({ kind: 'item', id: it.id })}
        onDelete={() => remove(it)}
      />
    ));

  return (
    <div class="shop">
      <Topbar title="Courses" />
      <div class="tabs" role="tablist" aria-label="Magasins">
        {d.lists.map((l) => (
          <button
            key={l.id}
            class="tab"
            role="tab"
            aria-selected={l.id === list.id}
            title={l.id === list.id ? 'Toucher à nouveau pour renommer ou supprimer' : undefined}
            onClick={() => (l.id === list.id ? setSheet({ kind: 'list', id: l.id }) : selectList(l.id))}
          >
            {l.name}
            <span class="n">{l.items.filter((i) => !i.checked).length}</span>
          </button>
        ))}
        <button class="tab add" aria-label="Nouvelle liste" onClick={() => setSheet({ kind: 'newList' })}>
          <Icon name="plus" />
        </button>
      </div>

      <div class="shop-main" ref={mainRef}>
        {!todo.length && (
          <div class="empty">
            <b>{done.length ? 'Tout est dans le panier' : 'Liste vide'}</b>
            {done.length ? 'Touche « Courses terminées » une fois passé en caisse.' : 'Ajoute un article en bas, ou touche un habituel.'}
          </div>
        )}
        {d.rayonOrder.map((r) => {
          const g = todo.filter((i) => i.rayon === r);
          if (!g.length) return null;
          return (
            <section key={r} aria-label={RAYONS[r]}>
              <h2 class="rayon-h" style={`--rc:var(--r-${r})`}>
                {RAYONS[r]} <span class="c">{g.length}</span>
              </h2>
              {rows(g)}
            </section>
          );
        })}
        {done.length > 0 && (
          <section class={`cart${cartOpen ? '' : ' closed'}`} aria-label="Dans le panier">
            <div class="cart-h">
              <button
                class="cart-toggle"
                aria-expanded={cartOpen}
                onClick={() => {
                  writeLocal(CART_OPEN_KEY, cartOpen ? '0' : '1');
                  setCartOpen(!cartOpen);
                }}
              >
                <Icon name="down" />
                Dans le panier ({done.length})
              </button>
              <button class="btn primary" onClick={finish}>
                Courses terminées
              </button>
            </div>
            {cartOpen && rows(done)}
          </section>
        )}
      </div>

      <AddBar data={d} list={list} onAdd={add} />
      <Snack />

      {sheet?.kind === 'item' && (
        <ItemSheet
          data={d}
          itemId={sheet.id}
          onClose={() => setSheet(null)}
          onSave={(edit) => {
            const before = list.items.find((i) => i.id === sheet.id);
            mutate((cur) => updateItem(cur, sheet.id, edit));
            setSheet(null);
            setFlashIds([sheet.id]);
            if (before && before.rayon !== edit.rayon)
              showSnack(`Retenu : ${edit.name.trim() || before.name} → ${RAYONS[edit.rayon]}`);
          }}
          onMove={(edit, destId) => {
            const dest = d.lists.find((l) => l.id === destId);
            const name = edit.name.trim() || list.items.find((i) => i.id === sheet.id)?.name || '';
            mutateWithUndo(
              (cur) => moveItem(updateItem(cur, sheet.id, edit), sheet.id, destId),
              `« ${name} » déplacé vers ${dest?.name ?? ''}`,
            );
            setSheet(null);
          }}
          onDelete={() => {
            const it = list.items.find((i) => i.id === sheet.id);
            setSheet(null);
            if (it) remove(it);
          }}
        />
      )}
      {newListSheet}
      {sheet?.kind === 'list' && (
        <ListSheet
          list={list}
          onClose={() => setSheet(null)}
          onSubmit={(name) => {
            mutate((cur) => renameList(cur, list.id, name));
            setSheet(null);
          }}
          onDelete={() => {
            const name = list.name;
            setSheet(null);
            mutateWithUndo((cur) => deleteList(cur, list.id), `Liste « ${name} » supprimée`);
          }}
        />
      )}
    </div>
  );
}

/** Une ligne d'article. Glisser vers la gauche la supprime ; toucher le texte ouvre la fiche. */
function Row(props: { item: Item; flash: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const { item } = props;
  const rowRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; dx: number; active: boolean; pid: number } | null>(null);
  const suppressClick = useRef(false);

  const reset = () => {
    if (innerRef.current) innerRef.current.style.transform = '';
    rowRef.current?.classList.remove('dragging');
    drag.current = null;
  };

  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.check') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, active: false, pid: e.pointerId };
  };
  const onPointerMove = (e: PointerEvent) => {
    const g = drag.current;
    if (!g || e.pointerId !== g.pid) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.active) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        g.active = true;
        rowRef.current?.classList.add('dragging');
        rowRef.current?.setPointerCapture(e.pointerId);
      } else if (Math.abs(dy) > 10) {
        drag.current = null;
        return;
      } else return;
    }
    g.dx = Math.min(0, dx);
    if (innerRef.current) innerRef.current.style.transform = `translateX(${g.dx}px)`;
  };
  const onPointerUp = () => {
    const g = drag.current;
    if (!g) return;
    drag.current = null;
    if (!g.active) return;
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 50);
    rowRef.current?.classList.remove('dragging');
    const width = rowRef.current?.offsetWidth ?? 360;
    if (g.dx < -Math.min(110, width * 0.3)) {
      if (innerRef.current) innerRef.current.style.transform = 'translateX(-100%)';
      setTimeout(props.onDelete, 160);
    } else if (innerRef.current) innerRef.current.style.transform = '';
  };

  const q = formatQty(item.qty);
  return (
    <div
      ref={rowRef}
      data-id={item.id}
      class={`row${item.checked ? ' done' : ''}${props.flash ? ' flash' : ''}`}
      style={`--rc:var(--r-${item.rayon})`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
    >
      <div class="row-del" aria-hidden="true">
        Supprimer
      </div>
      <div class="row-inner" ref={innerRef}>
        <button
          class="check"
          aria-label={`${item.checked ? 'Remettre dans la liste' : 'Mettre dans le panier'} : ${item.name}`}
          aria-pressed={item.checked}
          onClick={props.onToggle}
        >
          <Icon name="check" />
        </button>
        <button
          class="row-text"
          onClick={() => !suppressClick.current && props.onEdit()}
          aria-label={`Modifier ${item.name}${q ? `, ${q}` : ''}`}
        >
          <span class="name">{item.name}</span>
          {q && <span class="qty">{q}</span>}
        </button>
      </div>
    </div>
  );
}

/** Barre du bas : pastilles (habituels si le champ est vide, suggestions sinon) + champ d'ajout. */
function AddBar({ data, list, onAdd }: { data: DataFile; list: ShopList; onAdd: (e: Entry[]) => void }) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setText(''), [list.id]);

  const segments = text.split(',');
  const last = segments[segments.length - 1]!.trim();
  const lastName = parseEntry(last)?.name ?? '';
  let label = '';
  let chips: HistoryEntry[] = [];
  if (!text.trim()) {
    chips = habituels(data, list.id);
    label = chips.length ? 'Habituels' : '';
  } else if (lastName) {
    chips = suggestions(data, list.id, lastName);
    label = chips.length ? 'Suggestions' : '';
  }
  const newRayon = text.trim() && lastName && !chips.length ? classify(lastName, data.history) : null;

  const submit = (e: Event) => {
    e.preventDefault();
    const entries = parseEntries(text);
    if (!entries.length) return;
    setText('');
    onAdd(entries);
    inputRef.current?.focus();
  };

  const pick = (h: HistoryEntry) => {
    const typing = !!text.trim();
    const prev = parseEntries(segments.slice(0, -1).join(','));
    setText('');
    onAdd([...prev, { name: h.name, qty: parseEntry(last)?.qty ?? [] }]);
    if (typing) inputRef.current?.focus();
  };

  return (
    <div class="addbar">
      <div class="chips" aria-live="polite">
        {label && <span class="lbl">{label}</span>}
        {chips.map((h) => (
          <button
            key={h.name}
            type="button"
            class="chip"
            style={`--rc:var(--r-${h.rayon})`}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => pick(h)}
          >
            <i />
            {h.name}
          </button>
        ))}
        {newRayon && (
          <>
            <span class="lbl">Nouveau</span>
            <span class="chip" style={`--rc:var(--r-${newRayon})`}>
              <i />
              {RAYONS[newRayon]}
            </span>
          </>
        )}
        {!label && !newRayon && <span class="lbl">Ex. « 2 lait, pain, farine 500 g »</span>}
      </div>
      <form class="addform" onSubmit={submit} autoComplete="off">
        <input
          ref={inputRef}
          type="text"
          value={text}
          placeholder="Ajouter… (ex. 2 lait, pain)"
          enterKeyHint="done"
          autoCapitalize="sentences"
          aria-label="Ajouter des articles, séparés par des virgules"
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <button type="submit" aria-label="Ajouter">
          <Icon name="plus" />
        </button>
      </form>
    </div>
  );
}
