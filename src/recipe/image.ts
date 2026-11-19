// Réduit la photo avant envoi : plus rapide sur le réseau mobile et moins cher, sans perte de lisibilité.

const MAX_SIDE = 1600;

export async function imageToDataUrl(file: Blob): Promise<string> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    // Format que le navigateur ne sait pas redessiner : on envoie le fichier tel quel.
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('Image illisible.'));
      r.readAsDataURL(file);
    });
  }
}
