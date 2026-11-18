import { File } from 'expo-file-system';

/** A finished recording, ready to upload to Storage. */
export type Recording = { bytes: ArrayBuffer; contentType: string; extension: 'm4a' | 'webm' };

/** Reads a recording (file:// uri from the recorder). Android and iOS record AAC in an .m4a file. */
export async function readRecording(uri: string): Promise<Recording> {
  const bytes = await new File(uri).arrayBuffer();
  return { bytes, contentType: 'audio/mp4', extension: 'm4a' };
}
