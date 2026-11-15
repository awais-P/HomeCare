import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppText, BackHeader, Badge, Button, EmptyState, IconButton, IconCircle, InlineMessage, Screen } from '@homecare/shared/ui';
import { useAddresses } from '@/features/addresses/addresses-provider';
import { addressErrorKey, addressSummary, addressTitle, LABEL_ICON } from '@/features/addresses/labels';
import { setLocationDraft } from '@/features/addresses/location-draft';
import { useI18n, useRowDirection } from '@homecare/shared/i18n';
import type { Address } from '@homecare/shared/lib';
import { radius, spacing, useColors } from '@homecare/shared/theme';

/**
 * Saved addresses. mode=select (from Home): tapping an address makes it the delivery address.
 * Otherwise (from Account): tapping opens it for editing.
 */
export default function AddressesScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const selecting = mode === 'select';
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  const { addresses, status, selected, select, reload, remove, makeDefault } = useAddresses();

  const addNew = () => {
    setLocationDraft(null);
    router.push('/address/pick');
  };

  const openMenu = (address: Address) => {
    const fail = (error: unknown) => Alert.alert(t('errors.generic'), t(addressErrorKey(error)));
    Alert.alert(addressTitle(address, t), addressSummary(address), [
      address.is_default
        ? { text: t('address.list.edit'), onPress: () => router.push({ pathname: '/address/details', params: { id: address.id } }) }
        : { text: t('address.list.makeDefault'), onPress: () => void makeDefault(address.id).catch(fail) },
      {
        text: t('address.list.delete'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(t('address.list.deleteConfirmTitle'), t('address.list.deleteConfirmBody'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('address.list.delete'), style: 'destructive', onPress: () => void remove(address.id).catch(fail) },
          ]),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const onPressAddress = (address: Address) => {
    if (selecting) {
      select(address.id);
      router.back();
    } else {
      router.push({ pathname: '/address/details', params: { id: address.id } });
    }
  };

  return (
    <Screen
      header={<BackHeader title={t(selecting ? 'address.list.selectTitle' : 'account.addresses')} />}
      footer={<Button label={t('address.list.add')} icon="add" variant={addresses.length ? 'secondary' : 'primary'} onPress={addNew} />}
      scroll={status === 'ready' && addresses.length > 0}>
      {status === 'loading' ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : status === 'error' ? (
        <View style={styles.list}>
          <InlineMessage tone="error" message={t('address.list.loadError')} />
          <Button label={t('common.retry')} variant="outline" onPress={reload} />
        </View>
      ) : addresses.length === 0 ? (
        <EmptyState icon="location-outline" title={t('address.list.emptyTitle')} body={t('address.list.emptyBody')} />
      ) : (
        <View style={styles.list}>
          {addresses.map((address) => {
            const isSelected = selecting && selected?.id === address.id;
            return (
              <Pressable
                key={address.id}
                onPress={() => onPressAddress(address)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                style={({ pressed }) => [
                  styles.item,
                  {
                    flexDirection: row,
                    backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}>
                <IconCircle icon={LABEL_ICON[address.label]} size={44} />
                <View style={styles.flex}>
                  <View style={[styles.titleRow, { flexDirection: row }]}>
                    <AppText variant="bodyStrong" numberOfLines={1} style={styles.shrink}>
                      {addressTitle(address, t)}
                    </AppText>
                    {address.is_default ? <Badge label={t('address.list.default')} /> : null}
                  </View>
                  <AppText variant="caption" color="textMuted" numberOfLines={2}>
                    {addressSummary(address)}
                  </AppText>
                  {address.recipient_name ? (
                    <AppText variant="small" color="primary">
                      {t('address.list.forName', { name: address.recipient_name })}
                    </AppText>
                  ) : null}
                </View>
                {isSelected ? (
                  <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                ) : (
                  <IconButton icon="ellipsis-vertical" color="textMuted" accessibilityLabel={addressTitle(address, t)} onPress={() => openMenu(address)} />
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  loading: { marginTop: spacing.xxl },
  list: { gap: spacing.md },
  item: { alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg },
  titleRow: { alignItems: 'center', gap: spacing.sm },
});
