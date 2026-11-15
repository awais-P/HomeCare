import * as Location from 'expo-location';

import type { LatLng } from '../map/types';

export type DeviceLocationResult =
  | { status: 'ok'; coordinate: LatLng }
  | { status: 'denied' }
  | { status: 'unavailable' };

/**
 * Asks for "while using the app" location permission (once) and returns where the phone is.
 * Uses the last known position first because it is instant, then a fresh fix.
 */
export async function getDeviceLocation(): Promise<DeviceLocationResult> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return { status: 'denied' };

    const last = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000 });
    if (last) return { status: 'ok', coordinate: toLatLng(last) };

    const current = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
    ]);
    return current ? { status: 'ok', coordinate: toLatLng(current) } : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

function toLatLng(position: Location.LocationObject): LatLng {
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}
