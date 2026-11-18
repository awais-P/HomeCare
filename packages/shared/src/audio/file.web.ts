import type { Recording } from './file';

/** Web: the recorder gives a blob: URL with WebM audio. */
export async function readRecording(uri: string): Promise<Recording> {
  const response = await fetch(uri);
  const bytes = await response.arrayBuffer();
  // Storage checks the type against the bucket's list, so drop parameters like ";codecs=opus".
  return { bytes, contentType: 'audio/webm', extension: 'webm' };
}
