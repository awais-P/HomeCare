import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';

import { formatDuration, readRecordingBase64, useVoiceRecorder } from '@homecare/shared/audio';
import { errorMessageKey, useAuth } from '@homecare/shared/auth';
import { useI18n, useRowDirection, type TranslationKey } from '@homecare/shared/i18n';
import { formatSlot, JOB_STATUS_KEY, TRADE_ICON, TRADE_KEY } from '@homecare/shared/jobs';
import type { JobStatus, OrderStatus, SaudaCategory, UstaadTrade } from '@homecare/shared/lib';
import { CATEGORY_ICON, CATEGORY_KEY, STATUS_KEY } from '@homecare/shared/orders';
import { radius, spacing, useColors } from '@homecare/shared/theme';
import { AppText, BackHeader, Badge, Button, Card, IconCircle, InlineMessage, Screen, TextField } from '@homecare/shared/ui';

import {
  askAssistant,
  AssistantError,
  speak,
  stopSpeaking,
  type AssistantResult,
  type ChatTurn,
  type SaudaDraft,
  type UstaadDraft,
} from '@/features/assistant/api';
import { createJob } from '@/features/jobs/api';
import { createOrder, orderErrorKey } from '@/features/orders/api';

/** One spoken request is kept under a minute. */
const MAX_TALK_MS = 55_000;

type Turn = { id: number; role: 'user' | 'assistant'; text: string; result?: AssistantResult };

/**
 * The voice assistant: the customer names it once, then taps the mic and says what they need.
 * It answers out loud and shows a draft order or booking; nothing is placed until they confirm.
 */
export default function AssistantScreen() {
  const params = useLocalSearchParams<{ rename?: string }>();
  const { profile } = useAuth();
  const name = profile?.assistant_name;
  if (!name || params.rename) return <NameStep current={name ?? null} />;
  return <Conversation name={name} />;
}

