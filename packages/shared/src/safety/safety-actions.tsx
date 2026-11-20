import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { useI18n, useRowDirection } from '../i18n';
import { spacing } from '../theme';
import { Button, InlineMessage } from '../ui';

import { createShareLink, SITE_URL, type SafetyThread } from './api';

/**
 * Safety buttons for an order or booking: SOS (while active), share with family (customer, while
 * active, when the website address is set) and report a problem.
 */
export function SafetyActions({
  thread,
  active,
  canShare = false,
  onSos,
  onReport,
}: {
  thread: SafetyThread;
  active: boolean;
  canShare?: boolean;
  onSos: () => void;
  onReport: () => void;
}) {
  const { t } = useI18n();
  const row = useRowDirection();
  const [sharing, setSharing] = useState(false);
  const [failed, setFailed] = useState(false);

  const share = async () => {
    setSharing(true);
    setFailed(false);
    try {
      const url = await createShareLink(thread);
      const kind = t(thread.kind === 'order' ? 'safety.shareOrder' : 'safety.shareJob');
      await Share.share({ message: t('safety.shareMessage', { kind, url }) });
    } catch {
      setFailed(true);
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.wrap}>
      {active && canShare && SITE_URL ? (
        <Button label={t('safety.share')} icon="share-social-outline" variant="secondary" size="md" loading={sharing} onPress={() => void share()} />
      ) : null}
      {failed ? <InlineMessage tone="error" message={t('safety.shareFailed')} /> : null}
      <View style={[styles.row, { flexDirection: row }]}>
        {active ? <Button style={styles.sos} label={t('safety.sos')} icon="alert-circle" variant="danger" size="md" onPress={onSos} /> : null}
        <Button style={styles.flex} label={t('safety.report')} icon="flag-outline" variant="ghost" size="md" onPress={onReport} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { gap: spacing.sm },
  flex: { flex: 1 },
  sos: { flex: 0.6 },
});
