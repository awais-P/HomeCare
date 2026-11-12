import { Text, type TextProps, type TextStyle } from 'react-native';

import { useI18n } from '@/i18n/i18n-provider';
import { typography, URDU_LINE_HEIGHT_FACTOR, useColors, type ColorToken, type TypographyVariant } from '@/theme';

export type AppTextProps = TextProps & {
  variant?: TypographyVariant;
  color?: ColorToken;
  align?: TextStyle['textAlign'];
};

/**
 * The only text component screens should use. Applies the type scale, theme colors and,
 * for Urdu, right-to-left alignment with taller lines.
 */
export function AppText({ variant = 'body', color = 'text', align, style, ...rest }: AppTextProps) {
  const colors = useColors();
  const { isRTL } = useI18n();
  const type = typography[variant];

  return (
    <Text
      style={[
        type,
        {
          color: colors[color],
          textAlign: align ?? (isRTL ? 'right' : 'left'),
          writingDirection: isRTL ? 'rtl' : 'ltr',
        },
        isRTL && { lineHeight: Math.round(type.lineHeight * URDU_LINE_HEIGHT_FACTOR) },
        style,
      ]}
      {...rest}
    />
  );
}
