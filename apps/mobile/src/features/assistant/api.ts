import * as Speech from 'expo-speech';

import type { TranslationKey } from '@homecare/shared/i18n';
import { supabase } from '@homecare/shared/lib';

/** What the assistant Edge Function returns (see supabase/functions/assistant/logic.ts). */
export type SaudaDraft = {
  category: string;
  items_text: string;
  shop_preference: string | null;
  instructions: string | null;
  address_id: string;
  address_label: string;
};
export type UstaadDraft = {
  trade: string;
  problem_text: string;
  timing: 'now' | 'scheduled';
  scheduled_for: string | null;
  address_id: string;
  address_label: string;
  preferred_ustaad_id: string | null;
  preferred_ustaad_name: string | null;
};
export type ActiveRef = { kind: 'order' | 'job'; id: string; code: string; status: string; what: string };
export type AssistantResult =
  | { action: 'sauda_order'; reply: string; draft: SaudaDraft }
  | { action: 'ustaad_job'; reply: string; draft: UstaadDraft }
  | { action: 'order_status'; reply: string; active: ActiveRef[] }
  | { action: 'clarify' | 'other'; reply: string };

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export class AssistantError extends Error {
  constructor(public key: TranslationKey) {
    super(key);
  }
}

const ERROR_KEY: Record<string, TranslationKey> = {
  assistant_limit: 'assistant.errors.limit',
  ai_busy: 'assistant.errors.busy',
  assistant_not_configured: 'assistant.errors.notSetUp',
  audio_too_long: 'assistant.errors.tooLong',
};

/** Sends speech (or typed text) plus the recent conversation; returns what was heard and the assistant's answer. */
export async function askAssistant(input: {
  audio?: { base64: string; mime: string };
  text?: string;
  history: ChatTurn[];
}): Promise<{ transcript: string; result: AssistantResult }> {
  const { data, error } = await supabase.functions.invoke('assistant', { body: input });
  if (error) {
    // The function answers errors as { error: code } with a non-2xx status.
    let code = '';
    const context = (error as { context?: Response }).context;
    try {
      code = context ? ((await context.json()) as { error?: string }).error ?? '' : '';
    } catch {
      code = '';
    }
    // A 404 means the function hasn't been deployed yet.
    if (!code && context?.status === 404) code = 'assistant_not_configured';
    throw new AssistantError(ERROR_KEY[code] ?? 'assistant.errors.failed');
  }
  return data as { transcript: string; result: AssistantResult };
}

/** Reads the reply aloud: Urdu voice for Urdu text, English otherwise. */
export function speak(text: string) {
  if (!text) return;
  Speech.stop();
  Speech.speak(text, { language: /[؀-ۿ]/.test(text) ? 'ur-PK' : 'en-US', rate: 1.0 });
}

export const stopSpeaking = () => Speech.stop();
