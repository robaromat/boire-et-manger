import { Icon } from './Icon';

// Ajout de photo en deux boutons : l'appareil photo (capture) ou la galerie. Sur Android, un champ sans
// « capture » n'ouvre que le sélecteur de fichiers (Google Photos), sans proposer l'appareil.

export function PhotoAdd({ label = 'Prendre une photo', multiple, onFiles }: { label?: string; multiple?: boolean; onFiles: (files: File[]) => void }) {
  const pick = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length) onFiles(files);
  };
  return (
    <div class="photo-adds">
      <label class="photo-add">
        <Icon name="camera" />
        {label}
        <input type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      </label>
      <label class="photo-add">
        <Icon name="image" />
        Galerie
        <input type="file" accept="image/*" multiple={multiple} hidden onChange={pick} />
      </label>
    </div>
  );
}
