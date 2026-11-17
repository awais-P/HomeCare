import { supabase } from '@homecare/shared/lib';
import { base64ToArrayBuffer, photoExtension, pickPhoto, type PickedPhoto, type PickResult } from '@homecare/shared/media';

export type { PickedPhoto } from '@homecare/shared/media';

/** Verification photos. Stored privately at partner-documents/<user id>/<kind>.<ext>. */
export type DocumentKind = 'cnic_front' | 'cnic_back' | 'selfie';
export const DOCUMENT_KINDS: DocumentKind[] = ['cnic_front', 'cnic_back', 'selfie'];

const BUCKET = 'partner-documents';
const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;

const isKind = (value: string): value is DocumentKind => (DOCUMENT_KINDS as string[]).includes(value);

/** Which documents are already uploaded for this partner. */
export async function listUploadedDocuments(userId: string): Promise<Set<DocumentKind>> {
  const { data, error } = await supabase.storage.from(BUCKET).list(userId);
  if (error) throw error;
  return new Set(data.map((file) => file.name.split('.')[0]).filter(isKind));
}

/** Back camera (cropping allowed) for the CNIC, front camera for the selfie. */
export function pickDocumentPhoto(kind: DocumentKind, source: 'camera' | 'library'): Promise<PickResult> {
  return pickPhoto(source, { front: kind === 'selfie', allowsEditing: kind !== 'selfie' });
}

/** Uploads (or replaces) one document photo. */
export async function uploadDocument(userId: string, kind: DocumentKind, photo: PickedPhoto): Promise<void> {
  const ext = photoExtension(photo.mimeType);
  const path = `${userId}/${kind}.${ext}`;
  // Remove an older copy saved with a different file type, so each kind has one file.
  const stale = EXTENSIONS.filter((e) => e !== ext).map((e) => `${userId}/${kind}.${e}`);
  await supabase.storage.from(BUCKET).remove(stale);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, base64ToArrayBuffer(photo.base64), { contentType: photo.mimeType, upsert: true });
  if (error) throw error;
}
