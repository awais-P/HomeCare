/**
 * Types for the Supabase database, in the same shape `supabase gen types` produces.
 * Keep in sync with supabase/migrations. Once the project is linked you can regenerate with:
 *   npx supabase gen types typescript --project-id <project-ref> > apps/mobile/src/lib/database.types.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppLanguage = 'en' | 'ur';
export type AddressLabel = 'home' | 'work' | 'parents' | 'other';
export type PartnerRole = 'rider' | 'ustaad';
export type PartnerStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended';
export type UstaadTrade = 'plumber' | 'electrician' | 'ac_technician' | 'mechanic';
export type VehicleType = 'motorcycle' | 'bicycle' | 'car' | 'rickshaw';
export type PayoutMethod = 'jazzcash' | 'easypaisa';
export type OrderStatus = 'requested' | 'accepted' | 'at_shop' | 'on_the_way' | 'delivered' | 'cancelled';
export type SaudaCategory = 'sabzi' | 'grocery' | 'meat' | 'bakery' | 'pharmacy' | 'food' | 'pick_drop' | 'other';
export type OrderActor = 'customer' | 'rider' | 'admin';
export type SubstitutionStatus = 'pending' | 'approved' | 'declined' | 'no_reply';
export type OfferStatus = 'offered' | 'accepted' | 'declined' | 'expired' | 'withdrawn';

type OrderRow = {
  id: string;
  code: string;
  customer_id: string | null;
  rider_id: string | null;
  status: OrderStatus;
  category: SaudaCategory;
  items_text: string;
  photo_paths: string[];
  shop_preference: string | null;
  address_id: string | null;
  delivery_text: string;
  delivery_latitude: number;
  delivery_longitude: number;
  recipient_name: string | null;
  recipient_phone: string | null;
  instructions: string | null;
  zone_id: string | null;
  estimated_fee: number;
  delivery_fee: number | null;
  shop_distance_km: number | null;
  item_cost: number | null;
  bill_photo_path: string | null;
  cash_collected: boolean;
  cancellation_fee: number;
  cancelled_by: OrderActor | null;
  cancel_reason: string | null;
  rating: number | null;
  rating_comment: string | null;
  voice_note_path: string | null;
  /** Set when automatic offers ran out: the order needs a rider (admin assigns, or a rider picks it from the list). */
  dispatch_gave_up_at: string | null;
  created_at: string;
  accepted_at: string | null;
  at_shop_at: string | null;
  on_the_way_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
};

export type OpenOrder = {
  id: string;
  code: string;
  category: SaudaCategory;
  items_text: string;
  shop_preference: string | null;
  area: string | null;
  distance_km: number;
  estimated_fee: number;
  created_at: string;
};

export type SubstitutionRow = {
  id: string;
  order_id: string;
  item: string;
  /** null = the item isn't available; the rider asks whether to skip it. */
  suggestion: string | null;
  price: number | null;
  photo_path: string | null;
  status: SubstitutionStatus;
  created_at: string;
  answered_at: string | null;
};

export type OfferRow = {
  id: string;
  order_id: string;
  rider_id: string;
  status: OfferStatus;
  distance_km: number | null;
  offered_at: string;
  expires_at: string;
  answered_at: string | null;
};

/** The rider's current automatic offer (no address until accepted). */
export type RiderOffer = {
  offer_id: string;
  order_id: string;
  code: string;
  category: SaudaCategory;
  items_text: string;
  shop_preference: string | null;
  voice_note_path: string | null;
  photo_count: number;
  area: string | null;
  distance_km: number | null;
  estimated_fee: number;
  expires_at: string;
  seconds_left: number;
};

