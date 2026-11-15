/**
 * Types for the Supabase database, in the same shape `supabase gen types` produces.
 * Keep in sync with supabase/migrations. Once the project is linked you can regenerate with:
 *   npx supabase gen types typescript --project-id <project-ref> > apps/mobile/src/lib/database.types.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppLanguage = 'en' | 'ur';
export type AddressLabel = 'home' | 'work' | 'parents' | 'other';

type AddressRow = {
  id: string;
  user_id: string;
  label: AddressLabel;
  custom_label: string | null;
  latitude: number;
  longitude: number;
  formatted_address: string;
  house: string | null;
  street: string | null;
  area: string | null;
  landmark: string | null;
  instructions: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  zone_id: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

/** Columns the app may write (the rest are set by the database). */
type AddressWritable = Pick<
  AddressRow,
  | 'label'
  | 'custom_label'
  | 'latitude'
  | 'longitude'
  | 'formatted_address'
  | 'house'
  | 'street'
  | 'area'
  | 'landmark'
  | 'instructions'
  | 'recipient_name'
  | 'recipient_phone'
  | 'is_default'
>;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          phone: string | null;
          full_name: string | null;
          email: string | null;
          language: AppLanguage;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          full_name?: string | null;
          email?: string | null;
          language?: AppLanguage;
        };
        Relationships: [];
      };
      addresses: {
        Row: AddressRow;
        Insert: Partial<AddressWritable> &
          Pick<AddressWritable, 'latitude' | 'longitude' | 'formatted_address'>;
        Update: Partial<AddressWritable>;
        Relationships: [];
      };
      waitlist_requests: {
        Row: {
          id: string;
          user_id: string;
          latitude: number;
          longitude: number;
          formatted_address: string | null;
          created_at: string;
        };
        Insert: { latitude: number; longitude: number; formatted_address?: string | null };
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      check_service_area: {
        Args: { lat: number; lng: number };
        Returns: Json;
      };
      service_zones_geojson: {
        Args: Record<string, never>;
        Returns: Json;
      };
    };
    Enums: {
      app_language: AppLanguage;
      address_label: AddressLabel;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];
export type Address = AddressRow;
export type AddressInsert = Database['public']['Tables']['addresses']['Insert'];
export type AddressUpdate = Database['public']['Tables']['addresses']['Update'];
