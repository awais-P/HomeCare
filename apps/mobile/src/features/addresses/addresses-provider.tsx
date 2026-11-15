import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@homecare/shared/auth';
import type { Address, AddressInsert, AddressUpdate } from '@homecare/shared/lib';
import { readItem, writeItem } from '@homecare/shared/lib';

import * as api from './api';

type Status = 'loading' | 'ready' | 'error';

type AddressesContextValue = {
  addresses: Address[];
  status: Status;
  /** Service zones as GeoJSON for the map overlay (null until loaded). */
  zones: GeoJSON.FeatureCollection | null;
  /** The address orders go to: the one picked on Home, else the default. */
  selected: Address | null;
  select: (id: string) => void;
  reload: () => void;
  create: (input: AddressInsert) => Promise<Address>;
  update: (id: string, patch: AddressUpdate) => Promise<Address>;
  remove: (id: string) => Promise<void>;
  makeDefault: (id: string) => Promise<void>;
};

const AddressesContext = createContext<AddressesContextValue | null>(null);

const selectedKey = (userId: string) => `homecare.selectedAddress.${userId}`;

export function AddressesProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [zones, setZones] = useState<GeoJSON.FeatureCollection | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => (userId ? readItem(selectedKey(userId)) : null));
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .listAddresses()
      .then((rows) => {
        if (!active) return;
        setAddresses(rows);
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [reloadToken]);

  useEffect(() => {
    let active = true;
    api
      .fetchServiceZones()
      .then((fc) => {
        if (active) setZones(fc);
      })
      .catch(() => {
        // The overlay is a nice-to-have; the server still checks every address.
      });
    return () => {
      active = false;
    };
  }, []);

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      if (userId) writeItem(selectedKey(userId), id);
    },
    [userId],
  );

  const reload = useCallback(() => {
    setStatus('loading');
    setReloadToken((n) => n + 1);
  }, []);

  const refreshList = useCallback(async () => {
    setAddresses(await api.listAddresses());
  }, []);

  const create = useCallback(
    async (input: AddressInsert) => {
      const created = await api.createAddress(input);
      await refreshList();
      select(created.id);
      return created;
    },
    [refreshList, select],
  );

  const update = useCallback(
    async (id: string, patch: AddressUpdate) => {
      const updated = await api.updateAddress(id, patch);
      await refreshList();
      return updated;
    },
    [refreshList],
  );

  const remove = useCallback(
    async (id: string) => {
      await api.deleteAddress(id);
      await refreshList();
    },
    [refreshList],
  );

  const makeDefault = useCallback(
    async (id: string) => {
      await api.updateAddress(id, { is_default: true });
      await refreshList();
    },
    [refreshList],
  );

  const selected = useMemo(
    () =>
      addresses.find((a) => a.id === selectedId) ?? addresses.find((a) => a.is_default) ?? addresses[0] ?? null,
    [addresses, selectedId],
  );

  const value = useMemo<AddressesContextValue>(
    () => ({ addresses, status, zones, selected, select, reload, create, update, remove, makeDefault }),
    [addresses, status, zones, selected, select, reload, create, update, remove, makeDefault],
  );

  return <AddressesContext.Provider value={value}>{children}</AddressesContext.Provider>;
}

export function useAddresses(): AddressesContextValue {
  const ctx = useContext(AddressesContext);
  if (!ctx) throw new Error('useAddresses must be used inside <AddressesProvider>');
  return ctx;
}
