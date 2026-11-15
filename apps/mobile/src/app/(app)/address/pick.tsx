import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, IconButton, InlineMessage } from '@/components/ui';
import { useAddresses } from '@/features/addresses/addresses-provider';
import * as addressApi from '@/features/addresses/api';
import { setLocationDraft } from '@/features/addresses/location-draft';
import { getDeviceLocation } from '@/features/location/device-location';
import { placeToAddressLine, reverseGeocode, searchPlaces, type Place } from '@/features/location/geocoding';
import { AppMap } from '@/features/map/app-map';
import { MapPin, PIN_HEIGHT } from '@/features/map/map-pin';
import { DEFAULT_CENTER, type AppMapHandle, type LatLng } from '@/features/map/types';
import { useI18n, useRowDirection } from '@/i18n/i18n-provider';
import type { TranslationKey } from '@/i18n/strings';
import { radius, spacing, typography, useColors } from '@/theme';

type Lookup =
  | { status: 'loading' }
  | { status: 'ready'; place: Place; zone: addressApi.ServiceAreaCheck }
  | { status: 'error'; place: Place | null };

/**
 * Map picker: the user drags the map so the fixed centre pin sits on their door (or searches).
 * We show the address under the pin and whether we serve it.
 * Params: mode = 'add' (default, continues to the form) | 'edit' (returns to the form).
 */
