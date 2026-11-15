import { Platform } from 'react-native';

import type { LatLng } from '../map/types';
import type { AppLanguage } from '../lib/database.types';

/**
 * Place search and "what's at this pin" using Nominatim, OpenStreetMap's free geocoder.
 * Usage policy (https://operations.osmfoundation.org/policies/nominatim/):
 *  - at most 1 request per second  → requests are spaced out below
 *  - no search-as-you-type         → search runs only when the user presses Search
 *  - identify the app              → User-Agent on native (browsers send a Referer)
 * Fine for development and the pilot. Before scaling, self-host or switch to a paid
 * provider — only this file changes.
 */
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'HomeCare-App/0.1 (Islamabad-Rawalpindi pilot)';

/** Islamabad + Rawalpindi: left, top, right, bottom */
const TWIN_CITIES_VIEWBOX = '72.75,33.85,73.35,33.40';

export type Place = {
  id: string;
  /** Main line, e.g. "Jamia Masjid Rizwan" or "House 12 Street 5" */
  title: string;
  /** Second line, e.g. "Sawan Road, G-10, Islamabad" */
  subtitle: string;
  coordinate: LatLng;
  house?: string;
  street?: string;
  /** Sector / colony / neighbourhood, e.g. "G-10" */
  area?: string;
  city?: string;
};

type NominatimResult = {
  place_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: Record<string, string | undefined>;
};

// --- 1 request per second ---------------------------------------------------------------
let nextSlot = 0;
async function waitForSlot(signal?: AbortSignal) {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 1100;
  if (wait > 0) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, wait);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  }
}

async function nominatim<T>(path: string, language: AppLanguage, signal?: AbortSignal): Promise<T> {
  await waitForSlot(signal);
  const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Language': language };
  if (Platform.OS !== 'web') headers['User-Agent'] = USER_AGENT;
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`${NOMINATIM_URL}${path}${separator}accept-language=${language}`, { signal, headers });
  if (!response.ok) throw new Error(`Geocoder error ${response.status}`);
  return (await response.json()) as T;
}

function toPlace(result: NominatimResult): Place {
  const a = result.address ?? {};
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  const street = a.road ?? a.pedestrian ?? a.highway;
  const house = a.house_number;
  const area = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.residential;
  const city = a.city ?? a.town ?? a.village;
  const streetLine = [house, street].filter(Boolean).join(' ');
  const title = result.name || streetLine || area || city || result.display_name.split(',')[0];
  const subtitle = unique([result.name ? street : undefined, area, city])
    .filter((part) => part !== title)
    .join(', ');
  return { id: String(result.place_id), title, subtitle, coordinate: { latitude, longitude }, house, street, area, city };
}

function unique(parts: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  return parts.filter((part): part is string => {
    if (!part || seen.has(part)) return false;
    seen.add(part);
    return true;
  });
}

/** Places matching the text, inside Islamabad/Rawalpindi. Call on submit, not per keystroke. */
export async function searchPlaces(query: string, language: AppLanguage, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const results = await nominatim<NominatimResult[]>(
    `/search?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&limit=8&countrycodes=pk` +
      `&viewbox=${TWIN_CITIES_VIEWBOX}&bounded=1`,
    language,
    signal,
  );
  const seen = new Set<string>();
  return results.map(toPlace).filter((place) => {
    const key = `${place.title}|${place.subtitle}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The nearest named place/street for a map pin. */
export async function reverseGeocode(coordinate: LatLng, language: AppLanguage, signal?: AbortSignal): Promise<Place | null> {
  const result = await nominatim<NominatimResult | { error: string }>(
    `/reverse?lat=${coordinate.latitude}&lon=${coordinate.longitude}&format=jsonv2&zoom=18&addressdetails=1`,
    language,
    signal,
  );
  if ('error' in result) return null;
  // Keep the exact pin position, not the matched feature's.
  return { ...toPlace(result), coordinate };
}

/** One line for saving: "Jamia Masjid Rizwan, Sawan Road, G-10, Islamabad". */
export function placeToAddressLine(place: Place): string {
  return [place.title, place.subtitle].filter(Boolean).join(', ').slice(0, 300);
}
