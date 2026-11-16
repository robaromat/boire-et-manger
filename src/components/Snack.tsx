import { signal } from '@preact/signals';

// Petit message en bas de l'écran, avec « Annuler » quand l'action est réversible.

interface SnackState {
  id: number;
  text: string;
  undo?: () => void;
}

const current = signal<SnackState | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

export function showSnack(text: string, undo?: () => void): void {
  clearTimeout(timer);
  const id = ++seq;
  current.value = { id, text, undo };
  timer = setTimeout(() => {
    if (current.value?.id === id) current.value = null;
  }, undo ? 5000 : 3000);
}

export function Snack() {
  const s = current.value;
  if (!s) return null;
  return (
    <div class="snack" role="status">
      <span>{s.text}</span>
      {s.undo && (
        <button
          onClick={() => {
            s.undo?.();
            current.value = null;
          }}
        >
          Annuler
        </button>
      )}
    </div>
  );
}
