// Background location is phone-only. In the browser preview the app shares location only while open.
export const BACKGROUND_LOCATION_TASK = 'homecare-partner-location';
export type BackgroundPermission = 'granted' | 'denied' | 'undetermined';

export async function backgroundPermission(): Promise<BackgroundPermission> {
  return 'denied';
}
export async function requestBackgroundPermission(): Promise<BackgroundPermission> {
  return 'denied';
}
export const openAppSettings = () => undefined;
export async function isBackgroundSharing() {
  return false;
}
export async function startBackgroundSharing() {
  return false;
}
export async function stopBackgroundSharing() {}
