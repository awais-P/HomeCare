import { Stack } from 'expo-router';

import { usePushNotifications } from '@homecare/shared/push';

import { PartnerProvider } from '@/features/partner/partner-provider';

export const unstable_settings = { anchor: 'index' };

export default function PartnerAppLayout() {
  // New offers open the jobs screen; updates about a current order open that order.
  usePushNotifications('partner', (data) =>
    data.kind === 'dispute_update' && (data.job_id || data.order_id)
      ? { pathname: '/report/[kind]/[id]', params: data.job_id ? { kind: 'job', id: data.job_id } : { kind: 'order', id: data.order_id! } }
      : data.kind === 'chat_message' && (data.job_id || data.order_id)
      ? { pathname: '/chat/[kind]/[id]', params: data.job_id ? { kind: 'job', id: data.job_id } : { kind: 'order', id: data.order_id! } }
      : data.kind === 'new_offer' || data.kind === 'new_job_offer'
      ? '/'
      : data.job_id
        ? { pathname: '/work/[id]', params: { id: data.job_id } }
        : data.order_id
          ? { pathname: '/job/[id]', params: { id: data.order_id } }
          : null,
  );
  return (
    <PartnerProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="apply" />
        <Stack.Screen name="documents" />
        <Stack.Screen name="account" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="delete-account" />
        <Stack.Screen name="job/[id]" />
        <Stack.Screen name="work/[id]" />
        <Stack.Screen name="chat/[kind]/[id]" />
        <Stack.Screen name="sos" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="report/[kind]/[id]" />
      </Stack>
    </PartnerProvider>
  );
}
