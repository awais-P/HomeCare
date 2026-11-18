import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '../auth/auth-provider';
import { useI18n, type TranslationKey } from '../i18n';
import type { ChatMessage } from '../lib';
import { radius, spacing, useColors } from '../theme';
import { AppText, BackHeader, InlineMessage, Screen } from '../ui';

import { chatErrorKey, listMessages, markRead, sendMessage, useChatLive, type ChatThread } from './api';

/** Backup refresh; new messages normally arrive instantly through Realtime. */
const REFRESH_MS = 15_000;

export type ChatScreenProps = {
  thread: ChatThread;
  /** Order or booking code for the title, e.g. HC-1A2B3C. */
  code: string;
  /** What to call the other person: rider, ustaad or customer. */
  otherLabel: TranslationKey;
  /** Whether the two of them can still write (the order or job is active). */
  open: boolean;
  /** One-tap messages shown above the input. */
  quickReplies?: TranslationKey[];
};

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' });

/** One chat between a customer and their rider or ustaad (support can join). */
export function ChatScreen({ thread, code, otherLabel, open, quickReplies = [] }: ChatScreenProps) {
  const { t, isRTL } = useI18n();
  const colors = useColors();
  const { session } = useAuth();
  const myId = session?.user.id ?? null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);
  useChatLive(thread, reload);

  const kind = thread.kind;
  const id = thread.id;
  useEffect(() => {
    let active = true;
    const target = { kind, id };
    const fetchMessages = async () => {
      try {
        const list = await listMessages(target);
        if (!active) return;
        setMessages(list);
        setLoading(false);
        if (list.some((m) => m.sender_id !== myId && !m.read_at)) await markRead(target);
      } catch {
        if (active) setLoading(false);
      }
    };
    void fetchMessages();
    const timer = setInterval(() => void fetchMessages(), REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [kind, id, myId, reloadToken]);

  const send = async (body: string) => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await sendMessage(thread, trimmed);
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      setText('');
    } catch (e) {
      setError(chatErrorKey(e));
    } finally {
      setSending(false);
    }
  };

  // Newest at the bottom: an inverted list shows the end first and keeps it there.
  const reversed = useMemo(() => [...messages].reverse(), [messages]);
  const lastMine = useMemo(() => [...messages].reverse().find((m) => m.sender_id === myId)?.id, [messages, myId]);
  const end = isRTL ? 'flex-start' : 'flex-end';
  const start = isRTL ? 'flex-end' : 'flex-start';

  const footer = open ? (
    <View style={styles.footer}>
      {quickReplies.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} keyboardShouldPersistTaps="handled">
          {quickReplies.map((key) => (
            <Pressable
              key={key}
              disabled={sending}
              onPress={() => void send(t(key))}
              accessibilityRole="button"
              style={({ pressed }) => [styles.quickChip, { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : colors.surface }]}>
              <AppText variant="small">{t(key)}</AppText>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {error ? <InlineMessage tone="error" message={t(error)} /> : null}
      <View style={[styles.inputRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderColor: colors.border, backgroundColor: colors.surface }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('chat.placeholder')}
          placeholderTextColor={colors.textSubtle}
          multiline
          maxLength={500}
          style={[styles.input, { color: colors.text, textAlign: isRTL ? 'right' : 'left' }]}
          accessibilityLabel={t('chat.placeholder')}
        />
        <Pressable
          onPress={() => void send(text)}
          disabled={sending || !text.trim()}
          accessibilityRole="button"
          accessibilityLabel={t('chat.send')}
          style={[styles.sendButton, { backgroundColor: text.trim() ? colors.primary : colors.surfaceAlt }]}>
          {sending ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <Ionicons name="send" size={18} color={text.trim() ? colors.onPrimary : colors.textSubtle} style={isRTL ? styles.flip : undefined} />
          )}
        </Pressable>
      </View>
    </View>
  ) : (
    <View style={styles.footer}>
      <InlineMessage tone="info" message={t('chat.closed')} />
    </View>
  );

  return (
    <Screen header={<BackHeader title={t('chat.title', { code })} />} scroll={false} padded={false} footer={footer}>
      {loading ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : messages.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={40} color={colors.textSubtle} />
          <AppText variant="body" color="textMuted" align="center">
            {t('chat.empty')}
          </AppText>
        </View>
      ) : (
        <FlatList
          inverted
          data={reversed}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const mine = item.sender_id === myId;
            const support = item.sender_role === 'admin';
            return (
              <View style={[styles.bubbleWrap, { alignSelf: mine ? end : start }]}>
                {!mine ? (
                  <AppText variant="small" color="textMuted">
                    {support ? t('chat.support') : t(otherLabel)}
                  </AppText>
                ) : null}
                <View
                  style={[
                    styles.bubble,
                    {
                      backgroundColor: mine ? colors.primary : support ? colors.saudaSoft : colors.surfaceAlt,
                      borderColor: colors.border,
                    },
                  ]}>
                  <AppText color={mine ? 'onPrimary' : 'text'}>{item.body}</AppText>
                </View>
                <AppText variant="small" color="textSubtle" style={{ alignSelf: mine ? end : start }}>
                  {timeOf(item.created_at)}
                  {mine && item.id === lastMine && item.read_at ? ` · ${t('chat.read')}` : ''}
                </AppText>
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: spacing.xxxl },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  list: { padding: spacing.lg, gap: spacing.md },
  bubbleWrap: { maxWidth: '82%', gap: 2 },
  bubble: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg },
  footer: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  quick: { gap: spacing.sm, paddingVertical: 2 },
  quickChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1 },
  inputRow: { alignItems: 'flex-end', gap: spacing.sm, borderWidth: 1, borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  input: { flex: 1, maxHeight: 120, minHeight: 40, fontSize: 16, paddingVertical: spacing.sm },
  sendButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  flip: { transform: [{ scaleX: -1 }] },
});
