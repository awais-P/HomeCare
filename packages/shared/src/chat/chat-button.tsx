import { useAuth } from '../auth/auth-provider';
import { useI18n } from '../i18n';
import { Button } from '../ui';

import { useUnreadCount, type ChatThread } from './api';

/** Opens the chat for an order or booking; shows how many new messages are waiting. */
export function ChatButton({ thread, onPress, style }: { thread: ChatThread; onPress: () => void; style?: object }) {
  const { t } = useI18n();
  const { session } = useAuth();
  const unread = useUnreadCount(thread, session?.user.id ?? null);
  return (
    <Button
      style={style}
      label={unread ? t('chat.openUnread', { count: unread }) : t('chat.open')}
      icon={unread ? 'chatbubbles' : 'chatbubbles-outline'}
      variant={unread ? 'primary' : 'secondary'}
      size="md"
      onPress={onPress}
    />
  );
}
