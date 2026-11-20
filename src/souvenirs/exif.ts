// Position GPS et date de prise de vue d'une photo JPEG (EXIF), lues sur le téléphone : la photo n'est envoyée nulle part.
// Attention : selon le téléphone et la façon de choisir la photo, Android peut retirer la position avant de la donner
// au navigateur ; on le dit alors simplement.

export interface PhotoInfo {
  lat: number | null;
  lon: number | null;
  date: string | null; // AAAA-MM-JJ
  time: string | null; // HH:MM
}

const NONE: PhotoInfo = { lat: null, lon: null, date: null, time: null };

export function readExif(buf: ArrayBuffer): PhotoInfo {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return NONE;
  let off = 2;
  while (off + 4 < v.byteLength) {
    const marker = v.getUint16(off);
    const len = v.getUint16(off + 2);
    if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
    off += 2 + len;
  }
  return NONE;
}

function parseTiff(v: DataView, t: number): PhotoInfo {
  if (t + 8 > v.byteLength) return NONE;
  const le = v.getUint16(t) === 0x4949;
  const u16 = (o: number) => v.getUint16(t + o, le);
  const u32 = (o: number) => v.getUint32(t + o, le);
  const entries = (ifd: number) => {
    const out = new Map<number, { type: number; count: number; at: number }>();
    if (t + ifd + 2 > v.byteLength) return out;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (t + e + 12 > v.byteLength) break;
      const type = u16(e + 2);
      const count = u32(e + 4);
      const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 } as Record<number, number>)[type] ?? 1;
      out.set(u16(e), { type, count, at: size * count > 4 ? u32(e + 8) : e + 8 });
    }
    return out;
  };
  const ascii = (x?: { count: number; at: number }) => {
    if (!x) return '';
    let s = '';
    for (let i = 0; i < x.count && t + x.at + i < v.byteLength; i++) {
      const c = v.getUint8(t + x.at + i);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const rationals = (x?: { count: number; at: number }) => {
    if (!x) return null;
    const r: number[] = [];
    for (let i = 0; i < x.count; i++) {
      if (t + x.at + i * 8 + 8 > v.byteLength) return null;
      const d = u32(x.at + i * 8 + 4);
      r.push(d ? u32(x.at + i * 8) / d : 0);
    }
    return r;
  };

  const ifd0 = entries(u32(4));
  const info: PhotoInfo = { ...NONE };
  const exifPtr = ifd0.get(0x8769);
  if (exifPtr) {
    const exif = entries(u32(exifPtr.at));
    const dt = ascii(exif.get(0x9003)) || ascii(ifd0.get(0x0132));
    const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/.exec(dt);
    if (m && m[1] !== '0000') {
      info.date = `${m[1]}-${m[2]}-${m[3]}`;
      info.time = `${m[4]}:${m[5]}`;
    }
  }
  const gpsPtr = ifd0.get(0x8825);
  if (gpsPtr) {
    const gps = entries(u32(gpsPtr.at));
    const lat = rationals(gps.get(2));
    const lon = rationals(gps.get(4));
    if (lat?.length === 3 && lon?.length === 3) {
      const dms = (x: number[]) => x[0]! + x[1]! / 60 + x[2]! / 3600;
      const la = dms(lat) * (ascii(gps.get(1)) === 'S' ? -1 : 1);
      const lo = dms(lon) * (ascii(gps.get(3)) === 'W' ? -1 : 1);
      if ((la || lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) {
        info.lat = la;
        info.lon = lo;
      }
    }
  }
  return info;
}
