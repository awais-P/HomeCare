import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n, type TranslationKey } from '../i18n';
import type { Dispute, DisputeReason } from '../lib';
import { formatRupees } from '../orders';
import { spacing } from '../theme';
import { AppText, BackHeader, Badge, Button, Card, ChoiceChips, InlineMessage, Screen, TextField } from '../ui';

import { DISPUTE_REASON_KEY, DISPUTE_REASONS, DISPUTE_STATUS_KEY, disputeErrorKey, listMyDisputes, raiseDispute, type SafetyThread } from './api';

/** Report a problem on an order or booking, and see what happened to earlier reports. */
export function DisputeScreen({ thread, code }: { thread: SafetyThread; code: string }) {
  const { t } = useI18n();
  const [reason, setReason] = useState<DisputeReason>('other');
  const [details, setDetails] = useState('');
  const [mine, setMine] = useState<Dispute[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; key: TranslationKey } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const kind = thread.kind;
  const id = thread.id;

  useEffect(() => {
    let active = true;
    listMyDisputes({ kind, id })
      .then((list) => {
        if (active) setMine(list);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [kind, id, reloadToken]);

  const open = mine.some((d) => d.status === 'open' || d.status === 'in_review');

  const submit = async () => {
    if (details.trim().length < 5) {
      setMessage({ tone: 'error', key: 'dispute.detailsRequired' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await raiseDispute({ kind, id }, reason, details.trim());
      setDetails('');
      setMessage({ tone: 'success', key: 'dispute.sent' });
      setReloadToken((n) => n + 1);
    } catch (e) {
      setMessage({ tone: 'error', key: disputeErrorKey(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<BackHeader title={`${t('dispute.title')} · ${code}`} />}>
      <View style={styles.content}>
        {!open ? (
          <>
            <View style={styles.group}>
              <AppText variant="label" color="textMuted">
                {t('dispute.reason')}
              </AppText>
              <ChoiceChips<DisputeReason>
                value={reason}
                onChange={setReason}
                options={DISPUTE_REASONS.map((value) => ({ value, label: t(DISPUTE_REASON_KEY[value]) }))}
              />
            </View>
            <TextField
              label={t('dispute.details')}
              placeholder={t('dispute.detailsPlaceholder')}
              value={details}
              onChangeText={setDetails}
              multiline
              maxLength={1000}
              style={styles.multiline}
            />
            <Button label={t('dispute.submit')} icon="send" loading={busy} onPress={() => void submit()} />
          </>
        ) : null}
        {message ? <InlineMessage tone={message.tone} message={t(message.key)} /> : null}

        {mine.length ? (
          <View style={styles.group}>
            <AppText variant="label" color="textMuted">
              {t('dispute.yours')}
            </AppText>
            {mine.map((d) => (
              <Card key={d.id} style={styles.group}>
                <View style={styles.rowBetween}>
                  <AppText variant="bodyStrong">{t(DISPUTE_REASON_KEY[d.reason])}</AppText>
                  <Badge
                    label={t(DISPUTE_STATUS_KEY[d.status])}
                    tone={d.status === 'resolved' ? 'primary' : d.status === 'rejected' ? 'danger' : 'sauda'}
                  />
                </View>
                <AppText variant="caption" color="textMuted">
                  {d.code} · {new Date(d.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
                </AppText>
                <AppText>{d.details}</AppText>
                {d.resolution ? <InlineMessage tone="info" message={d.resolution} /> : null}
                {d.adjustment ? (
                  <AppText variant="bodyStrong" color={d.adjustment > 0 ? 'success' : 'danger'}>
                    {d.adjustment > 0
                      ? t('dispute.refund', { amount: formatRupees(d.adjustment) })
                      : t('dispute.charge', { amount: formatRupees(-d.adjustment) })}
                  </AppText>
                ) : null}
              </Card>
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl },
  group: { gap: spacing.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
});
