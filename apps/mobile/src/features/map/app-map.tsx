import { Camera, GeoJSONSource, Layer, Map, Marker, UserLocation, type CameraRef } from '@maplibre/maplibre-react-native';
import { forwardRef, useImperativeHandle, useRef } from 'react';

import { useColors, useColorSchemeName } from '@/theme';

import { MapPin } from './map-pin';
import { MAP_STYLES, STREET_ZOOM, type AppMapHandle, type AppMapProps } from './types';

/**
 * The app's map (native: MapLibre + free OpenStreetMap tiles). Screens use this component only,
 * so the map provider can change later without touching them. Web version: app-map.web.tsx.
 */
export const AppMap = forwardRef<AppMapHandle, AppMapProps>(function AppMap(
  { initialCenter, initialZoom = STREET_ZOOM, zones, marker, showUserLocation, onPress, onMoveStart, onMoveEnd, bottomInset = 0, style },
  ref,
) {
  const cameraRef = useRef<CameraRef>(null);
  const scheme = useColorSchemeName();
  const colors = useColors();

  useImperativeHandle(ref, () => ({
    flyTo: (center, zoom) =>
      cameraRef.current?.flyTo({
        center: [center.longitude, center.latitude],
        zoom: zoom ?? STREET_ZOOM,
        duration: 800,
      }),
  }));

  return (
    <Map
      style={style ?? { flex: 1 }}
      mapStyle={MAP_STYLES[scheme]}
      contentInset={{ top: 0, left: 0, right: 0, bottom: bottomInset }}
      compass={false}
      logo={false}
      attribution
      attributionPosition={{ bottom: bottomInset + 8, left: 8 }}
      touchRotate={false}
      touchPitch={false}
      onPress={() => onPress?.()}
      onRegionWillChange={(e) => {
        if (e.nativeEvent.userInteraction) onMoveStart?.();
      }}
      onRegionDidChange={(e) => {
        const [longitude, latitude] = e.nativeEvent.center;
        onMoveEnd?.({ latitude, longitude });
      }}>
      <Camera
        ref={cameraRef}
        initialViewState={{ center: [initialCenter.longitude, initialCenter.latitude], zoom: initialZoom }}
      />
      {zones ? (
        <GeoJSONSource id="service-zones" data={zones}>
          <Layer id="service-zones-fill" type="fill" paint={{ 'fill-color': colors.primary, 'fill-opacity': 0.08 }} />
          <Layer
            id="service-zones-line"
            type="line"
            paint={{ 'line-color': colors.primary, 'line-width': 1.5, 'line-opacity': 0.6 }}
          />
        </GeoJSONSource>
      ) : null}
      {showUserLocation ? <UserLocation accuracy /> : null}
      {marker ? (
        <Marker id="selected-address" lngLat={[marker.longitude, marker.latitude]} anchor="bottom">
          <MapPin />
        </Marker>
      ) : null}
    </Map>
  );
});
