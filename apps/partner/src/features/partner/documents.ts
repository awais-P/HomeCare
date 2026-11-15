import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@homecare/shared/lib';

/** Verification photos. Stored privately at partner-documents/<user id>/<kind>.<ext>. */
export type DocumentKind = 'cnic_front' | 'cnic_back' | 'selfie';
export const DOCUMENT_KINDS: DocumentKind[] = ['cnic_front', 'cnic_back', 'selfie'];

const BUCKET = 'partner-documents';
const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;

export type PickedPhoto = { base64: string; mimeType: string };
export type PickResult = { status: 'ok'; photo: PickedPhoto } | { status: 'cancelled' } | { status: 'denied' };

const isKind = (value: string): value is DocumentKind => (DOCUMENT_KINDS as string[]).includes(value);

/** Which documents are already uploaded for this partner. */
export async function listUploadedDocuments(userId: string): Promise<Set<DocumentKind>> {
  const { data, error } = await supabase.storage.from(BUCKET).list(userId);
  if (error) throw error;
  return new Set(data.map((file) => file.name.split('.')[0]).filter(isKind));
}

/** Opens the camera (back camera for the CNIC, front for the selfie) or the gallery. */
export async function pickDocumentPhoto(kind: DocumentKind, source: 'camera' | 'library'): Promise<PickResult> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.6,
    base64: true,
    allowsEditing: kind !== 'selfie',
  };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };
    result = await ImagePicker.launchCameraAsync({
      ...options,
      cameraType: kind === 'selfie' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    });
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset?.base64) return { status: 'cancelled' };
  return { status: 'ok', photo: { base64: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' } };
}

/** Uploads (or replaces) one document photo. */
export async function uploadDocument(userId: string, kind: DocumentKind, photo: PickedPhoto): Promise<void> {
  const ext = photo.mimeType === 'image/png' ? 'png' : photo.mimeType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/${kind}.${ext}`;
  // Remove an older copy saved with a different file type, so each kind has one file.
  const stale = EXTENSIONS.filter((e) => e !== ext).map((e) => `${userId}/${kind}.${e}`);
  await supabase.storage.from(BUCKET).remove(stale);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, base64ToArrayBuffer(photo.base64), { contentType: photo.mimeType, upsert: true });
  if (error) throw error;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
