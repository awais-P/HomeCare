import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { useI18n } from '../i18n';
import { spacing, useColors } from '../theme';
import { AppText, BackHeader, Button, InlineMessage, Screen, TextField } from '../ui';

import { raiseSos, type SafetyThread } from './api';

/** Emergency: call the police or Rescue, or alert the HomeCare team with your location. */
export function SosScreen({ thread }: { thread: SafetyThread | null }) {
  const { t } = useI18n();
  const colors = useColors();
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  const alertTeam = async () => {
    setState('sending');
    try {
      await raiseSos(thread, note);
      setState('sent');
    } catch {
      setState('failed');
    }
  };

  return (
    <Screen header={<BackHeader title={t('safety.sosTitle')} />}>
      <View style={styles.content}>
        <View style={[styles.badge, { backgroundColor: colors.dangerSoft }]}>
          <Ionicons name="alert-circle" size={56} color={colors.danger} />
        </View>
        <AppText variant="body" align="center">
          {t('safety.sosBody')}
        </AppText>

        <Button label={t('safety.callPolice')} icon="call" variant="danger" onPress={() => void Linking.openURL('tel:15')} />
        <Button label={t('safety.callRescue')} icon="medkit" variant="danger" onPress={() => void Linking.openURL('tel:1122')} />

        <View style={styles.team}>
          <TextField
            label={t('safety.alertTeam')}
            placeholder={t('safety.notePlaceholder')}
            value={note}
            onChangeText={setNote}
            maxLength={300}
            editable={state !== 'sent'}
          />
          {state === 'sent' ? (
            <InlineMessage tone="success" message={t('safety.alertSent')} />
          ) : (
            <Button
              label={t('safety.alertTeam')}
              icon="shield-checkmark"
              loading={state === 'sending'}
              onPress={() => void alertTeam()}
            />
          )}
          {state === 'failed' ? <InlineMessage tone="error" message={t('safety.alertFailed')} /> : null}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  badge: { alignSelf: 'center', width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  team: { gap: spacing.sm, marginTop: spacing.md },
});