export default function PickLocationScreen() {
  const { mode, lat, lng } = useLocalSearchParams<{ mode?: string; lat?: string; lng?: string }>();
  const { t, language } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  const insets = useSafeAreaInsets();
  const { zones, selected } = useAddresses();
  const mapRef = useRef<AppMapHandle>(null);

  const [start] = useState<LatLng>(() => {
    if (lat && lng) return { latitude: Number(lat), longitude: Number(lng) };
    if (selected) return { latitude: selected.latitude, longitude: selected.longitude };
    return DEFAULT_CENTER;
  });
  const hasStartPoint = Boolean((lat && lng) || selected);

  const [center, setCenter] = useState<LatLng>(start);
  const [moving, setMoving] = useState(false);
  const [lookup, setLookup] = useState<Lookup>({ status: 'loading' });
  const [cardHeight, setCardHeight] = useState(0);
  const [showUserLocation, setShowUserLocation] = useState(false);
  const [notice, setNotice] = useState<TranslationKey | null>(null);
  const [waitlist, setWaitlist] = useState<'idle' | 'saving' | 'joined'>('idle');

  // Search
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const goToMyLocation = async () => {
    const result = await getDeviceLocation();
    if (result.status === 'ok') {
      setShowUserLocation(true);
      setNotice(null);
      mapRef.current?.flyTo(result.coordinate, 17);
    } else {
      setNotice('address.pick.locationDenied');
    }
  };

  // New address with no starting point: start where the phone is.
  useEffect(() => {
    if (hasStartPoint) return;
    let active = true;
    getDeviceLocation().then((result) => {
      if (!active || result.status !== 'ok') return;
      setShowUserLocation(true);
      mapRef.current?.flyTo(result.coordinate, 17);
    });
    return () => {
      active = false;
    };
  }, [hasStartPoint]);

  // What's under the pin, and do we serve it? (debounced; stale answers ignored)
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLookup({ status: 'loading' });
      setWaitlist('idle');
      const [placeResult, zoneResult] = await Promise.allSettled([
        reverseGeocode(center, language, controller.signal),
        addressApi.checkServiceArea(center),
      ]);
      if (controller.signal.aborted) return;
      const place =
        placeResult.status === 'fulfilled' && placeResult.value
          ? placeResult.value
          : { id: 'pin', title: t('address.pick.title'), subtitle: '', coordinate: center };
      setLookup(
        zoneResult.status === 'fulfilled'
          ? { status: 'ready', zone: zoneResult.value, place }
          : { status: 'error', place: placeResult.status === 'fulfilled' ? placeResult.value : null },
      );
    }, 400);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [center, t, language]);

  // Search runs when the user presses Search (the free geocoder doesn't allow search-as-you-type).
  const searchRequest = useRef<AbortController | null>(null);
  const runSearch = async () => {
    if (query.trim().length < 2) return;
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setSearchState('loading');
    try {
      const found = await searchPlaces(query, language, controller.signal);
      if (controller.signal.aborted) return;
      setResults(found);
      setSearchState('done');
    } catch {
      if (!controller.signal.aborted) setSearchState('error');
    }
  };

  const pickResult = (place: Place) => {
    setSearchOpen(false);
    setQuery('');
    setResults([]);
    setSearchState('idle');
    mapRef.current?.flyTo(place.coordinate, 17);
  };

  const confirm = () => {
    if (lookup.status !== 'ready' || !lookup.zone.inside) return;
    setLocationDraft({ ...lookup.place, coordinate: center, zoneName: lookup.zone.zoneName });
    if (mode === 'edit') router.back();
    else router.push('/address/details');
  };

  const joinWaitlist = async () => {
    if (lookup.status !== 'ready') return;
    setWaitlist('saving');
    try {
      await addressApi.joinWaitlist(center, placeToAddressLine(lookup.place));
      setWaitlist('joined');
    } catch {
      setWaitlist('idle');
      setNotice('errors.generic');
    }
  };

  const busy = moving || lookup.status === 'loading';

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <AppMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialCenter={start}
        initialZoom={17}
        zones={zones}
        showUserLocation={showUserLocation}
        bottomInset={cardHeight}
        onMoveStart={() => setMoving(true)}
        onMoveEnd={(c) => {
          setMoving(false);
          setCenter(c);
        }}
      />

      {/* Fixed centre pin: its tip marks the chosen point */}
      <View pointerEvents="none" style={[styles.pinLayer, { bottom: cardHeight }]}>
        <View style={{ transform: [{ translateY: -PIN_HEIGHT / 2 }] }}>
          <MapPin lifted={moving} icon="location" />
        </View>
      </View>

      {/* Top bar: back + search */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm, flexDirection: row }]}>
        <View style={[styles.roundButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <IconButton icon="arrow-back" accessibilityLabel={t('common.back')} onPress={() => router.back()} />
        </View>
        <Pressable
          onPress={() => setSearchOpen(true)}
          accessibilityRole="search"
          style={[styles.searchPill, { flexDirection: row, backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <AppText color="textSubtle" numberOfLines={1} style={styles.flex}>
            {t('address.pick.searchPlaceholder')}
          </AppText>
        </Pressable>
      </View>

      {/* Use my location */}
      <Pressable
        onPress={() => void goToMyLocation()}
        accessibilityRole="button"
        accessibilityLabel={t('address.pick.useMyLocation')}
        style={[styles.fab, { bottom: cardHeight + spacing.lg, backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="navigate" size={22} color={colors.text} />
      </Pressable>

      {/* Bottom card: what's under the pin */}
      <View
        onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        style={[styles.card, { paddingBottom: insets.bottom + spacing.lg, backgroundColor: colors.surface, borderColor: colors.border }]}>
        <AppText variant="caption" color="textMuted">
          {t('address.pick.hint')}
        </AppText>
        <View style={[styles.placeRow, { flexDirection: row }]}>
          <Ionicons name="location" size={22} color={colors.primary} />
          <View style={styles.flex}>
            {busy ? (
              <AppText variant="bodyStrong" color="textMuted">
                {t('address.pick.locating')}
              </AppText>
            ) : lookup.status === 'ready' ? (
              <>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {lookup.place.title}
                </AppText>
                {lookup.place.subtitle ? (
                  <AppText variant="caption" color="textMuted" numberOfLines={2}>
                    {lookup.place.subtitle}
                  </AppText>
                ) : null}
              </>
            ) : (
              <>
                {lookup.place ? (
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {lookup.place.title}
                  </AppText>
                ) : null}
                <AppText variant="caption" color="danger">
                  {t('address.pick.checkError')}
                </AppText>
              </>
            )}
          </View>
        </View>

        {!busy && lookup.status === 'ready' && lookup.zone.inside ? (
          <View style={[styles.zone, { flexDirection: row, backgroundColor: colors.successSoft }]}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <AppText variant="label" color="success">
              {t('address.pick.inside', { zone: lookup.zone.zoneName })}
            </AppText>
          </View>
        ) : null}

        {!busy && lookup.status === 'ready' && !lookup.zone.inside ? (
          waitlist === 'joined' ? (
            <InlineMessage tone="success" message={t('address.pick.joined')} />
          ) : (
            <View style={[styles.outside, { backgroundColor: colors.saudaSoft }]}>
              <AppText variant="bodyStrong">{t('address.pick.outsideTitle')}</AppText>
              <AppText variant="caption" color="textMuted">
                {t('address.pick.outsideBody')}
              </AppText>
            </View>
          )
        ) : null}

        {notice ? <InlineMessage tone="error" message={t(notice)} /> : null}

        {!busy && lookup.status === 'ready' && !lookup.zone.inside ? (
          waitlist === 'joined' ? null : (
            <Button
              label={t('address.pick.joinWaitlist')}
              icon="notifications-outline"
              variant="secondary"
              loading={waitlist === 'saving'}
              onPress={() => void joinWaitlist()}
            />
          )
        ) : (
          <Button
            label={t('address.pick.confirm')}
            onPress={confirm}
            disabled={busy || lookup.status !== 'ready'}
          />
        )}
      </View>

      {/* Search overlay */}
      {searchOpen ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, paddingTop: insets.top + spacing.sm }]}>
          <View style={[styles.searchHeader, { flexDirection: row }]}>
            <IconButton
              icon="arrow-back"
              accessibilityLabel={t('common.back')}
              onPress={() => {
                setSearchOpen(false);
                setQuery('');
                setResults([]);
                setSearchState('idle');
              }}
            />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder={t('address.pick.searchPlaceholder')}
              placeholderTextColor={colors.textSubtle}
              selectionColor={colors.primary}
              returnKeyType="search"
              onSubmitEditing={() => void runSearch()}
              style={[
                styles.searchInput,
                typography.body,
                { color: colors.text, backgroundColor: colors.surfaceAlt },
              ]}
            />
            <IconButton icon="search" color="primary" accessibilityLabel={t('address.pick.searchPlaceholder')} onPress={() => void runSearch()} />
          </View>
          {searchState === 'idle' ? (
            <View style={styles.searchMessage}>
              <AppText variant="caption" color="textMuted">
                {t('address.pick.searchHint')}
              </AppText>
            </View>
          ) : null}
          {searchState === 'loading' ? <ActivityIndicator style={styles.searchSpinner} color={colors.primary} /> : null}
          {searchState === 'error' ? (
            <View style={styles.searchMessage}>
              <InlineMessage tone="error" message={t('address.pick.searchError')} />
            </View>
          ) : null}
          {searchState === 'done' && results.length === 0 ? (
            <View style={styles.searchMessage}>
              <InlineMessage tone="info" message={t('address.pick.noResults')} />
            </View>
          ) : null}
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => pickResult(item)}
                style={({ pressed }) => [styles.result, { flexDirection: row }, pressed && { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="location-outline" size={20} color={colors.textMuted} />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {item.title}
                  </AppText>
                  {item.subtitle ? (
                    <AppText variant="caption" color="textMuted" numberOfLines={1}>
                      {item.subtitle}
                    </AppText>
                  ) : null}
                </View>
              </Pressable>
            )}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pinLayer: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: 'center' },
  roundButton: { borderRadius: 24, borderWidth: 1 },
  searchPill: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.md,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 12,
  },
  placeRow: { alignItems: 'flex-start', gap: spacing.md },
  zone: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md },
  outside: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md },
  searchHeader: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  searchInput: { flex: 1, minHeight: 48, borderRadius: radius.md, paddingHorizontal: spacing.lg },
  searchSpinner: { marginTop: spacing.xl },
  searchMessage: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  result: { alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
});
