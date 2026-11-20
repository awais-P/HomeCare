import { useLocalSearchParams } from 'expo-router';

import { SosScreen, type SafetyThread } from '@homecare/shared/safety';

/** Emergency help; about an order or booking when opened from one. */
export default function SosRoute() {
  const { kind, id } = useLocalSearchParams<{ kind?: string; id?: string }>();
  const thread: SafetyThread | null = id && (kind === 'order' || kind === 'job') ? { kind, id } : null;
  return <SosScreen thread={thread} />;
}
