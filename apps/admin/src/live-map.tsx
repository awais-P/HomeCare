import 'maplibre-gl/dist/maplibre-gl.css';

import maplibregl from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

import { fetchZones, listOnlinePartners, type PartnerWithProfile } from './api';
import { workSummary } from './partners-view';

const STYLE = 'https://tiles.openfreemap.org/styles/positron';
const REFRESH_MS = 15_000;

/** Online, approved partners on a map (refreshes every 15 s), with the service zones. */
export function LiveMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [partners, setPartners] = useState<PartnerWithProfile[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: [73.05, 33.65],
      zoom: 10.5,
      dragRotate: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', async () => {
      const zones = await fetchZones();
      if (!zones) return;
      map.addSource('zones', { type: 'geojson', data: zones });
      map.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': '#0B7A55', 'fill-opacity': 0.08 } });
      map.addLayer({ id: 'zones-line', type: 'line', source: 'zones', paint: { 'line-color': '#0B7A55', 'line-width': 1.5 } });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const rows = await listOnlinePartners();
        if (!active) return;
        setPartners(rows);
        setUpdatedAt(new Date());
        setError(null);
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  // Draw one marker per online partner.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = partners
      .filter((p) => p.last_latitude != null && p.last_longitude != null)
      .map((p) => {
        const el = document.createElement('div');
        el.className = `map-marker role-${p.role}`;
        el.textContent = p.role === 'rider' ? 'R' : 'U';
        return new maplibregl.Marker({ element: el })
          .setLngLat([p.last_longitude as number, p.last_latitude as number])
          .setPopup(new maplibregl.Popup({ offset: 16 }).setText(`${p.profiles?.full_name ?? 'Partner'} · ${workSummary(p)}`))
          .addTo(map);
      });
  }, [partners]);

  return (
    <div className="split">
      <section className="list">
        <div className="list-header">
          <h2>Online now ({partners.length})</h2>
        </div>
        <p className="muted small">
          Updates every 15 s{updatedAt ? ` · last ${updatedAt.toLocaleTimeString('en-PK')}` : ''}. A partner drops off after 2
          minutes without a location update.
        </p>
        {error ? <p className="error">{error}</p> : null}
        {partners.length === 0 ? <p className="muted">No partners online.</p> : null}
        {partners.map((p) => (
          <button
            key={p.id}
            className="row"
            onClick={() =>
              p.last_longitude != null &&
              p.last_latitude != null &&
              mapRef.current?.flyTo({ center: [p.last_longitude, p.last_latitude], zoom: 15 })
            }>
            <span className={`pill role-${p.role}`}>{p.role === 'rider' ? 'Rider' : 'Ustaad'}</span>
            <span className="row-main">
              <strong>{p.profiles?.full_name ?? 'Unnamed'}</strong>
              <span className="muted small">{workSummary(p)}</span>
            </span>
          </button>
        ))}
      </section>
      <section className="map-wrap">
        <div ref={containerRef} className="map" />
      </section>
    </div>
  );
}
