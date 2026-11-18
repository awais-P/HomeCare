import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { useAuth } from '@homecare/shared/auth';
import { useI18n, useRowDirection } from '@homecare/shared/i18n';
import { supabase, type Partner } from '@homecare/shared/lib';
import { AppMap } from '@homecare/shared/map';
import { radius, spacing, useColors } from '@homecare/shared/theme';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  IconCircle,
  InlineMessage,
  Screen,
} from '@homecare/shared/ui';

import { openAppSettings } from '@/features/partner/background-location';
import { useOnlineStatus } from '@/features/partner/online';
import { usePartner } from '@/features/partner/partner-provider';
import { JobsPanel } from '@/features/partner/jobs-panel';
import { ROLE_ICON, ROLE_KEY } from '@/features/partner/labels';

/**
 * The partner's home. What it shows depends on the application:
 *   none / draft → how to apply · pending → under review · rejected → reason + fix
 *   approved → online dashboard · suspended → dashboard, locked offline
 */
export default function PartnerHomeScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  const { partner, status, reload } = usePartner();

  const header = (
    <View style={[styles.header, { flexDirection: row }]}>
      <AppText variant="heading" style={styles.flex}>
        {t('partner.appName')}
      </AppText>
      <IconButton icon="person-circle-outline" accessibilityLabel={t('tabs.account')} onPress={() => router.push('/account')} />
    </View>
  );

  if (status === 'loading') {
    return (
      <Screen header={header} scroll={false}>
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      </Screen>
    );
  }
  if (status === 'error') {
    return (
      <Screen header={header} scroll={false}>
        <EmptyState
          icon="cloud-offline-outline"
          title={t('errors.profileLoadTitle')}
          body={t('errors.profileLoadBody')}
          action={<Button label={t('common.retry')} onPress={reload} />}
        />
      </Screen>
    );
  }

  let content;
  if (!partner || partner.status === 'draft') content = <ApplyIntro started={Boolean(partner)} />;
  else if (partner.status === 'pending') content = <PendingCard partner={partner} onRefresh={reload} />;
  else if (partner.status === 'rejected') content = <RejectedCard partner={partner} />;
  else content = <Dashboard partner={partner} />;

  return <Screen header={header}>{content}</Screen>;
}

function ApplyIntro({ started }: { started: boolean }) {
  const { t } = useI18n();
  const row = useRowDirection();
  const steps = [
    ['briefcase-outline', 'partner.intro.step1'],
    ['id-card-outline', 'partner.intro.step2'],
    ['time-outline', 'partner.intro.step3'],
  ] as const;
  return (
    <View style={styles.section}>
      <IconCircle icon="ribbon-outline" size={64} />
      <AppText variant="title">{t('partner.intro.title')}</AppText>
      <AppText color="textMuted">{t('partner.intro.body')}</AppText>
      <Card style={styles.steps}>
        {steps.map(([icon, key], i) => (
          <View key={key} style={[styles.step, { flexDirection: row }]}>
            <IconCircle icon={icon} size={36} />
            <AppText variant="bodyStrong" style={styles.flex}>
              {`${i + 1}. ${t(key)}`}
            </AppText>
          </View>
        ))}
      </Card>
      <Button
        label={t(started ? 'partner.intro.continue' : 'partner.intro.start')}
        icon="arrow-forward"
        onPress={() => router.push('/apply')}
      />
    </View>
  );
}

function PendingCard({ partner, onRefresh }: { partner: Partner; onRefresh: () => void }) {
  const { t, language } = useI18n();
  const submitted = partner.submitted_at
    ? new Date(partner.submitted_at).toLocaleDateString(language === 'ur' ? 'ur-PK' : 'en-PK', { day: 'numeric', month: 'short' })
    : null;
  return (
    <EmptyState
      icon="hourglass-outline"
      title={t('partner.status.pendingTitle')}
      body={[t('partner.status.pendingBody'), submitted ? t('partner.status.submittedOn', { date: submitted }) : null]
        .filter(Boolean)
        .join('\n\n')}
      action={<Button label={t('partner.status.refresh')} variant="outline" icon="refresh" onPress={onRefresh} />}
    />
  );
}

function RejectedCard({ partner }: { partner: Partner }) {
  const { t } = useI18n();
  return (
    <View style={styles.section}>
      <IconCircle icon="alert-circle-outline" tint="dangerSoft" color="danger" size={64} />
      <AppText variant="title">{t('partner.status.rejectedTitle')}</AppText>
      {partner.status_reason ? (
        <InlineMessage tone="error" message={t('partner.status.rejectedReason', { reason: partner.status_reason })} />
      ) : null}
      <Button label={t('partner.status.fix')} icon="create-outline" onPress={() => router.push('/apply')} />
    </View>
  );
}