type PartnerRow = {
  id: string;
  role: PartnerRole;
  trades: UstaadTrade[];
  cnic_number: string | null;
  vehicle_type: VehicleType | null;
  vehicle_number: string | null;
  payout_method: PayoutMethod | null;
  payout_account: string | null;
  status: PartnerStatus;
  status_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  is_online: boolean;
  last_latitude: number | null;
  last_longitude: number | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Application fields a partner may write (status/online change only through functions). */
type PartnerWritable = Pick<
  PartnerRow,
  'role' | 'trades' | 'cnic_number' | 'vehicle_type' | 'vehicle_number' | 'payout_method' | 'payout_account'
>;

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
      partners: {
        Row: PartnerRow;
        Insert: Partial<PartnerWritable> & Pick<PartnerWritable, 'role'>;
        Update: Partial<PartnerWritable>;
        Relationships: [
          {
            foreignKeyName: 'partners_id_fkey';
            columns: ['id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      app_settings: {
        Row: { key: string; value: Json; description: string; updated_at: string };
        Insert: never;
        Update: { value?: Json };
        Relationships: [];
      };
      orders: {
        Row: OrderRow;
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'orders_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'partners';
            referencedColumns: ['id'];
          },
        ];
      };
      order_events: {
        Row: {
          id: number;
          order_id: string;
          actor_id: string | null;
          from_status: OrderStatus | null;
          to_status: OrderStatus;
          note: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      order_substitutions: {
        Row: SubstitutionRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      order_offers: {
        Row: OfferRow;
        Insert: never;
        Update: never;
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
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      submit_partner_application: {
        Args: Record<string, never>;
        Returns: PartnerRow;
      };
      set_partner_online: {
        Args: { p_online: boolean; lat?: number; lng?: number };
        Returns: PartnerRow;
      };
      update_partner_location: {
        Args: { lat: number; lng: number };
        Returns: undefined;
      };
      review_partner: {
        Args: { p_partner: string; p_decision: PartnerStatus; p_reason?: string };
        Returns: PartnerRow;
      };
      setting: { Args: { p_key: string }; Returns: Json };
      create_sauda_order: {
        Args: {
          p_address_id: string;
          p_category: SaudaCategory;
          p_items_text: string;
          p_shop_preference?: string;
          p_instructions?: string;
          p_photo_paths?: string[];
        };
        Returns: OrderRow;
      };
      list_open_orders: { Args: { lat: number; lng: number }; Returns: OpenOrder[] };
      accept_order: { Args: { p_order: string }; Returns: OrderRow };
      assign_order: { Args: { p_order: string; p_rider: string }; Returns: OrderRow };
      advance_order: {
        Args: {
          p_order: string;
          p_next: OrderStatus;
          lat?: number;
          lng?: number;
          p_item_cost?: number;
          p_bill_photo_path?: string;
        };
        Returns: OrderRow;
      };
      cancel_order: { Args: { p_order: string; p_reason?: string }; Returns: OrderRow };
      rate_order: { Args: { p_order: string; p_rating: number; p_comment?: string }; Returns: OrderRow };
      delete_my_account: { Args: Record<string, never>; Returns: undefined };
      order_contact: { Args: { p_order: string }; Returns: { name: string | null; phone: string | null }[] };
      place_sauda_order: {
        Args: {
          p_address_id: string;
          p_category: SaudaCategory;
          p_items_text: string;
          p_shop_preference?: string;
          p_instructions?: string;
          p_photo_paths?: string[];
          p_voice_path?: string;
        };
        Returns: OrderRow;
      };
      my_offer: { Args: Record<string, never>; Returns: RiderOffer[] };
      respond_offer: { Args: { p_offer: string; p_accept: boolean }; Returns: OrderRow | null };
      request_substitution: {
        Args: { p_order: string; p_item: string; p_suggestion?: string; p_price?: number; p_photo_path?: string };
        Returns: SubstitutionRow;
      };
      answer_substitution: { Args: { p_substitution: string; p_approve: boolean }; Returns: SubstitutionRow };
      order_rider_location: {
        Args: { p_order: string };
        Returns: { latitude: number; longitude: number; seen_at: string | null }[];
      };
      register_push_token: { Args: { p_token: string; p_app: 'customer' | 'partner'; p_platform: 'android' | 'ios' }; Returns: undefined };
      unregister_push_token: { Args: { p_token: string }; Returns: undefined };
    };
    Enums: {
      app_language: AppLanguage;
      address_label: AddressLabel;
      partner_role: PartnerRole;
      partner_status: PartnerStatus;
      ustaad_trade: UstaadTrade;
      vehicle_type: VehicleType;
      payout_method: PayoutMethod;
      order_status: OrderStatus;
      sauda_category: SaudaCategory;
      order_actor: OrderActor;
      substitution_status: SubstitutionStatus;
      offer_status: OfferStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];
export type Address = AddressRow;
export type AddressInsert = Database['public']['Tables']['addresses']['Insert'];
export type AddressUpdate = Database['public']['Tables']['addresses']['Update'];
export type Partner = PartnerRow;
export type PartnerInsert = Database['public']['Tables']['partners']['Insert'];
export type PartnerUpdate = Database['public']['Tables']['partners']['Update'];
export type Order = OrderRow;
export type OrderEvent = Database['public']['Tables']['order_events']['Row'];
export type Substitution = SubstitutionRow;
export type Offer = OfferRow;
