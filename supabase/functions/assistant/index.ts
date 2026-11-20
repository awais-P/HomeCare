// HomeCare voice assistant — Supabase Edge Function (Deno).
//
// POST { audio?: { base64, mime }, text?: string, history?: ChatTurn[] }  (signed-in users only)
//   1. checks the caller's daily limit (assistant_take_quota)
//   2. speech → text with Groq Whisper (when audio is sent)
//   3. text → structured intent with a Groq model (strict JSON schema)
//   4. validates it against the caller's own addresses / favourites (logic.ts)
// Returns { transcript, result } — a draft the app shows on a confirmation card. Never places orders.
//
// Secrets (Supabase → Edge Functions → Secrets): GROQ_API_KEY (required),
// GROQ_CHAT_MODEL (default openai/gpt-oss-120b), GROQ_STT_MODEL (default whisper-large-v3).
// Deploy and setup: docs/VOICE_ASSISTANT.md

import { createClient } from 'npm:@supabase/supabase-js@2';

import { buildSystemPrompt, cleanHistory, INTENT_SCHEMA, interpret, TRANSCRIBE_HINT, type AssistantContext } from './logic.ts';

const GROQ = 'https://api.groq.com/openai/v1';
const CHAT_MODEL = Deno.env.get('GROQ_CHAT_MODEL') ?? 'openai/gpt-oss-120b';
const STT_MODEL = Deno.env.get('GROQ_STT_MODEL') ?? 'whisper-large-v3';
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (code: string, status: number) => json({ error: code }, status);

function base64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function transcribe(key: string, b64: string, mime: string): Promise<string> {
  const bytes = base64ToBytes(b64);
  if (bytes.length > MAX_AUDIO_BYTES) throw new Error('audio_too_long');
  const ext = mime.includes('webm') ? 'webm' : 'm4a';
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), `speech.${ext}`);
  form.append('model', STT_MODEL);
  form.append('prompt', TRANSCRIBE_HINT);
  form.append('response_format', 'json');
  form.append('temperature', '0');
  const res = await fetch(`${GROQ}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  if (res.status === 429) throw new Error('ai_busy');
  if (!res.ok) throw new Error(`transcribe_failed_${res.status}`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? '').trim();
}

async function understand(key: string, system: string, turns: { role: string; content: string }[]): Promise<unknown> {
  const res = await fetch(`${GROQ}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [{ role: 'system', content: system }, ...turns],
      response_format: { type: 'json_schema', json_schema: { name: 'homecare_intent', strict: true, schema: INTENT_SCHEMA } },
      temperature: 0.2,
      max_completion_tokens: 2000,
    }),
  });
  if (res.status === 429) throw new Error('ai_busy');
  if (!res.ok) throw new Error(`understand_failed_${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? '{}';
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  const groqKey = Deno.env.get('GROQ_API_KEY');
  if (!groqKey) return fail('assistant_not_configured', 503);

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: userData } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  const user = userData?.user;
  if (!user) return fail('not_signed_in', 401);

  let body: { audio?: { base64?: string; mime?: string }; text?: string; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail('bad_request', 400);
  }

  // Daily limit (as the user, so it counts per person).
  const quota = await supabase.rpc('assistant_take_quota');
  if (quota.error) return fail(quota.error.message.includes('assistant_limit') ? 'assistant_limit' : 'quota_failed', 429);

  try {
    let transcript = typeof body.text === 'string' ? body.text.trim().slice(0, 1000) : '';
    if (!transcript && body.audio?.base64) {
      transcript = await transcribe(groqKey, body.audio.base64, body.audio.mime ?? 'audio/mp4');
    }
    if (!transcript) return json({ transcript: '', result: { action: 'clarify', reply: '' } });

    // The caller's own data, read with their permissions (RLS).
    const [profile, addresses, favourites, orders, jobs] = await Promise.all([
      supabase.from('profiles').select('full_name, language, assistant_name').eq('id', user.id).maybeSingle(),
      supabase.from('addresses').select('id, label, custom_label, area, is_default').order('created_at'),
      supabase.rpc('my_favourite_ustaads'),
      supabase.from('orders').select('id, code, status, items_text').in('status', ['requested', 'accepted', 'at_shop', 'on_the_way']).limit(5),
      supabase
        .from('ustaad_jobs')
        .select('id, code, status, trade')
        .in('status', ['requested', 'accepted', 'on_the_way', 'arrived', 'quoted', 'in_progress'])
        .limit(5),
    ]);

    const ctx: AssistantContext = {
      assistantName: profile.data?.assistant_name || 'Jack',
      userName: profile.data?.full_name ?? null,
      language: profile.data?.language === 'ur' ? 'ur' : 'en',
      now: new Date().toISOString(),
      addresses: (addresses.data ?? []).map((a) => ({
        id: a.id,
        label: a.label === 'other' && a.custom_label ? a.custom_label : a.label,
        area: a.area,
        is_default: a.is_default,
      })),
      favourites: (favourites.data ?? []).map((f: { ustaad_id: string; name: string | null; trades: string[] }) => ({
        id: f.ustaad_id,
        name: f.name,
        trades: f.trades,
      })),
      active: [
        ...(orders.data ?? []).map((o) => ({ kind: 'order' as const, id: o.id, code: o.code, status: o.status, what: o.items_text.slice(0, 60) })),
        ...(jobs.data ?? []).map((j) => ({ kind: 'job' as const, id: j.id, code: j.code, status: j.status, what: j.trade })),
      ],
    };

    const turns = [...cleanHistory(body.history), { role: 'user' as const, content: transcript }];
    const raw = await understand(groqKey, buildSystemPrompt(ctx), turns);
    return json({ transcript, result: interpret(raw, ctx) });
  } catch (e) {
    const code = e instanceof Error ? e.message : 'failed';
    console.error('assistant error', code);
    if (code === 'ai_busy') return fail('ai_busy', 429);
    if (code === 'audio_too_long') return fail('audio_too_long', 413);
    return fail('assistant_failed', 502);
  }
});