function Dashboard({ partner }: { partner: Partner }) {
  const { t, language } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  const { profile } = useAuth();
  const { online, busy, error, lastUpdate, goOnline, goOffline, background, sharingInBackground, allowBackground } = useOnlineStatus();
  const [zones, setZones] = useState<GeoJSON.FeatureCollection | null>(null);
  const suspended = partner.status === 'suspended';

  useEffect(() => {
    let active = true;
    supabase.rpc('service_zones_geojson').then(({ data }) => {
      if (active && data) setZones(data as unknown as GeoJSON.FeatureCollection);
    });
    return () => {
      active = false;
    };
  }, []);

  const center =
    partner.last_latitude != null && partner.last_longitude != null
      ? { latitude: partner.last_latitude, longitude: partner.last_longitude }
      : { latitude: 33.676, longitude: 73.015 };

  return (
    <View style={styles.section}>
      <View style={[styles.identity, { flexDirection: row }]}>
        <IconCircle icon={ROLE_ICON[partner.role]} size={44} />
        <View style={styles.flex}>
          <AppText variant="heading" numberOfLines={1}>
            {profile?.full_name ?? ''}
          </AppText>
          <Badge label={t('partner.home.verified', { role: t(ROLE_KEY[partner.role]) })} />
        </View>
      </View>

      {suspended ? (
        <InlineMessage
          tone="error"
          message={[t('partner.status.suspendedTitle'), partner.status_reason, t('partner.status.suspendedBody')]
            .filter(Boolean)
            .join(' · ')}
        />
      ) : null}

      <Card style={[styles.onlineCard, { borderColor: online ? colors.success : colors.border }]}>
        <View style={[styles.onlineRow, { flexDirection: row }]}>
          <View style={[styles.dot, { backgroundColor: online ? colors.success : colors.textSubtle }]} />
          <View style={styles.flex}>
            <AppText variant="heading">{t(online ? 'partner.home.online' : 'partner.home.offline')}</AppText>
            <AppText variant="caption" color="textMuted">
              {t(online ? 'partner.home.onlineBody' : 'partner.home.offlineBody')}
            </AppText>
          </View>
        </View>
        {online && lastUpdate ? (
          <AppText variant="small" color="textSubtle">
            {t('partner.home.lastUpdate', {
              time: lastUpdate.toLocaleTimeString(language === 'ur' ? 'ur-PK' : 'en-PK', { hour: 'numeric', minute: '2-digit' }),
            })}
          </AppText>
        ) : null}
        {online && sharingInBackground ? (
          <View style={[styles.onlineRow, { flexDirection: row }]}>
            <Ionicons name="lock-closed" size={14} color={colors.success} />
            <AppText variant="small" color="textMuted" style={styles.flex}>
              {t('bgLocation.on')}
            </AppText>
          </View>
        ) : null}
        {online && Platform.OS !== 'web' && background !== null && background !== 'granted' ? (
          <View style={[styles.bgCard, { backgroundColor: colors.surfaceAlt }]}>
            <AppText variant="bodyStrong">{t('bgLocation.title')}</AppText>
            <AppText variant="caption" color="textMuted">
              {background === 'denied' ? t('bgLocation.denied') : t('bgLocation.body')}
            </AppText>
            <Button
              label={background === 'denied' ? t('bgLocation.settings') : t('bgLocation.allow')}
              icon="location-outline"
              variant="secondary"
              size="md"
              onPress={() => void (background === 'denied' ? openAppSettings() : allowBackground())}
            />
          </View>
        ) : null}
        {error ? <InlineMessage tone="error" message={t(error)} /> : null}
        <Button
          label={t(online ? 'partner.home.goOffline' : 'partner.home.goOnline')}
          icon={online ? 'pause-circle-outline' : 'radio-button-on'}
          variant={online ? 'danger' : 'primary'}
          loading={busy}
          disabled={suspended && !online}
          onPress={() => void (online ? goOffline() : goOnline())}
        />
      </Card>

      <JobsPanel partner={partner} online={online} />

      <View style={[styles.mapCard, { borderColor: colors.border }]}>
        <AppMap initialCenter={center} initialZoom={13} zones={zones} showUserLocation={online} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm },
  loading: { marginTop: spacing.xxxl },
  section: { gap: spacing.lg },
  steps: { gap: spacing.md },
  step: { alignItems: 'center', gap: spacing.md },
  identity: { alignItems: 'center', gap: spacing.md },
  onlineCard: { gap: spacing.md, borderWidth: 2 },
  onlineRow: { alignItems: 'center', gap: spacing.md },
  bgCard: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  dot: { width: 14, height: 14, borderRadius: 7 },
  mapCard: { height: 220, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1 },
});
