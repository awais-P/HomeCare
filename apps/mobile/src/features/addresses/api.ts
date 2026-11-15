import type { LatLng } from '@/features/map/types';
import type { Address, AddressInsert, AddressUpdate } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type ServiceAreaCheck = { inside: true; zoneId: string; zoneName: string } | { inside: false };

export async function listAddresses(): Promise<Address[]> {
  const { data, error } = await supabase
    .from('addresses')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createAddress(input: AddressInsert): Promise<Address> {
  const { data, error } = await supabase.from('addresses').insert(input).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateAddress(id: string, patch: AddressUpdate): Promise<Address> {
  const { data, error } = await supabase.from('addresses').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function deleteAddress(id: string): Promise<void> {
  const { error } = await supabase.from('addresses').delete().eq('id', id);
  if (error) throw error;
}

export async function checkServiceArea(point: LatLng): Promise<ServiceAreaCheck> {
  const { data, error } = await supabase.rpc('check_service_area', { lat: point.latitude, lng: point.longitude });
  if (error) throw error;
  const result = data as { inside?: boolean; zone_id?: string; zone_name?: string } | null;
  return result?.inside && result.zone_id && result.zone_name
    ? { inside: true, zoneId: result.zone_id, zoneName: result.zone_name }
    : { inside: false };
}

export async function fetchServiceZones(): Promise<GeoJSON.FeatureCollection> {
  const { data, error } = await supabase.rpc('service_zones_geojson');
  if (error) throw error;
  return data as unknown as GeoJSON.FeatureCollection;
}

export async function joinWaitlist(point: LatLng, formattedAddress: string | null): Promise<void> {
  const { error } = await supabase
    .from('waitlist_requests')
    .insert({ latitude: point.latitude, longitude: point.longitude, formatted_address: formattedAddress });
  if (error) throw error;
}
