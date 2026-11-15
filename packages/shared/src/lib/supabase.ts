import './storage';

import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import type { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** False until apps/mobile/.env has the Supabase URL and publishable key. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

if (!isSupabaseConfigured && __DEV__) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY are missing. ' +
      'Copy apps/mobile/.env.example to apps/mobile/.env and restart Metro.',
  );
}

export const supabase = createClient<Database>(
  supabaseUrl ?? 'https://not-configured.supabase.co',
  supabasePublishableKey ?? 'not-configured',
  {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Refresh the session only while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
