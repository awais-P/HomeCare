/**
 * Types for the Supabase database, in the same shape `supabase gen types` produces.
 * Keep in sync with supabase/migrations. Once the project is linked you can regenerate with:
 *   npx supabase gen types typescript --project-id <project-ref> > apps/mobile/src/lib/database.types.ts
 */

export type AppLanguage = 'en' | 'ur';

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
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      app_language: AppLanguage;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];
