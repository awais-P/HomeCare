import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Avatar, CollapsibleSheet, IconCircle } from '@homecare/shared/ui';
import { useAddresses } from '@/features/addresses/addresses-provider';
import { addressSummary, addressTitle, LABEL_ICON } from '@/features/addresses/labels';
import { setLocationDraft } from '@/features/addresses/location-draft';
import { useAuth } from '@homecare/shared/auth';
import { ServiceTile } from '@/features/home/service-tile';
import { getDeviceLocation } from '@homecare/shared/location';
import { AppMap, type AppMapHandle, DEFAULT_CENTER } from '@homecare/shared/map';
import { useI18n, useRowDirection } from '@homecare/shared/i18n';
import { radius, spacing, useColors } from '@homecare/shared/theme';

export default function HomeScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { selected, addresses, zones, select } = useAddresses();

  const mapRef = useRef<AppMapHandle>(null);
  const [expanded, setExpanded] = useState(true);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [showUserLocation, setShowUserLocation] = useState(false);
  const [initialCenter] = useState(() =>
    selected ? { latitude: selected.latitude, longitude: selected.longitude } : DEFAULT_CENTER,
  );

  // Follow the selected delivery address.
  const selectedLat = selected?.latitude;
  const selectedLng = selected?.longitude;
  useEffect(() => {
    if (selectedLat !== undefined && selectedLng !== undefined) {
      mapRef.current?.flyTo({ latitude: selectedLat, longitude: selectedLng });
    }
  }, [selectedLat, selectedLng]);

  const marker = selectedLat !== undefined && selectedLng !== undefined ? { latitude: selectedLat, longitude: selectedLng } : null;
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? '';
  const otherPlaces = addresses.filter((a) => a.id !== selected?.id).slice(0, 2);

  // Ordering arrives in P4/P5; until then each service explains that it's coming.
  const comingSoon = () => Alert.alert(t('home.comingSoonTitle'), t('home.comingSoonBody'));

  const addAddress = () => {
    setLocationDraft(null);
    router.push('/address/pick');
  };

  const locateMe = async () => {
    const result = await getDeviceLocation();
    if (result.status === 'ok') {
      setShowUserLocation(true);
      mapRef.current?.flyTo(result.coordinate);
    } else {
      Alert.alert(t('home.locateMe'), t('address.pick.locationDenied'));
    }
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <AppMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialCenter={initialCenter}
        zones={zones}
        marker={marker}
        showUserLocation={showUserLocation}
        bottomInset={sheetHeight}
        onPress={() => setExpanded(false)}
        onMoveStart={() => setExpanded(false)}
      />

      {/* Top: greeting pill -> Account */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm, flexDirection: row }]} pointerEvents="box-none">
        <Pressable
          onPress={() => router.navigate('/account')}
          accessibilityRole="button"
          accessibilityLabel={t('tabs.account')}
          style={[styles.greeting, { flexDirection: row, backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Avatar name={profile?.full_name} size={32} />
          <AppText variant="label" numberOfLines={1} style={styles.greetingText}>
            {t('home.greeting', { name: firstName })}
          </AppText>
        </Pressable>
      </View>

      {/* Locate me, floating just above the sheet */}
      <Pressable
        onPress={() => void locateMe()}
        accessibilityRole="button"
        accessibilityLabel={t('home.locateMe')}
        style={[styles.fab, { bottom: sheetHeight + spacing.lg, backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="navigate" size={22} color={colors.text} />
      </Pressable>

      <CollapsibleSheet
        expanded={expanded}
        onExpandedChange={setExpanded}
        onVisibleHeightChange={setSheetHeight}
        header={
          <Pressable
            onPress={() => (selected ? router.push({ pathname: '/addresses', params: { mode: 'select' } }) : addAddress())}
            accessibilityRole="button"
            accessibilityLabel={selected ? `${t('home.deliverTo')}: ${addressTitle(selected, t)}` : t('home.addAddress')}
            style={[styles.addressRow, { flexDirection: row }]}>
            <IconCircle icon={selected ? LABEL_ICON[selected.label] : 'location'} size={40} />
            <View style={styles.flex}>
              <AppText variant="small" color="textMuted">
                {selected ? t('home.deliverTo') : t('home.addAddressHint')}
              </AppText>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {selected ? `${addressTitle(selected, t)} · ${addressSummary(selected)}` : t('home.addAddress')}
              </AppText>
            </View>
            <Ionicons name={selected ? 'chevron-down' : 'add-circle'} size={22} color={colors.primary} />
          </Pressable>
        }>
        <Pressable
          onPress={comingSoon}
          accessibilityRole="search"
          style={[styles.search, { flexDirection: row, backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="search" size={20} color={colors.textMuted} />
          <AppText color="textSubtle" numberOfLines={1} style={styles.flex}>
            {t('home.searchPlaceholder')}
          </AppText>
        </Pressable>

        <View style={styles.grid}>
          <View style={[styles.gridRow, { flexDirection: row }]}>
            <ServiceTile
              variant="feature"
              style={styles.flex}
              title={t('services.sauda.title')}
              caption={t('services.sauda.body')}
              icon="bag-handle"
              tint="saudaSoft"
              color="sauda"
              badge={t('common.comingSoon')}
              onPress={comingSoon}
            />
            <ServiceTile
              variant="feature"
              style={styles.flex}
              title={t('services.ustaad.title')}
              caption={t('services.ustaad.body')}
              icon="construct"
              tint="ustaadSoft"
              color="ustaad"
              badge={t('common.comingSoon')}
              onPress={comingSoon}
            />
          </View>
          <View style={[styles.gridRow, { flexDirection: row }]}>
            <ServiceTile
              style={styles.flex}
              title={t('services.sauda.cat.pharmacy')}
              icon="medkit"
              tint="dangerSoft"
              color="danger"
              onPress={comingSoon}
            />
            <ServiceTile
              style={styles.flex}
              title={t('services.sauda.cat.pickDrop')}
              icon="cube"
              tint="successSoft"
              color="success"
              onPress={comingSoon}
            />
          </View>
        </View>

        {otherPlaces.length ? (
          <View>
            {otherPlaces.map((address) => (
              <Pressable
                key={address.id}
                onPress={() => select(address.id)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.place, { flexDirection: row }, pressed && { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name={LABEL_ICON[address.label]} size={20} color={colors.textMuted} />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {addressTitle(address, t)}
                  </AppText>
                  <AppText variant="caption" color="textMuted" numberOfLines={1}>
                    {addressSummary(address)}
                  </AppText>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
      </CollapsibleSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg },
  greeting: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.xs,
    paddingRight: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  greetingText: { flexShrink: 1 },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  addressRow: { alignItems: 'center', gap: spacing.md, minHeight: 48 },
  search: { alignItems: 'center', gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.lg, borderRadius: radius.md },
  grid: { gap: spacing.sm },
  gridRow: { gap: spacing.sm },
  place: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2, borderRadius: radius.sm },
});
