import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { ChatScreen } from '@homecare/shared/chat';
import { useI18n, type TranslationKey } from '@homecare/shared/i18n';
import { ACTIVE_JOB_STATUSES } from '@homecare/shared/jobs';
import { ACTIVE_STATUSES } from '@homecare/shared/orders';
import { spacing, useColors } from '@homecare/shared/theme';
import { BackHeader, InlineMessage, Screen } from '@homecare/shared/ui';

import { getOrder } from '@/features/partner/jobs';
import { getJob } from '@/features/partner/ustaad-jobs';

const RIDER_REPLIES: TranslationKey[] = ['chat.quick.atShop', 'chat.quick.onTheWay', 'chat.quick.fiveMin', 'chat.quick.atDoor', 'chat.quick.callMe'];
const USTAAD_REPLIES: TranslationKey[] = ['chat.quick.onTheWay', 'chat.quick.fiveMin', 'chat.quick.atDoor', 'chat.quick.callMe'];

/** Rider / ustaad chat with the customer. */
export default function PartnerChatRoute() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const { t } = useI18n();
  const colors = useColors();
  const isJob = kind === 'job';
  const [info, setInfo] = useState<{ code: string; open: boolean } | null | 'missing'>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (isJob) {
        const job = await getJob(id);
        return job ? { code: job.code, open: ACTIVE_JOB_STATUSES.includes(job.status) } : 'missing';
      }
      const order = await getOrder(id);
      return order ? { code: order.code, open: ACTIVE_STATUSES.includes(order.status) } : 'missing';
    })()
      .then((next) => {
        if (active) setInfo(next as typeof info);
      })
      .catch(() => {
        if (active) setInfo('missing');
      });
    return () => {
      active = false;
    };
  }, [id, isJob]);

  if (info === null || info === 'missing') {
    return (
      <Screen header={<BackHeader title={t('chat.open')} />} scroll={false}>
        {info === 'missing' ? (
          <InlineMessage tone="error" message={t('errors.generic')} />
        ) : (
          <ActivityIndicator style={{ marginTop: spacing.xxxl }} color={colors.primary} />
        )}
      </Screen>
    );
  }

  return (
    <ChatScreen
      thread={{ kind: isJob ? 'job' : 'order', id }}
      code={info.code}
      otherLabel="chat.customer"
      open={info.open}
      quickReplies={isJob ? USTAAD_REPLIES : RIDER_REPLIES}
    />
  );
}
