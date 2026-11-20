import { useEffect, useRef, useState } from 'preact/hooks';
import type * as Leaflet from 'leaflet';
import { iconSvg } from '../../components/Icon';
import type { Place } from '../../souvenirs/types';
import { placeIcon } from './bits';

// Carte OpenStreetMap (Leaflet, chargé seulement à l'ouverture de la carte). Fonds de carte : tile.openstreetmap.org,
// avec l'attribution demandée. Les marqueurs sont dessinés en HTML (épingle pleine = visité, pointillés = à essayer).

type L = typeof Leaflet;
let lib: Promise<L> | null = null;
const loadLeaflet = () =>
  (lib ??= Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([m]) => ((m as unknown as { default?: L }).default ?? (m as unknown as L))));

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIB = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

/** Dernière vue de la grande carte, retrouvée en revenant d'une fiche. */
let lastView: { center: [number, number]; zoom: number } | null = null;

export interface MapApi {
  center: () => { lat: number; lon: number } | null;
  flyTo: (lat: number, lon: number, zoom?: number) => void;
}

export function MapView(props: {
  places: Place[];
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  me?: { lat: number; lon: number } | null;
  /** Petite carte d'une fiche : un seul lieu, rien de cliquable. */
  mini?: boolean;
  /** Mode « poser un point » : une croix au centre, la carte bouge dessous. */
  pick?: boolean;
  start?: { lat: number; lon: number } | null;
  apiRef?: { current: MapApi | null };
  class?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const meLayer = useRef<Leaflet.LayerGroup | null>(null);
  const L = useRef<L | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const sel = useRef(props.onSelect);
  sel.current = props.onSelect;

  useEffect(() => {
    let alive = true;
    loadLeaflet()
      .then((lf) => {
        if (!alive || !el.current) return;
        L.current = lf;
        const interactive = !props.mini;
        const m = lf.map(el.current, {
          zoomControl: false,
          attributionControl: true,
          dragging: interactive,
          touchZoom: interactive,
          scrollWheelZoom: interactive,
          doubleClickZoom: interactive,
          boxZoom: false,
          keyboard: interactive,
        });
        lf.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIB }).addTo(m);
        m.attributionControl.setPrefix(false);
        layer.current = lf.layerGroup().addTo(m);
        meLayer.current = lf.layerGroup().addTo(m);
        const located = props.places.filter((p) => p.lat != null && p.lon != null);
        if (props.start) m.setView([props.start.lat, props.start.lon], props.pick ? 17 : 16);
        else if (props.mini && located[0]) m.setView([located[0].lat!, located[0].lon!], 16);
        else if (!props.mini && !props.pick && lastView) m.setView(lastView.center, lastView.zoom);
        else if (located.length > 1) m.fitBounds(lf.latLngBounds(located.map((p) => [p.lat!, p.lon!] as [number, number])), { padding: [40, 40], maxZoom: 16 });
        else if (located[0]) m.setView([located[0].lat!, located[0].lon!], 15);
        else m.setView([46.6, 2.4], 5); // la France entière
        if (!props.mini && !props.pick)
          m.on('moveend', () => {
            const c = m.getCenter();
            lastView = { center: [c.lat, c.lng], zoom: m.getZoom() };
          });
        m.on('click', () => sel.current?.(null));
        map.current = m;
        if (props.apiRef)
          props.apiRef.current = {
            center: () => {
              const c = m.getCenter();
              return { lat: c.lat, lon: c.lng };
            },
            flyTo: (lat, lon, zoom) => m.flyTo([lat, lon], zoom ?? Math.max(m.getZoom(), 16)),
          };
        setReady(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Marqueurs
  useEffect(() => {
    const lf = L.current;
    if (!ready || !lf || !layer.current || props.pick) return;
    layer.current.clearLayers();
    for (const p of props.places) {
      if (p.lat == null || p.lon == null) continue;
      const on = props.selected === p.id;
      const icon = lf.divIcon({
        className: `smark${p.todo ? ' todo' : ''}${on ? ' on' : ''}`,
        html: `<span class="head">${iconSvg(placeIcon(p))}</span>${on ? `<span class="name">${p.name.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)}</span>` : ''}`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      });
      const mk = lf.marker([p.lat, p.lon], { icon, keyboard: !props.mini, interactive: !props.mini, title: p.name, zIndexOffset: on ? 1000 : 0 });
      if (!props.mini) mk.on('click', (e) => {
        lf.DomEvent.stopPropagation(e);
        sel.current?.(p.id);
      });
      layer.current.addLayer(mk);
    }
  }, [ready, props.places, props.selected]);

  // Ta position
  useEffect(() => {
    const lf = L.current;
    if (!ready || !lf || !meLayer.current) return;
    meLayer.current.clearLayers();
    if (props.me) meLayer.current.addLayer(lf.marker([props.me.lat, props.me.lon], { icon: lf.divIcon({ className: 'smeloc', iconSize: [18, 18] }), interactive: false }));
  }, [ready, props.me]);

  return (
    <div class={`smap ${props.class ?? ''}`}>
      <div ref={el} class="smap-in" />
      {props.pick && <div class="smap-cross" aria-hidden="true" />}
      {failed && <p class="smap-fail">Carte indisponible hors connexion.</p>}
    </div>
  );
}
