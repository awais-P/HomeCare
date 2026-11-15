import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useI18n, useRowDirection } from '@homecare/shared/i18n';
import { spacing, useColors } from '@homecare/shared/theme';
import { AppText, BackHeader, Badge, Button, Card, IconCircle, InlineMessage, Screen } from '@homecare/shared/ui';

import { DOCUMENT_KINDS, pickDocumentPhoto, type DocumentKind } from '@/features/partner/documents';
import { submitErrorMessage } from '@/features/partner/labels';
import { usePartner } from '@/features/partner/partner-provider';

const DOC_ICON: Record<DocumentKind, 'card-outline' | 'card' | 'happy-outline'> = {
  cnic_front: 'card-outline',
  cnic_back: 'card',
  selfie: 'happy-outline',
};

/** Step 2 of the application: CNIC front, CNIC back and a selfie, then submit for review. */
export default function DocumentsScreen() {
  const { t } = useI18n();
  const { partner, documents, uploadDocument, submit } = usePartner();
  const [uploading, setUploading] = useState<DocumentKind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!partner) return <Redirect href="/apply" />;
  if (!['draft', 'rejected'].includes(partner.status)) return <Redirect href="/" />;

  const missing = DOCUMENT_KINDS.filter((kind) => !documents.has(kind));

  const choose = async (kind: DocumentKind, source: 'camera' | 'library') => {
    setNotice(null);
    const result = await pickDocumentPhoto(kind, source);
    if (result.status === 'denied') {
      setNotice(t('partner.docs.cameraDenied'));
      return;
    }
    if (result.status !== 'ok') return;
    setUploading(kind);
    try {
      await uploadDocument(kind, result.photo);
    } catch {
      setNotice(t('partner.docs.uploadFailed'));
    } finally {
      setUploading(null);
    }
  };

  const send = async () => {
    setNotice(null);
    setSubmitting(true);
    try {
      await submit();
      router.dismissTo('/');
    } catch (error) {
      setNotice(submitErrorMessage(error, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen
      header={<BackHeader title={t('partner.docs.title')} />}
      footer={
        <>
          {missing.length ? (
            <AppText variant="caption" color="textMuted" align="center">
              {t('partner.docs.missing', { items: missing.map((kind) => t(`partner.docs.${kind}`)).join(', ') })}
            </AppText>
          ) : null}
          <Button
            label={t('partner.docs.submit')}
            icon="send"
            loading={submitting}
            disabled={missing.length > 0 || uploading !== null}
            onPress={() => void send()}
          />
        </>
      }>
      <View style={styles.list}>
        <AppText color="textMuted">{t('partner.docs.subtitle')}</AppText>
        {partner.status === 'rejected' && partner.status_reason ? (
          <InlineMessage tone="error" message={t('partner.status.rejectedReason', { reason: partner.status_reason })} />
        ) : null}

        {DOCUMENT_KINDS.map((kind) => (
          <DocumentCard
            key={kind}
            kind={kind}
            done={documents.has(kind)}
            uploading={uploading === kind}
            disabled={uploading !== null}
            onPick={(source) => void choose(kind, source)}
          />
        ))}

        {notice ? <InlineMessage tone="error" message={notice} /> : null}

        <Button label={t('partner.docs.editDetails')} variant="ghost" size="md" icon="create-outline" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

function DocumentCard({
  kind,
  done,
  uploading,
  disabled,
  onPick,
}: {
  kind: DocumentKind;
  done: boolean;
  uploading: boolean;
  disabled: boolean;
  onPick: (source: 'camera' | 'library') => void;
}) {
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  return (
    <Card style={[styles.card, { borderColor: done ? colors.success : colors.border }]}>
      <View style={[styles.cardTop, { flexDirection: row }]}>
        <IconCircle icon={DOC_ICON[kind]} tint={done ? 'successSoft' : 'primarySoft'} color={done ? 'success' : 'primary'} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{t(`partner.docs.${kind}`)}</AppText>
          {kind === 'selfie' ? (
            <AppText variant="caption" color="textMuted">
              {t('partner.docs.selfieHint')}
            </AppText>
          ) : null}
        </View>
        {uploading ? (
          <ActivityIndicator color={colors.primary} />
        ) : done ? (
          <View style={[styles.done, { flexDirection: row }]}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Badge label={t('partner.docs.uploaded')} />
          </View>
        ) : null}
      </View>
      <View style={[styles.actions, { flexDirection: row }]}>
        <Button
          style={styles.flex}
          size="md"
          icon="camera"
          variant={done ? 'outline' : 'secondary'}
          label={t(done ? 'partner.docs.retake' : 'partner.docs.take')}
          disabled={disabled}
          onPress={() => onPick('camera')}
        />
        {kind !== 'selfie' ? (
          <Button
            style={styles.flex}
            size="md"
            icon="images-outline"
            variant="outline"
            label={t('partner.docs.choose')}
            disabled={disabled}
            onPress={() => onPick('library')}
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: spacing.lg },
  card: { gap: spacing.md, borderWidth: 2 },
  cardTop: { alignItems: 'center', gap: spacing.md },
  done: { alignItems: 'center', gap: spacing.xs },
  actions: { gap: spacing.sm },
});
