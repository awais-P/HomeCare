import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '../../i18n';
import { LEGAL_DOCS, LEGAL_UPDATED, type LegalDocId } from '../../legal';
import { spacing, useColors } from '../../theme';
import { AppText, BackHeader, InlineMessage, Screen } from '../../ui';

/** Shows Terms of Service, Privacy Policy or the account-deletion page. Route param: doc. */
export function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const { t } = useI18n();
  const colors = useColors();
  const legal = LEGAL_DOCS[(doc ?? 'terms') as LegalDocId] ?? LEGAL_DOCS.terms;

  return (
    <Screen header={<BackHeader title={legal.title} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />}>
      <View style={styles.content}>
        <AppText variant="caption" color="textMuted">
          {t('legal.updated', { date: LEGAL_UPDATED })}
        </AppText>
        <InlineMessage tone="info" message={`${t('legal.draft')} ${t('legal.englishOnly')}`} />
        {/* Legal text is English, so it is laid out left-to-right even when the app is in Urdu. */}
        <Text style={[styles.body, { color: colors.text }]}>{legal.intro}</Text>
        {legal.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={[styles.heading, { color: colors.text }]}>{section.heading}</Text>
            {section.paragraphs?.map((p) => (
              <Text key={p} style={[styles.body, { color: colors.text }]}>
                {p}
              </Text>
            ))}
            {section.bullets?.map((b) => (
              <View key={b} style={styles.bulletRow}>
                <Text style={[styles.body, { color: colors.textMuted }]}>•</Text>
                <Text style={[styles.body, styles.flex, { color: colors.text }]}>{b}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: spacing.lg },
  section: { gap: spacing.sm },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '700', textAlign: 'left' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'left' },
  bulletRow: { flexDirection: 'row', gap: spacing.sm, paddingLeft: spacing.xs },
});