function NameStep({ current }: { current: string | null }) {
  const { t } = useI18n();
  const { updateProfile } = useAuth();
  const [value, setValue] = useState(current ?? 'Jack');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);

  const save = async () => {
    const trimmed = value.trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      setError('assistant.nameInvalid');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateProfile({ assistant_name: trimmed });
      router.setParams({ rename: undefined });
    } catch (e) {
      setError(errorMessageKey(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      header={<BackHeader title={t('assistant.nameTitle')} />}
      footer={<Button label={t('assistant.nameSave')} icon="checkmark" loading={saving} onPress={() => void save()} />}>
      <View style={styles.nameContent}>
        <IconCircle icon="sparkles" size={72} />
        <AppText variant="body" color="textMuted" align="center">
          {t('assistant.nameBody')}
        </AppText>
        <TextField label={t('assistant.nameLabel')} value={value} onChangeText={setValue} maxLength={20} autoFocus />
        {error ? <InlineMessage tone="error" message={t(error)} /> : null}
      </View>
    </Screen>
  );
}

function Conversation({ name }: { name: string }) {
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  const { profile } = useAuth();
  const voice = useVoiceRecorder();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const nextId = useRef(1);
  const scrollRef = useRef<ScrollViewInstance>(null);

  // Stop speaking when leaving the screen.
  useEffect(
    () => () => {
      void stopSpeaking();
    },
    [],
  );

  const history = (): ChatTurn[] => turns.map((turn) => ({ role: turn.role, content: turn.text }));

  const send = async (input: { audio?: { base64: string; mime: string }; text?: string }) => {
    setThinking(true);
    setError(null);
    stopSpeaking();
    try {
      const { transcript, result } = await askAssistant({ ...input, history: history() });
      if (!transcript) {
        setError('assistant.errors.empty');
        return;
      }
      const userTurn: Turn = { id: nextId.current++, role: 'user', text: transcript };
      const reply: Turn = { id: nextId.current++, role: 'assistant', text: result.reply, result };
      setTurns((prev) => [...prev, userTurn, reply]);
      speak(result.reply);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e) {
      setError(e instanceof AssistantError ? e.key : 'assistant.errors.failed');
    } finally {
      setThinking(false);
    }
  };

  const finishTalking = async () => {
    const uri = await voice.stop();
    if (!uri || voice.durationMs < 600) {
      setError('assistant.errors.empty');
      return;
    }
    await send({ audio: await readRecordingBase64(uri) });
  };

  const tooLong = voice.recording && voice.durationMs >= MAX_TALK_MS;
  useEffect(() => {
    if (!tooLong) return;
    const timer = setTimeout(() => void finishTalking(), 0);
    return () => clearTimeout(timer);
    // finishTalking only reads the recorder; re-running on its identity would stop twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tooLong]);

  const onMic = () => {
    if (thinking || placing) return;
    if (voice.recording) void finishTalking();
    else {
      stopSpeaking();
      setError(null);
      void voice.start();
    }
  };

  const sendText = () => {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    setText('');
    void send({ text: trimmed });
  };

  const change = () => {
    const reply = t('assistant.changeReply');
    setTurns((prev) => [...prev, { id: nextId.current++, role: 'assistant', text: reply }]);
    speak(reply);
  };

  const placeOrder = async (draft: SaudaDraft) => {
    setPlacing(true);
    setError(null);
    try {
      const order = await createOrder({
        addressId: draft.address_id,
        category: draft.category as SaudaCategory,
        itemsText: draft.items_text,
        shopPreference: draft.shop_preference ?? undefined,
        instructions: draft.instructions ?? undefined,
      });
      router.replace({ pathname: '/order/[id]', params: { id: order.id } });
    } catch (e) {
      setError(orderErrorKey(e) ?? errorMessageKey(e));
    } finally {
      setPlacing(false);
    }
  };

  const bookUstaad = async (draft: UstaadDraft) => {
    setPlacing(true);
    setError(null);
    try {
      const job = await createJob({
        addressId: draft.address_id,
        trade: draft.trade as UstaadTrade,
        problemText: draft.problem_text,
        timing: draft.timing,
        scheduledFor: draft.scheduled_for ?? undefined,
        preferredUstaad: draft.preferred_ustaad_id ?? undefined,
      });
      router.replace({ pathname: '/job/[id]', params: { id: job.id } });
    } catch (e) {
      setError(errorMessageKey(e));
    } finally {
      setPlacing(false);
    }
  };

  const lastId = turns.at(-1)?.id;
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? '';

  return (
    <Screen header={<BackHeader title={name} />} scroll={false} padded={false}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        <Card style={styles.block}>
          <AppText variant="bodyStrong">{t('assistant.hello', { user: firstName, name })}</AppText>
          <AppText variant="caption" color="textMuted">
            {t('assistant.examples')}
          </AppText>
        </Card>

        {turns.map((turn) => (
          <View key={turn.id} style={[styles.turn, { alignSelf: turn.role === 'user' ? (row === 'row' ? 'flex-end' : 'flex-start') : undefined }]}>
            <View
              style={[
                styles.bubble,
                turn.role === 'user' ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt },
              ]}>
              <AppText color={turn.role === 'user' ? 'onPrimary' : 'text'}>{turn.text}</AppText>
            </View>
            {turn.result && turn.id === lastId ? (
              <ResultCard
                result={turn.result}
                busy={placing}
                onConfirmOrder={(d) => void placeOrder(d)}
                onConfirmJob={(d) => void bookUstaad(d)}
                onChange={change}
              />
            ) : null}
          </View>
        ))}

        {thinking ? (
          <View style={[styles.thinking, { flexDirection: row }]}>
            <ActivityIndicator color={colors.primary} />
            <AppText variant="caption" color="textMuted">
              {t('assistant.thinking')}
            </AppText>
          </View>
        ) : null}
        {error ? <InlineMessage tone="error" message={t(error)} /> : null}
        {voice.denied ? <InlineMessage tone="error" message={t('voice.denied')} /> : null}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable
          onPress={onMic}
          disabled={thinking || placing}
          accessibilityRole="button"
          accessibilityLabel={voice.recording ? t('assistant.listening') : t('assistant.tapToTalk')}
          style={[styles.mic, { backgroundColor: voice.recording ? colors.danger : colors.primary, opacity: thinking ? 0.5 : 1 }]}>
          <Ionicons name={voice.recording ? 'stop' : 'mic'} size={34} color={colors.onPrimary} />
        </Pressable>
        <AppText variant="caption" color="textMuted" align="center">
          {voice.recording ? `${t('assistant.listening')} ${formatDuration(voice.durationMs)}` : t('assistant.tapToTalk')}
        </AppText>
        <View style={[styles.typeRow, { flexDirection: row, borderColor: colors.border, backgroundColor: colors.surface }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={sendText}
            placeholder={t('assistant.typeInstead')}
            placeholderTextColor={colors.textSubtle}
            returnKeyType="send"
            style={[styles.input, { color: colors.text }]}
            accessibilityLabel={t('assistant.typeInstead')}
          />
          <Pressable onPress={sendText} disabled={!text.trim() || thinking} accessibilityRole="button" accessibilityLabel={t('assistant.send')}>
            <Ionicons name="send" size={20} color={text.trim() ? colors.primary : colors.textSubtle} />
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

function ResultCard({
  result,
  busy,
  onConfirmOrder,
  onConfirmJob,
  onChange,
}: {
  result: AssistantResult;
  busy: boolean;
  onConfirmOrder: (draft: SaudaDraft) => void;
  onConfirmJob: (draft: UstaadDraft) => void;
  onChange: () => void;
}) {
  const { t } = useI18n();
  const row = useRowDirection();
  const label = (l: string) => (['home', 'work', 'parents', 'other'].includes(l) ? t(`address.label.${l}` as TranslationKey) : l);

  if (result.action === 'sauda_order') {
    const d = result.draft;
    const category = d.category as SaudaCategory;
    return (
      <Card style={styles.block}>
        <View style={[styles.rowCenter, { flexDirection: row }]}>
          <IconCircle icon={CATEGORY_ICON[category] ?? 'basket'} tint="saudaSoft" color="sauda" size={40} />
          <View style={styles.flex}>
            <AppText variant="label" color="sauda">
              {t('services.sauda.title')} · {t(CATEGORY_KEY[category] ?? 'order.cat.other')}
            </AppText>
            <AppText variant="bodyStrong">{d.items_text}</AppText>
          </View>
        </View>
        {d.shop_preference ? <AppText variant="caption">{t('assistant.shop', { shop: d.shop_preference })}</AppText> : null}
        <AppText variant="caption">{t('assistant.to', { label: label(d.address_label) })}</AppText>
        {d.instructions ? (
          <AppText variant="caption" color="textMuted">
            {d.instructions}
          </AppText>
        ) : null}
        <AppText variant="small" color="textMuted">
          {t('assistant.feeNote')}
        </AppText>
        <Button label={t('assistant.confirmOrder')} icon="bag-check-outline" loading={busy} onPress={() => onConfirmOrder(d)} />
        <Button label={t('assistant.change')} variant="ghost" size="md" disabled={busy} onPress={onChange} />
      </Card>
    );
  }

  if (result.action === 'ustaad_job') {
    const d = result.draft;
    const trade = d.trade as UstaadTrade;
    return (
      <Card style={styles.block}>
        <View style={[styles.rowCenter, { flexDirection: row }]}>
          <IconCircle icon={TRADE_ICON[trade] ?? 'construct'} tint="ustaadSoft" color="ustaad" size={40} />
          <View style={styles.flex}>
            <AppText variant="label" color="ustaad">
              {t('services.ustaad.title')} · {t(TRADE_KEY[trade] ?? 'services.ustaad.title')}
            </AppText>
            <AppText variant="bodyStrong">{d.problem_text}</AppText>
          </View>
        </View>
        <AppText variant="caption">
          {t('assistant.when', { time: d.timing === 'scheduled' && d.scheduled_for ? formatSlot(d.scheduled_for) : t('ujob.timing.now') })}
        </AppText>
        <AppText variant="caption">{t('assistant.to', { label: label(d.address_label) })}</AppText>
        {d.preferred_ustaad_name ? <AppText variant="caption">{t('assistant.askFirst', { name: d.preferred_ustaad_name })}</AppText> : null}
        <AppText variant="small" color="textMuted">
          {t('assistant.visitNote')}
        </AppText>
        <Button label={t('assistant.confirmBooking')} icon="construct-outline" loading={busy} onPress={() => onConfirmJob(d)} />
        <Button label={t('assistant.change')} variant="ghost" size="md" disabled={busy} onPress={onChange} />
      </Card>
    );
  }

  if (result.action === 'order_status' && result.active.length) {
    return (
      <Card style={styles.block}>
        <AppText variant="label" color="textMuted">
          {t('assistant.inProgress')}
        </AppText>
        {result.active.map((a) => (
          <View key={a.id} style={[styles.rowCenter, { flexDirection: row }]}>
            <View style={styles.flex}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {a.code} · {a.kind === 'job' ? t(TRADE_KEY[a.what as UstaadTrade] ?? 'services.ustaad.title') : a.what}
              </AppText>
              <Badge
                label={a.kind === 'job' ? t(JOB_STATUS_KEY[a.status as JobStatus]) : t(STATUS_KEY[a.status as OrderStatus])}
                tone={a.kind === 'job' ? 'ustaad' : 'sauda'}
              />
            </View>
            <Button
              label={t('assistant.open')}
              size="md"
              variant="secondary"
              fullWidth={false}
              onPress={() =>
                router.push(a.kind === 'job' ? { pathname: '/job/[id]', params: { id: a.id } } : { pathname: '/order/[id]', params: { id: a.id } })
              }
            />
          </View>
        ))}
      </Card>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  nameContent: { gap: spacing.lg, alignItems: 'stretch', paddingTop: spacing.xl },
  list: { padding: spacing.lg, gap: spacing.md },
  block: { gap: spacing.sm },
  rowCenter: { alignItems: 'center', gap: spacing.md },
  turn: { gap: spacing.sm, maxWidth: '100%' },
  bubble: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg },
  thinking: { alignItems: 'center', gap: spacing.sm },
  footer: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg, borderTopWidth: 1 },
  mic: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  typeRow: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, minHeight: 44, fontSize: 16 },
});
