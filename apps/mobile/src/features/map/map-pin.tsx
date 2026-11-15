import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { useColors } from '@/theme';

/** The HomeCare map pin: a round head with a short stem. The stem's tip is the exact point. */
export function MapPin({ lifted = false, icon = 'home' }: { lifted?: boolean; icon?: 'home' | 'location' }) {
  const colors = useColors();
  return (
    <View style={[styles.wrap, lifted && styles.lifted]} pointerEvents="none">
      <View style={[styles.head, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
        <Ionicons name={icon} size={20} color={colors.onPrimary} />
      </View>
      <View style={[styles.stem, { backgroundColor: colors.primary }]} />
      <View style={[styles.shadow, lifted && styles.shadowLifted]} />
    </View>
  );
}

export const PIN_HEIGHT = 58;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', height: PIN_HEIGHT, width: 44 },
  lifted: { transform: [{ translateY: -8 }] },
  head: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  stem: { width: 3, height: 14, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  shadow: { width: 10, height: 4, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.25)' },
  shadowLifted: { width: 14, opacity: 0.6, transform: [{ translateY: 8 }] },
});
