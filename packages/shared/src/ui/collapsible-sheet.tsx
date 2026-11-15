import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { radius, spacing, useColors } from '../theme';

export type CollapsibleSheetProps = {
  /** Always visible, under the drag handle (e.g. the address row). */
  header: ReactNode;
  /** Shown only when expanded. */
  children: ReactNode;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Reports how much of the screen the sheet covers, so the map can keep its centre visible. */
  onVisibleHeightChange?: (height: number) => void;
};

/**
 * Bottom sheet pinned over a map: expanded shows everything, collapsed leaves only the handle
 * and header peeking. Tap the handle (or drag) to switch; screens collapse it when the map is
 * touched.
 */
export function CollapsibleSheet({ header, children, expanded, onExpandedChange, onVisibleHeightChange }: CollapsibleSheetProps) {
  const colors = useColors();
  const [fullHeight, setFullHeight] = useState(0);
  const [peekHeight, setPeekHeight] = useState(0);
  // Created once; kept in state (not a ref) so render can read it.
  const [translateY] = useState(() => new Animated.Value(0));

  const collapsedOffset = Math.max(0, fullHeight - peekHeight);
  const target = expanded ? 0 : collapsedOffset;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: target,
      useNativeDriver: true,
      damping: 22,
      stiffness: 220,
      mass: 0.9,
    }).start();
  }, [target, translateY]);

  useEffect(() => {
    if (fullHeight && peekHeight) onVisibleHeightChange?.(expanded ? fullHeight : peekHeight);
  }, [expanded, fullHeight, peekHeight, onVisibleHeightChange]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => {
          const next = Math.min(collapsedOffset, Math.max(0, target + g.dy));
          translateY.setValue(next);
        },
        onPanResponderRelease: (_e, g) => {
          const position = target + g.dy;
          const shouldExpand = g.vy < -0.4 || (g.vy <= 0.4 && position < collapsedOffset / 2);
          if (shouldExpand === expanded) {
            // Snap back to where it was.
            Animated.spring(translateY, { toValue: target, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
          }
          onExpandedChange(shouldExpand);
        },
      }),
    [collapsedOffset, target, expanded, onExpandedChange, translateY],
  );

  return (
    <Animated.View
      onLayout={(e: LayoutChangeEvent) => setFullHeight(e.nativeEvent.layout.height)}
      style={[
        styles.sheet,
        { backgroundColor: colors.surface, borderColor: colors.border, transform: [{ translateY }] },
      ]}>
      <View {...panResponder.panHandlers} onLayout={(e) => setPeekHeight(e.nativeEvent.layout.height)}>
        <Pressable
          onPress={() => onExpandedChange(!expanded)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          hitSlop={8}
          style={styles.handleArea}>
          <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
        </Pressable>
        <View style={styles.header}>{header}</View>
      </View>
      <View style={styles.body}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  handleArea: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.sm },
  handle: { width: 40, height: 5, borderRadius: 3 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
});
