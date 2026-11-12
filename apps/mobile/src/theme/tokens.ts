/**
 * Design tokens for HomeCare. Every screen and widget reads colors, spacing, radii and type
 * from here, so the look can be tuned in one place.
 */

const palette = {
  light: {
    primary: '#0B7A55',
    primaryPressed: '#09603F',
    onPrimary: '#FFFFFF',
    primarySoft: '#E3F4EC',

    sauda: '#D97706',
    saudaSoft: '#FEF3C7',
    ustaad: '#2563EB',
    ustaadSoft: '#DBEAFE',

    background: '#F6F8F7',
    surface: '#FFFFFF',
    surfaceAlt: '#EEF2F0',
    border: '#E1E6E3',
    borderStrong: '#C6CEC9',

    text: '#0F1A15',
    textMuted: '#56625C',
    textSubtle: '#86918B',

    danger: '#D92D20',
    dangerSoft: '#FEE4E2',
    success: '#079455',
    successSoft: '#DCFAE6',
    overlay: 'rgba(15, 26, 21, 0.4)',
  },
  dark: {
    primary: '#34C38F',
    primaryPressed: '#2AA577',
    onPrimary: '#04261A',
    primarySoft: '#0F2E23',

    sauda: '#FBBF24',
    saudaSoft: '#3A2A07',
    ustaad: '#60A5FA',
    ustaadSoft: '#10233F',

    background: '#0A0F0D',
    surface: '#131A17',
    surfaceAlt: '#1A2420',
    border: '#24302B',
    borderStrong: '#36433D',

    text: '#ECF2EF',
    textMuted: '#A3AFA9',
    textSubtle: '#76827C',

    danger: '#F97066',
    dangerSoft: '#3B1512',
    success: '#32D583',
    successSoft: '#0E2A1B',
    overlay: 'rgba(0, 0, 0, 0.6)',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type ColorToken = keyof (typeof palette)['light'];
export type Colors = Record<ColorToken, string>;

export const colors: Record<ColorScheme, Colors> = palette;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 30, lineHeight: 38, fontWeight: '700' },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  small: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Urdu script needs more vertical room than Latin text at the same font size. */
export const URDU_LINE_HEIGHT_FACTOR = 1.45;

/** Comfortable touch target (Android guideline: 48dp). */
export const MIN_TOUCH = 48;
