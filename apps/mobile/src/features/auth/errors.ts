import { isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js';

import type { TranslationKey } from '@/i18n/strings';

/** Maps any error from Supabase Auth / PostgREST to a user-facing message key. */
export function errorMessageKey(error: unknown): TranslationKey {
  if (isAuthRetryableFetchError(error)) return 'errors.network';

  if (isAuthError(error)) {
    switch (error.code) {
      case 'otp_expired':
      case 'invalid_credentials':
        return 'errors.otpInvalid';
      case 'over_sms_send_rate_limit':
      case 'over_request_rate_limit':
        return 'errors.rateLimited';
      case 'sms_send_failed':
        return 'errors.smsFailed';
      case 'phone_provider_disabled':
      case 'provider_disabled':
      case 'otp_disabled':
      case 'signup_disabled':
        return 'errors.phoneDisabled';
    }
    if (error.status === 429) return 'errors.rateLimited';
    if (error.status === 403) return 'errors.otpInvalid';
    if (error.status === 0) return 'errors.network';
    return 'errors.generic';
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/network request failed|failed to fetch|network/i.test(message)) return 'errors.network';
  return 'errors.generic';
}
