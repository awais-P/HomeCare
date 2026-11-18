import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { ChatScreen } from '@homecare/shared/chat';
import { useI18n } from '@homecare/shared/i18n';
import { ACTIVE_JOB_STATUSES } from '@homecare/shared/jobs';
import { ACTIVE_STATUSES } from '@homecare/shared/orders';
import { spacing, useColors } from '@homecare/shared/theme';
import { BackHeader, InlineMessage, Screen } from '@homecare/shared/ui';

import { getJob } from '@/features/jobs/api';
import { getOrder } from '@/features/orders/api';

/** Customer chat with the rider (order) or ustaad (booking). */
export default function CustomerChatRoute() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const { t } = useI18n();
  const colors = useColors();
  const isJob = kind === 'job';
  const [info, setInfo] = useState<{ code: string; open: boolean } | null | 'missing'>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (isJob) {
        const { job } = await getJob(id);
        return job ? { code: job.code, open: ACTIVE_JOB_STATUSES.includes(job.status) } : 'missing';
      }
      const { order } = await getOrder(id);
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
      otherLabel={isJob ? 'chat.ustaad' : 'chat.rider'}
      open={info.open}
      quickReplies={['chat.quick.callMe', 'chat.quick.gate', 'chat.quick.ok']}
    />
  );
}
