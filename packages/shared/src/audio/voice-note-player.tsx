import Ionicons from '@expo/vector-icons/Ionicons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useI18n, useRowDirection } from '../i18n';
import { radius, spacing, useColors } from '../theme';
import { AppText } from '../ui';

import { formatDuration } from './format';

/** Play / pause for a voice note, with progress and length. `uri` should stay the same while playing. */
export function VoiceNotePlayer({ uri, durationMs }: { uri: string | null; durationMs?: number }) {
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  const source = useMemo(() => (uri ? { uri } : null), [uri]);
  const player = useAudioPlayer(source, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);

  const total = status.duration > 0 ? status.duration * 1000 : (durationMs ?? 0);
  const at = status.currentTime * 1000;
  const progress = total > 0 ? Math.min(1, at / total) : 0;
  const loading = !!uri && !status.isLoaded;

  const toggle = async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish || (total > 0 && at >= total - 250)) await player.seekTo(0);
    player.play();
  };

  return (
    <View style={[styles.wrap, { flexDirection: row, backgroundColor: colors.saudaSoft }]}>
      <Pressable
        onPress={() => void toggle()}
        disabled={!uri || loading}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? t('voice.pause') : t('voice.play')}
        style={[styles.button, { backgroundColor: colors.sauda }]}>
        {loading ? (
          <ActivityIndicator color={colors.onPrimary} size="small" />
        ) : (
          <Ionicons name={status.playing ? 'pause' : 'play'} size={22} color={colors.onPrimary} />
        )}
      </Pressable>
      <View style={styles.flex}>
        <AppText variant="label">{t('voice.note')}</AppText>
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: colors.sauda }]} />
        </View>
      </View>
      <AppText variant="small" color="textMuted">
        {status.playing || at > 0 ? `${formatDuration(at)} / ${formatDuration(total)}` : formatDuration(total)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg },
  button: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: spacing.xs },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4 },
});
