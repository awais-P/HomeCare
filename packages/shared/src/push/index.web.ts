import type { Href } from 'expo-router';

// Push notifications are phone-only. On web (browser preview) these do nothing.
export type PushApp = 'customer' | 'partner';
export type PushData = { kind?: string; order_id?: string; job_id?: string };

export async function registerForPush(_app: PushApp): Promise<'ok' | 'denied' | 'unavailable'> {
  return 'unavailable';
}

export async function unregisterPush() {}

export function usePushNotifications(_app: PushApp, _routeFor: (data: PushData) => Href | null) {}
