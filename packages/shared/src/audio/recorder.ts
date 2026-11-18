import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';

/** Longest voice note (2 minutes, about 1 MB). */
export const MAX_VOICE_MS = 120_000;

/** Speech only: mono AAC at 64 kbps is plenty and keeps uploads small. */
const OPTIONS: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64_000 };

export type VoiceRecorder = {
  recording: boolean;
  /** Length so far while recording, or of the finished note. */
  durationMs: number;
  /** The finished note (file:// on phones, blob: on web), or null. */
  uri: string | null;
  denied: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  discard: () => void;
};

/** Records one voice note at a time; stops by itself at MAX_VOICE_MS. */
export function useVoiceRecorder(): VoiceRecorder {
  const recorder = useAudioRecorder(OPTIONS);
  const state = useAudioRecorderState(recorder, 250);
  const [uri, setUri] = useState<string | null>(null);
  const [finishedMs, setFinishedMs] = useState(0);
  const [denied, setDenied] = useState(false);

  const start = useCallback(async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setDenied(true);
      return;
    }
    setDenied(false);
    setUri(null);
    setFinishedMs(0);
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }, [recorder]);

  const stop = useCallback(async () => {
    const length = recorder.getStatus().durationMillis;
    await recorder.stop();
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    setFinishedMs(length);
    setUri(recorder.uri);
  }, [recorder]);

  const discard = useCallback(() => {
    setUri(null);
    setFinishedMs(0);
  }, []);

  const tooLong = state.isRecording && state.durationMillis >= MAX_VOICE_MS;
  useEffect(() => {
    if (!tooLong) return;
    const timer = setTimeout(() => void stop(), 0);
    return () => clearTimeout(timer);
  }, [tooLong, stop]);

  return {
    recording: state.isRecording,
    durationMs: state.isRecording ? state.durationMillis : finishedMs,
    uri,
    denied,
    start,
    stop,
    discard,
  };
}
