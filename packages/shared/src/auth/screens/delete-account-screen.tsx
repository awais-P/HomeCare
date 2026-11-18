import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { supabase } from '../../lib';
import { spacing } from '../../theme';
import { AppText, BackHeader, Button, IconCircle, InlineMessage, Screen, TextField } from '../../ui';
import { errorMessageKey } from '../errors';

/**
 * Deletes the signed-in user's account (Google Play requirement).
 * `beforeDelete` removes the app's own files first (Storage can't be cleared from the database).
 */
export function DeleteAccountScreen({
  beforeDelete,
  extraNoteKey,
}: {
  beforeDelete?: () => Promise<void>;
  extraNoteKey?: TranslationKey;
}) {
  const { t } = useI18n();
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const confirmed = confirmText.trim().toUpperCase() === 'DELETE';

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      // Check for an order in progress before removing any files.
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (userId) {
        const { data: active } = await supabase
          .from('orders')
          .select('id')
          .or(`customer_id.eq.${userId},rider_id.eq.${userId}`)
          .in('status', ['accepted', 'at_shop', 'on_the_way'])
          .limit(1);
        if (active?.length) {
          setError('delete.activeOrder');
          return;
        }
      }
      await beforeDelete?.().catch(() => {});
      const { error: rpcError } = await supabase.rpc('delete_my_account');
      if (rpcError) {
        setError(/active_(order|job)/.test(rpcError.message) ? 'delete.activeOrder' : errorMessageKey(rpcError));
        return;
      }
      // The account is gone; clear the session on this phone. The app returns to the welcome screen.
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={<BackHeader title={t('account.deleteAccount')} />}
      footer={<Button label={t('delete.button')} variant="danger" icon="trash-outline" loading={busy} disabled={!confirmed} onPress={() => void remove()} />}>
      <View style={styles.content}>
        <IconCircle icon="trash-outline" tint="dangerSoft" color="danger" size={64} />
        <AppText variant="title">{t('delete.title')}</AppText>
        <AppText>{t('delete.body')}</AppText>
        {extraNoteKey ? <AppText>{t(extraNoteKey)}</AppText> : null}
        <AppText variant="bodyStrong" color="danger">
          {t('delete.cannotUndo')}
        </AppText>
        <TextField
          label={t('delete.confirmLabel')}
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
          autoCorrect={false}
          forceLTR
          placeholder="DELETE"
        />
        {error ? <InlineMessage tone="error" message={t(error)} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
});
