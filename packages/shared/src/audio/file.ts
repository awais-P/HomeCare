import { File } from 'expo-file-system';

/** A finished recording, ready to upload to Storage. */
export type Recording = { bytes: ArrayBuffer; contentType: string; extension: 'm4a' | 'webm' };

/** Reads a recording (file:// uri from the recorder). Android and iOS record AAC in an .m4a file. */
export async function readRecording(uri: string): Promise<Recording> {
  const bytes = await new File(uri).arrayBuffer();
  return { bytes, contentType: 'audio/mp4', extension: 'm4a' };
}

/** The recording as base64 (for sending in a JSON request). */
export async function readRecordingBase64(uri: string): Promise<{ base64: string; mime: string }> {
  return { base64: await new File(uri).base64(), mime: 'audio/mp4' };
}
