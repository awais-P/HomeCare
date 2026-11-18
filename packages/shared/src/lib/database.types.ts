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
export type JobStatus =
  | 'requested'
  | 'accepted'
  | 'on_the_way'
  | 'arrived'
  | 'quoted'
  | 'in_progress'
  | 'completed'
  | 'visit_only'
  | 'cancelled';
export type JobTiming = 'now' | 'scheduled';

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

type UstaadJobRow = {
  id: string;
  code: string;
  customer_id: string | null;
  ustaad_id: string | null;
  preferred_ustaad_id: string | null;
  parent_job_id: string | null;
  /** A free revisit under warranty: no visit fee, labour free. */
  is_warranty: boolean;
  status: JobStatus;
  trade: UstaadTrade;
  problem_text: string;
  photo_paths: string[];
  timing: JobTiming;
  scheduled_for: string | null;
  address_id: string | null;
  address_text: string;
  latitude: number;
  longitude: number;
  recipient_name: string | null;
  recipient_phone: string | null;
  instructions: string | null;
  zone_id: string | null;
  /** Visit fee including the come-now surge. */
  visit_fee: number;
  surge_percent: number;
  labour_cost: number | null;
  parts_cost: number | null;
  quote_note: string | null;
  amount_due: number | null;
  cash_collected: boolean;
  cancellation_fee: number;
  cancelled_by: OrderActor | null;
  cancel_reason: string | null;
  rating: number | null;
  rating_comment: string | null;
  warranty_until: string | null;
  dispatch_gave_up_at: string | null;
  created_at: string;
  accepted_at: string | null;
  on_the_way_at: string | null;
  arrived_at: string | null;
  quoted_at: string | null;
  approved_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
};

export type JobOfferRow = {
  id: string;
  job_id: string;
  ustaad_id: string;
  status: OfferStatus;
  distance_km: number | null;
  offered_at: string;
  expires_at: string;
  answered_at: string | null;
};

type JobSummary = {
  code: string;
  trade: UstaadTrade;
  problem_text: string;
  photo_count: number;
  timing: JobTiming;
  scheduled_for: string | null;
  is_warranty: boolean;
  area: string | null;
  distance_km: number | null;
  visit_fee: number;
};

/** An ustaad's current automatic offer (no address until accepted). */
export type UstaadOffer = JobSummary & { offer_id: string; job_id: string; expires_at: string; seconds_left: number };
/** A waiting job near an online ustaad. */
export type OpenJob = JobSummary & { id: string; created_at: string };

export type JobUstaadCard = {
  ustaad_id: string;
  name: string | null;
  /** Only while the job is active. */
  phone: string | null;
  rating_avg: number | null;
  jobs_done: number;
  is_favourite: boolean;
};

export type FavouriteUstaad = {
  ustaad_id: string;
  name: string | null;
  trades: UstaadTrade[];
  rating_avg: number | null;
  jobs_done: number;
};

export type ChatMessageRow = {
  id: number;
  order_id: string | null;
  job_id: string | null;
  sender_id: string | null;
  sender_role: 'customer' | 'partner' | 'admin';
  body: string;
  created_at: string;
  read_at: string | null;
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
      ustaad_jobs: {
        Row: UstaadJobRow;
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'ustaad_jobs_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ustaad_jobs_ustaad_id_fkey';
            columns: ['ustaad_id'];
            isOneToOne: false;
            referencedRelation: 'partners';
            referencedColumns: ['id'];
          },
        ];
      };
      job_events: {
        Row: {
          id: number;
          job_id: string;
          actor_id: string | null;
          from_status: JobStatus | null;
          to_status: JobStatus;
          note: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      job_offers: {
        Row: JobOfferRow;
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'job_offers_ustaad_id_fkey';
            columns: ['ustaad_id'];
            isOneToOne: false;
            referencedRelation: 'partners';
            referencedColumns: ['id'];
          },
        ];
      };
      chat_messages: {
        Row: ChatMessageRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      favourite_ustaads: {
        Row: { customer_id: string; ustaad_id: string; created_at: string };
        Insert: { ustaad_id: string };
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
      create_ustaad_job: {
        Args: {
          p_address_id: string;
          p_trade: UstaadTrade;
          p_problem_text: string;
          p_timing?: JobTiming;
          p_scheduled_for?: string;
          p_photo_paths?: string[];
          p_preferred_ustaad?: string;
          p_instructions?: string;
        };
        Returns: UstaadJobRow;
      };
      answer_quote: { Args: { p_job: string; p_approve: boolean }; Returns: UstaadJobRow };
      report_issue_again: { Args: { p_job: string; p_problem_text?: string }; Returns: UstaadJobRow };
      rate_job: { Args: { p_job: string; p_rating: number; p_comment?: string }; Returns: UstaadJobRow };
      job_ustaad: { Args: { p_job: string }; Returns: JobUstaadCard[] };
      my_favourite_ustaads: { Args: Record<string, never>; Returns: FavouriteUstaad[] };
      job_ustaad_location: {
        Args: { p_job: string };
        Returns: { latitude: number; longitude: number; seen_at: string | null }[];
      };
      list_open_jobs: { Args: { lat: number; lng: number }; Returns: OpenJob[] };
      accept_job: { Args: { p_job: string }; Returns: UstaadJobRow };
      my_job_offer: { Args: Record<string, never>; Returns: UstaadOffer[] };
      respond_job_offer: { Args: { p_offer: string; p_accept: boolean }; Returns: UstaadJobRow | null };
      advance_job: { Args: { p_job: string; p_next: JobStatus; lat?: number; lng?: number }; Returns: UstaadJobRow };
      send_quote: { Args: { p_job: string; p_labour: number; p_parts?: number; p_note?: string }; Returns: UstaadJobRow };
      complete_job: { Args: { p_job: string }; Returns: UstaadJobRow };
      job_contact: { Args: { p_job: string }; Returns: { name: string | null; phone: string | null }[] };
      assign_job: { Args: { p_job: string; p_ustaad: string }; Returns: UstaadJobRow };
      cancel_job: { Args: { p_job: string; p_reason?: string }; Returns: UstaadJobRow };
      send_chat_message: { Args: { p_body: string; p_order?: string; p_job?: string }; Returns: ChatMessageRow };
      mark_chat_read: { Args: { p_order?: string; p_job?: string }; Returns: number };
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
      job_status: JobStatus;
      job_timing: JobTiming;
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
export type UstaadJob = UstaadJobRow;
export type JobEvent = Database['public']['Tables']['job_events']['Row'];
export type JobOffer = JobOfferRow;
export type ChatMessage = ChatMessageRow;
