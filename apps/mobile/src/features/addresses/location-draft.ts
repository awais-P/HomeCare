import { useSyncExternalStore } from 'react';

import type { Place } from '@/features/location/geocoding';

/**
 * The location chosen on the map picker, handed to the address form.
 * (Expo Router has no "return a value from a screen", so the picker writes here and the
 * form reads it.)
 */
export type LocationDraft = Place & { zoneName: string };

let draft: LocationDraft | null = null;
const listeners = new Set<() => void>();

export function setLocationDraft(next: LocationDraft | null) {
  draft = next;
  listeners.forEach((listener) => listener());
}

export function useLocationDraft(): LocationDraft | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => draft,
  );
}
