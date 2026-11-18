import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { errorMessageKey } from '@homecare/shared/auth';
import type { TranslationKey } from '@homecare/shared/i18n';
import { supabase } from '@homecare/shared/lib';
import { getDeviceLocation } from '@homecare/shared/location';

import {
  backgroundPermission,
  requestBackgroundPermission,
  startBackgroundSharing,
  stopBackgroundSharing,
  type BackgroundPermission,
} from './background-location';
import { usePartner } from './partner-provider';

/** How often an online partner's location is sent. */
const HEARTBEAT_MS = 15_000;

/**
 * Online / offline for approved partners. While online, the phone's location is sent every 15 s
 * (customers see it on their order map; offers go to the nearest partner). With "Allow all the
 * time" it keeps going while the phone is locked (a foreground service with a notification);
 * otherwise only while the app is open.
 */
export function useOnlineStatus() {
  const { partner, setPartner, reload } = usePartner();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const online = partner?.is_online ?? false;
  const [background, setBackground] = useState<BackgroundPermission | null>(null);
  const [sharingInBackground, setSharingInBackground] = useState(false);

  // Permission can change in Settings: check again whenever the app comes back to the front.
  useEffect(() => {
    let active = true;
    const check = () =>
      void backgroundPermission().then((p) => {
        if (active) setBackground(p);
      });
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  // Background sharing follows online / offline (and the permission).
  useEffect(() => {
    let active = true;
    (online && background === 'granted' ? startBackgroundSharing() : stopBackgroundSharing().then(() => false))
      .then((running) => {
        if (active) setSharingInBackground(running);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [online, background]);

  // While the app is open, also send from here (it shows "last update"); skipped when the
  // background service is already sending.
  useEffect(() => {
    if (!online) return;
    let active = true;
    const tick = async () => {
      const location = await getDeviceLocation();
      if (!active || location.status !== 'ok') return;
      if (sharingInBackground) {
        setLastUpdate(new Date());
        return;
      }
      const { error: rpcError } = await supabase.rpc('update_partner_location', {
        lat: location.coordinate.latitude,
        lng: location.coordinate.longitude,
      });
      if (!active) return;
      if (rpcError) {
        // The server says we're offline (e.g. suspended): refresh our state and stop.
        if (rpcError.message.includes('partner_offline')) reload();
        return;
      }
      setLastUpdate(new Date());
    };
    void tick();
    const timer = setInterval(() => void tick(), HEARTBEAT_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [online, reload, sharingInBackground]);

  const goOnline = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const location = await getDeviceLocation();
      if (location.status !== 'ok') {
        setError('partner.home.locationNeeded');
        return;
      }
      const { data, error: rpcError } = await supabase.rpc('set_partner_online', {
        p_online: true,
        lat: location.coordinate.latitude,
        lng: location.coordinate.longitude,
      });
      if (rpcError) {
        setError(rpcError.message.includes('partner_not_approved') ? 'partner.errors.notApproved' : errorMessageKey(rpcError));
        return;
      }
      setPartner(data);
      setLastUpdate(new Date());
    } finally {
      setBusy(false);
    }
  }, [setPartner]);

  const goOffline = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('set_partner_online', { p_online: false });
      if (rpcError) {
        setError(errorMessageKey(rpcError));
        return;
      }
      setPartner(data);
    } finally {
      setBusy(false);
    }
  }, [setPartner]);

  const allowBackground = useCallback(async () => {
    setBackground(await requestBackgroundPermission());
  }, []);

  return { online, busy, error, lastUpdate, goOnline, goOffline, background, sharingInBackground, allowBackground };
}
