import { useLocalSearchParams } from 'expo-router';

import { DisputeScreen } from '@homecare/shared/safety';

/** Report a problem on an order or booking. */
export default function ReportRoute() {
  const { kind, id, code } = useLocalSearchParams<{ kind: string; id: string; code?: string }>();
  return <DisputeScreen thread={{ kind: kind === 'job' ? 'job' : 'order', id }} code={code ?? ''} />;
}
