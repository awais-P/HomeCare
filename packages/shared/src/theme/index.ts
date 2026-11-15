import { useColorScheme } from 'react-native';

import { colors, type ColorScheme, type Colors } from './tokens';

export * from './tokens';

export function useColorSchemeName(): ColorScheme {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

/** Current color palette, following the phone's light/dark setting. */
export function useColors(): Colors {
  return colors[useColorSchemeName()];
}
