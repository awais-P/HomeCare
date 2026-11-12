import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { spacing, useColors } from '@/theme';

export type ScreenProps = {
  children: ReactNode;
  /** Pinned to the bottom, above the keyboard (e.g. the main action button). */
  footer?: ReactNode;
  /** Pinned to the top, outside the scroll area (e.g. a back button). */
  header?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
};

/**
 * Standard screen container: safe areas, theme background, keyboard avoidance and an optional
 * sticky footer. Every screen starts with this.
 */
export function Screen({
  children,
  footer,
  header,
  scroll = true,
  padded = true,
  edges = ['top', 'bottom'],
  contentStyle,
}: ScreenProps) {
  const colors = useColors();
  const padding = padded ? styles.padded : undefined;

  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        {header ? <View style={[styles.header, padded && styles.headerPadded]}>{header}</View> : null}
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.scrollContent, padding, contentStyle]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, padding, contentStyle]}>{children}</View>
        )}
        {footer ? <View style={[styles.footer, padded && styles.footerPadded]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  scrollContent: { flexGrow: 1, paddingBottom: spacing.xl },
  header: { paddingTop: spacing.sm },
  headerPadded: { paddingHorizontal: spacing.lg },
  footer: { paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  footerPadded: { paddingHorizontal: spacing.xl },
});
