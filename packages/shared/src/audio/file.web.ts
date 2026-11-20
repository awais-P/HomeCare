import type { Recording } from './file';

/** Web: the recorder gives a blob: URL with WebM audio. */
export async function readRecording(uri: string): Promise<Recording> {
  const response = await fetch(uri);
  const bytes = await response.arrayBuffer();
  // Storage checks the type against the bucket's list, so drop parameters like ";codecs=opus".
  return { bytes, contentType: 'audio/webm', extension: 'webm' };
}

/** The recording as base64 (for sending in a JSON request). */
export async function readRecordingBase64(uri: string): Promise<{ base64: string; mime: string }> {
  const blob = await (await fetch(uri)).blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mime: 'audio/webm' };
}
