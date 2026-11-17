import { router } from 'expo-router';
import { Text } from 'react-native';

import { useI18n } from '../i18n';
import { useColors } from '../theme';
import { AppText } from '../ui';

/** "By continuing you agree to our Terms of Service and Privacy Policy." with tappable links. */
export function TermsNotice() {
  const { t } = useI18n();
  const colors = useColors();
  const template = t('welcome.termsWithLinks');
  const parts = template.split(/(\{terms\}|\{privacy\})/);

  return (
    <AppText variant="small" color="textSubtle" align="center">
      {parts.map((part, i) => {
        if (part === '{terms}' || part === '{privacy}') {
          const doc = part === '{terms}' ? 'terms' : 'privacy';
          return (
            <Text
              key={i}
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc } })}
              style={{ color: colors.primary, textDecorationLine: 'underline' }}>
              {t(doc === 'terms' ? 'legal.terms' : 'legal.privacy')}
            </Text>
          );
        }
        return part;
      })}
    </AppText>
  );
}
