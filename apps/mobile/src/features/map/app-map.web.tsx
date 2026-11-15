import 'maplibre-gl/dist/maplibre-gl.css';

import maplibregl from 'maplibre-gl';
import { forwardRef, useEffect, useImperativeHandle, useRef, type ComponentRef } from 'react';
import { View } from 'react-native';

import { useColors, useColorSchemeName } from '@/theme';

import { MAP_STYLES, STREET_ZOOM, type AppMapHandle, type AppMapProps } from './types';

/**
 * Web version of AppMap (maplibre-gl), used by the browser preview so screens can be checked
 * without a phone. Same props and behaviour as the native app-map.tsx.
 */
export const AppMap = forwardRef<AppMapHandle, AppMapProps>(function AppMap(
  { initialCenter, initialZoom = STREET_ZOOM, zones, marker, showUserLocation, onPress, onMoveStart, onMoveEnd, bottomInset = 0, style },
  ref,
) {
  const containerRef = useRef<ComponentRef<typeof View>>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const scheme = useColorSchemeName();
  const colors = useColors();
  const handlers = useRef({ onPress, onMoveStart, onMoveEnd });
  handlers.current = { onPress, onMoveStart, onMoveEnd };

  useImperativeHandle(ref, () => ({
    flyTo: (center, zoom) =>
      mapRef.current?.flyTo({ center: [center.longitude, center.latitude], zoom: zoom ?? STREET_ZOOM, duration: 800 }),
  }));

  // Create the map once.
  useEffect(() => {
    const element = containerRef.current as unknown as HTMLElement | null;
    if (!element) return;
    const map = new maplibregl.Map({
      container: element,
      style: MAP_STYLES[scheme],
      center: [initialCenter.longitude, initialCenter.latitude],
      zoom: initialZoom,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
    });
    map.touchZoomRotate.disableRotation();
    map.on('click', () => handlers.current.onPress?.());
    map.on('movestart', (e) => {
      if ((e as { originalEvent?: unknown }).originalEvent) handlers.current.onMoveStart?.();
    });
    map.on('moveend', () => {
      const c = map.getCenter();
      handlers.current.onMoveEnd?.({ latitude: c.lat, longitude: c.lng });
    });
    if (showUserLocation) {
      map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), 'top-right');
    }
    // Keep the canvas the size of its container (layout settles after the map is created).
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(element);
    mapRef.current = map;
    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; style/zones are synced by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.setStyle(MAP_STYLES[scheme]);
  }, [scheme]);

  useEffect(() => {
    mapRef.current?.setPadding({ top: 0, left: 0, right: 0, bottom: bottomInset });
  }, [bottomInset]);

  // Zones overlay (re-added after every style load).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!zones) return;
      const source = map.getSource('service-zones') as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(zones);
        return;
      }
      map.addSource('service-zones', { type: 'geojson', data: zones });
      map.addLayer({
        id: 'service-zones-fill',
        type: 'fill',
        source: 'service-zones',
        paint: { 'fill-color': colors.primary, 'fill-opacity': 0.08 },
      });
      map.addLayer({
        id: 'service-zones-line',
        type: 'line',
        source: 'service-zones',
        paint: { 'line-color': colors.primary, 'line-width': 1.5, 'line-opacity': 0.6 },
      });
    };
    if (map.isStyleLoaded()) apply();
    map.on('style.load', apply);
    return () => {
      map.off('style.load', apply);
    };
  }, [zones, colors.primary]);

  // Pin for the selected address.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !marker) return;
    const pin = new maplibregl.Marker({ color: colors.primary, anchor: 'bottom' })
      .setLngLat([marker.longitude, marker.latitude])
      .addTo(map);
    return () => {
      pin.remove();
    };
  }, [marker, colors.primary]);

  // maplibre-gl's CSS makes its container `position: relative`, which would override an absolute
  // `style` from the screen, so the map gets its own inner view.
  return (
    <View style={style ?? { flex: 1 }}>
      <View ref={containerRef} style={{ flex: 1 }} />
    </View>
  );
});
