import { createClient } from '@supabase/supabase-js';

import type { Database } from '@homecare/shared/db-types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isConfigured = Boolean(url && key);

export const supabase = createClient<Database>(url ?? 'https://not-configured.supabase.co', key ?? 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'homecare-admin-auth' },
});
