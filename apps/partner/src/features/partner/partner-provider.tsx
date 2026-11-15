import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@homecare/shared/auth';
import { supabase, type Partner, type PartnerInsert } from '@homecare/shared/lib';

import { listUploadedDocuments, uploadDocument as upload, type DocumentKind, type PickedPhoto } from './documents';

type Status = 'loading' | 'ready' | 'error';

type PartnerContextValue = {
  /** The signed-in user's partner application, or null if they haven't started one. */
  partner: Partner | null;
  status: Status;
  documents: Set<DocumentKind>;
  reload: () => void;
  setPartner: (partner: Partner) => void;
  /** Creates or updates the application's details. */
  saveApplication: (values: PartnerInsert) => Promise<Partner>;
  uploadDocument: (kind: DocumentKind, photo: PickedPhoto) => Promise<void>;
  /** Sends the application for review. Throws 'application_incomplete' (details list what's missing). */
  submit: () => Promise<Partner>;
};

const PartnerContext = createContext<PartnerContextValue | null>(null);

export function PartnerProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [partner, setPartner] = useState<Partner | null>(null);
  const [documents, setDocuments] = useState<Set<DocumentKind>>(new Set());
  const [status, setStatus] = useState<Status>('loading');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase.from('partners').select('*').eq('id', userId).maybeSingle();
      if (!active) return;
      if (error) {
        setStatus('error');
        return;
      }
      setPartner(data);
      setStatus('ready');
      const docs = await listUploadedDocuments(userId).catch(() => new Set<DocumentKind>());
      if (active) setDocuments(docs);
    })();
    return () => {
      active = false;
    };
  }, [userId, reloadToken]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  const saveApplication = useCallback(
    async (values: PartnerInsert) => {
      const query = partner
        ? supabase.from('partners').update(values).eq('id', userId)
        : supabase.from('partners').insert(values);
      const { data, error } = await query.select('*').single();
      if (error) throw error;
      setPartner(data);
      return data;
    },
    [partner, userId],
  );

  const uploadDocument = useCallback(
    async (kind: DocumentKind, photo: PickedPhoto) => {
      await upload(userId, kind, photo);
      setDocuments((prev) => new Set(prev).add(kind));
    },
    [userId],
  );

  const submit = useCallback(async () => {
    const { data, error } = await supabase.rpc('submit_partner_application');
    if (error) throw error;
    setPartner(data);
    return data;
  }, []);

  const value = useMemo<PartnerContextValue>(
    () => ({ partner, status, documents, reload, setPartner, saveApplication, uploadDocument, submit }),
    [partner, status, documents, reload, saveApplication, uploadDocument, submit],
  );

  return <PartnerContext.Provider value={value}>{children}</PartnerContext.Provider>;
}

export function usePartner(): PartnerContextValue {
  const ctx = useContext(PartnerContext);
  if (!ctx) throw new Error('usePartner must be used inside <PartnerProvider>');
  return ctx;
}
