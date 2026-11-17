import { DeleteAccountScreen } from '@homecare/shared/auth';
import { supabase } from '@homecare/shared/lib';

/** Partners also lose their CNIC photos and selfie, which live in private storage. */
async function removePartnerDocuments() {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return;
  const bucket = supabase.storage.from('partner-documents');
  const { data: files } = await bucket.list(userId);
  if (files?.length) await bucket.remove(files.map((f) => `${userId}/${f.name}`));
}

export default function PartnerDeleteAccountScreen() {
  return <DeleteAccountScreen beforeDelete={removePartnerDocuments} extraNoteKey="delete.partnerBody" />;
}
