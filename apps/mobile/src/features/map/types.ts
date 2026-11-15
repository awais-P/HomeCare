import type { StyleProp, ViewStyle } from 'react-native';

export type LatLng = { latitude: number; longitude: number };

export type AppMapHandle = {
  /** Smoothly moves the map to a point. */
  flyTo: (center: LatLng, zoom?: number) => void;
};

export type AppMapProps = {
  initialCenter: LatLng;
  initialZoom?: number;
  /** Service zones to draw as a soft green overlay. */
  zones?: GeoJSON.FeatureCollection | null;
  /** A pin fixed to a place on the map (e.g. the selected delivery address). */
  marker?: LatLng | null;
  /** Shows the blue "you are here" dot (needs location permission). */
  showUserLocation?: boolean;
  /** Tap on the map (not a drag). */
  onPress?: () => void;
  /** The user started dragging/zooming the map. */
  onMoveStart?: () => void;
  /** The map stopped moving; gives the new centre. */
  onMoveEnd?: (center: LatLng) => void;
  /** Space covered by overlays (e.g. a bottom sheet) so the centre and controls stay visible. */
  bottomInset?: number;
  style?: StyleProp<ViewStyle>;
};

/** Islamabad, G-10 (inside a pilot zone): used when we don't know where the user is yet. */
export const DEFAULT_CENTER: LatLng = { latitude: 33.676, longitude: 73.015 };
export const CITY_ZOOM = 12;
export const STREET_ZOOM = 16;

/** Free OpenStreetMap-based styles from OpenFreeMap (no API key). */
export const MAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;
