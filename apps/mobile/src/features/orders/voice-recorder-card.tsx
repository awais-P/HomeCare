import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatDuration, MAX_VOICE_MS, VoiceNotePlayer, type VoiceRecorder } from '@homecare/shared/audio';
import { useI18n, useRowDirection } from '@homecare/shared/i18n';
import { spacing, useColors } from '@homecare/shared/theme';
import { AppText, Button, Card } from '@homecare/shared/ui';

/** Record the shopping list as a voice note: record → stop → listen / delete. */
export function VoiceRecorderCard({ recorder, disabled }: { recorder: VoiceRecorder; disabled?: boolean }) {
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();

  if (recorder.uri) {
    return (
      <View style={styles.group}>
        <VoiceNotePlayer uri={recorder.uri} durationMs={recorder.durationMs} />
        <Button label={t('voice.delete')} icon="trash-outline" variant="ghost" size="md" disabled={disabled} onPress={recorder.discard} />
      </View>
    );
  }

  if (recorder.recording) {
    const left = MAX_VOICE_MS - recorder.durationMs;
    return (
      <Card style={[styles.recording, { flexDirection: row, borderColor: colors.danger }]}>
        <View style={[styles.dot, { backgroundColor: colors.danger }]} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{t('voice.recording', { time: formatDuration(recorder.durationMs) })}</AppText>
          {left < 20_000 ? (
            <AppText variant="caption" color="textMuted">
              {formatDuration(left)}
            </AppText>
          ) : null}
        </View>
        <Button label={t('voice.stop')} icon="stop" variant="danger" size="md" fullWidth={false} onPress={() => void recorder.stop()} />
      </Card>
    );
  }

  return (
    <View style={styles.group}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('voice.record')}
        disabled={disabled}
        onPress={() => void recorder.start()}
        style={({ pressed }) => [
          styles.start,
          { flexDirection: row, borderColor: colors.sauda, backgroundColor: pressed ? colors.saudaSoft : colors.surface },
        ]}>
        <View style={[styles.mic, { backgroundColor: colors.sauda }]}>
          <Ionicons name="mic" size={22} color={colors.onPrimary} />
        </View>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{t('voice.record')}</AppText>
          <AppText variant="caption" color="textMuted">
            {t('voice.recordHint')}
          </AppText>
        </View>
      </Pressable>
      {recorder.denied ? (
        <AppText variant="caption" color="danger">
          {t('voice.denied')}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: spacing.xs },
  recording: { alignItems: 'center', gap: spacing.md, borderWidth: 2 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  start: { alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed' },
  mic: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
