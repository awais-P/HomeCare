import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useI18n } from '@/i18n/i18n-provider';
import type { Profile, ProfileUpdate } from '@/lib/database.types';
import { readJson, writeJson } from '@/lib/storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * Where the user is in the sign-in journey. The root layout uses this to decide which
 * route group (auth / onboarding / app) is reachable.
 */
export type AuthGate = 'loading' | 'signedOut' | 'needsProfile' | 'ready' | 'profileError';

type AuthContextValue = {
  gate: AuthGate;
  session: Session | null;
  profile: Profile | null;
  /** Sends an SMS code. Throws a Supabase error on failure. */
  sendOtp: (phoneE164: string) => Promise<void>;
  /** Verifies the SMS code and signs in. Throws a Supabase error on failure. */
  verifyOtp: (phoneE164: string, code: string) => Promise<void>;
  /** Updates the signed-in user's profile. Throws on failure. */
  updateProfile: (patch: ProfileUpdate) => Promise<Profile>;
  retryProfile: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const profileCacheKey = (userId: string) => `homecare.profile.${userId}`;

/** Result of the last profile load. Applies only while it matches the signed-in user. */
type ProfileResult =
  | { status: 'ready'; userId: string; profile: Profile }
  | { status: 'error'; userId: string };

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setLanguage } = useI18n();
  // Without Supabase settings there is no session to restore, so we are "loaded" immediately.
  const [sessionLoaded, setSessionLoaded] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profileResult, setProfileResult] = useState<ProfileResult | null>(null);
  const [profileReloadToken, setProfileReloadToken] = useState(0);
  const languageSyncedFor = useRef<string | null>(null);

  // 1. Session: restore from storage, then follow sign-in / sign-out / token refresh events.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session);
      })
      .finally(() => {
        if (active) setSessionLoaded(true);
      });

    // Keep this callback synchronous: awaiting other Supabase calls inside it can deadlock.
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  // 2. Profile: load whenever the signed-in user changes. Falls back to a cached copy offline.
  useEffect(() => {
    if (!userId) return;
    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (!active) return;

      if (data) {
        writeJson(profileCacheKey(userId), data);
        setProfileResult({ status: 'ready', userId, profile: data });
        return;
      }
      const cached = readJson<Profile>(profileCacheKey(userId));
      if (cached) {
        setProfileResult({ status: 'ready', userId, profile: cached });
        return;
      }
      if (__DEV__ && error) console.warn('[auth] profile load failed', error);
      setProfileResult({ status: 'error', userId });
    })();

    return () => {
      active = false;
    };
  }, [userId, profileReloadToken]);

  // Anything loaded for a previous user (or before sign-out) is ignored.
  const currentProfile = profileResult && profileResult.userId === userId ? profileResult : null;
  const profile = currentProfile?.status === 'ready' ? currentProfile.profile : null;

  // A returning user on a new phone gets the language saved on their profile (once per sign-in).
  useEffect(() => {
    if (!profile || !profile.full_name) return;
    if (languageSyncedFor.current === profile.id) return;
    languageSyncedFor.current = profile.id;
    setLanguage(profile.language);
  }, [profile, setLanguage]);

  const gate: AuthGate = useMemo(() => {
    if (!sessionLoaded) return 'loading';
    if (!session) return 'signedOut';
    if (!currentProfile) return 'loading';
    if (currentProfile.status === 'error') return 'profileError';
    return currentProfile.profile.full_name ? 'ready' : 'needsProfile';
  }, [sessionLoaded, session, currentProfile]);

  const sendOtp = useCallback(async (phoneE164: string) => {
    const { error } = await supabase.auth.signInWithOtp({ phone: phoneE164 });
    if (error) throw error;
  }, []);

  const verifyOtp = useCallback(async (phoneE164: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({ phone: phoneE164, token: code, type: 'sms' });
    if (error) throw error;
  }, []);

  const updateProfile = useCallback(
    async (patch: ProfileUpdate) => {
      if (!userId) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', userId)
        .select('*')
        .single();
      if (error) throw error;
      writeJson(profileCacheKey(userId), data);
      setProfileResult({ status: 'ready', userId, profile: data });
      return data;
    },
    [userId],
  );

  const retryProfile = useCallback(() => {
    setProfileResult(null); // back to 'loading' while we try again
    setProfileReloadToken((n) => n + 1);
  }, []);

  const signOut = useCallback(async () => {
    if (userId) writeJson(profileCacheKey(userId), null);
    languageSyncedFor.current = null;
    // 'local' signs out this phone only; it also clears the session when offline.
    await supabase.auth.signOut({ scope: 'local' });
  }, [userId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      gate,
      session,
      profile,
      sendOtp,
      verifyOtp,
      updateProfile,
      retryProfile,
      signOut,
    }),
    [gate, session, profile, sendOtp, verifyOtp, updateProfile, retryProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
