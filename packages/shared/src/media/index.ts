import * as ImagePicker from 'expo-image-picker';

/** A photo picked from the camera or gallery, ready to upload. */
export type PickedPhoto = { base64: string; mimeType: string };
export type PickResult = { status: 'ok'; photo: PickedPhoto } | { status: 'cancelled' } | { status: 'denied' };

/** Opens the camera or the gallery and returns a compressed photo. */
export async function pickPhoto(
  source: 'camera' | 'library',
  { front = false, allowsEditing = false }: { front?: boolean; allowsEditing?: boolean } = {},
): Promise<PickResult> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, base64: true, allowsEditing };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };
    result = await ImagePicker.launchCameraAsync({
      ...options,
      cameraType: front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    });
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset?.base64) return { status: 'cancelled' };
  return { status: 'ok', photo: { base64: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' } };
}

export function photoExtension(mimeType: string): 'png' | 'webp' | 'jpg' {
  return mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
