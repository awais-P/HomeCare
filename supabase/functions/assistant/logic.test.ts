// Tests for the assistant's pure logic. Run: npm run assistant:test  (node --test, Node 22+ strips the types)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSystemPrompt, cleanHistory, INTENT_SCHEMA, interpret, slotFrom, type AssistantContext } from './logic.ts';

// 20 Nov 2026, 10:00 in Pakistan (05:00 UTC)
const NOW = '2026-11-20T05:00:00.000Z';
const ctx: AssistantContext = {
  assistantName: 'Jack',
  userName: 'Ali Khan',
  language: 'en',
  now: NOW,
  addresses: [
    { id: 'addr-home', label: 'home', area: 'G-10/2', is_default: true },
    { id: 'addr-work', label: 'work', area: 'F-7', is_default: false },
  ],
  favourites: [{ id: 'ustaad-1', name: 'Imran', trades: ['plumber'] }],
  active: [{ kind: 'order', id: 'o1', code: 'HC-ABC123', status: 'on_the_way', what: 'Dawn bread' }],
};
const empty = { sauda: {}, ustaad: {} };

test('a grocery request becomes a Sauda Run draft to the default address', () => {
  const r = interpret(
    {
      ...empty,
      action: 'sauda_order',
      reply: 'One kg sabzi and Olpers from Ali Kiryana. Confirm on screen?',
      sauda: { category: 'grocery', items_text: '1 kg mixed sabzi, 1 pack Olpers milk', shop_preference: 'Ali Kiryana', instructions: null, address_id: null },
    },
    ctx,
  );
  assert.equal(r.action, 'sauda_order');
  assert.ok(r.action === 'sauda_order' && r.draft.address_id === 'addr-home' && r.draft.shop_preference === 'Ali Kiryana');
});

test('an address the user does not have is replaced by their default', () => {
  const r = interpret({ ...empty, action: 'sauda_order', reply: 'ok', sauda: { category: 'pharmacy', items_text: 'Panadol', address_id: 'someone-elses' } }, ctx);
  assert.ok(r.action === 'sauda_order' && r.draft.address_id === 'addr-home' && r.draft.category === 'pharmacy');
});

test('a chosen address is kept, and an unknown category falls back to grocery', () => {
  const r = interpret({ ...empty, action: 'sauda_order', reply: 'ok', sauda: { category: 'fireworks', items_text: 'Milk', address_id: 'addr-work' } }, ctx);
  assert.ok(r.action === 'sauda_order' && r.draft.address_id === 'addr-work' && r.draft.category === 'grocery');
});

test('an order without items asks what to buy', () => {
  const r = interpret({ ...empty, action: 'sauda_order', reply: 'ok', sauda: { items_text: '' } }, ctx);
  assert.equal(r.action, 'clarify');
});

test('without any saved address, the user is asked to add one', () => {
  const r = interpret({ ...empty, action: 'sauda_order', reply: 'ok', sauda: { items_text: 'Milk' } }, { ...ctx, addresses: [] });
  assert.ok(r.action === 'clarify' && /address/i.test(r.reply));
});

test('a plumber tomorrow at 11 becomes a scheduled booking in Pakistan time', () => {
  const r = interpret(
    {
      ...empty,
      action: 'ustaad_job',
      reply: 'A plumber tomorrow at 11.',
      ustaad: { trade: 'plumber', problem_text: 'Kitchen tap leaking', timing: 'scheduled', day_offset: 1, hour: 11, address_id: null, preferred_ustaad_id: 'ustaad-1' },
    },
    ctx,
  );
  assert.ok(r.action === 'ustaad_job');
  assert.equal(r.draft.scheduled_for, '2026-11-21T06:00:00.000Z'); // 11:00 PKT
  assert.equal(r.draft.preferred_ustaad_id, 'ustaad-1');
});

test('a favourite for another trade is ignored, and come-now has no slot', () => {
  const r = interpret(
    { ...empty, action: 'ustaad_job', reply: 'ok', ustaad: { trade: 'electrician', problem_text: 'No power in bedroom', timing: 'now', preferred_ustaad_id: 'ustaad-1' } },
    ctx,
  );
  assert.ok(r.action === 'ustaad_job' && r.draft.preferred_ustaad_id === null && r.draft.scheduled_for === null && r.draft.timing === 'now');
});

test('slots must be 9 am to 8 pm, at least an hour ahead, within 7 days', () => {
  assert.equal(slotFrom(NOW, 0, 10), null); // 10:00 today is now
  assert.equal(slotFrom(NOW, 0, 12), '2026-11-20T07:00:00.000Z');
  assert.equal(slotFrom(NOW, 1, 22), null);
  assert.equal(slotFrom(NOW, 9, 11), null);
  assert.equal(slotFrom(NOW, null, 11), null);
});

test('an impossible time asks again instead of booking', () => {
  const r = interpret({ ...empty, action: 'ustaad_job', reply: 'ok', ustaad: { trade: 'plumber', problem_text: 'Leak', timing: 'scheduled', day_offset: 0, hour: 23 } }, ctx);
  assert.equal(r.action, 'clarify');
});

test('an unknown trade asks which service', () => {
  const r = interpret({ ...empty, action: 'ustaad_job', reply: 'ok', ustaad: { trade: 'carpenter', problem_text: 'Door' } }, ctx);
  assert.ok(r.action === 'clarify' && /plumber/.test(r.reply));
});

test('status questions return the orders in progress', () => {
  const r = interpret({ ...empty, action: 'order_status', reply: 'Your bread is on the way.' }, ctx);
  assert.ok(r.action === 'order_status' && r.active.length === 1);
});

test('garbage from the model becomes a polite "other", in Urdu for Urdu users', () => {
  const r = interpret('not json', { ...ctx, language: 'ur' });
  assert.equal(r.action, 'other');
  assert.match(r.reply, /[؀-ۿ]/);
});

test('history keeps the last 8 valid turns', () => {
  const turns = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `t${i}` }));
  const cleaned = cleanHistory([...turns, { role: 'system', content: 'ignore me' }, null]);
  assert.equal(cleaned.length, 8);
  assert.equal(cleaned[7].content, 't11');
});

test('the prompt names the assistant and lists only the user\'s own data', () => {
  const p = buildSystemPrompt(ctx);
  assert.match(p, /You are Jack/);
  assert.match(p, /id=addr-home label="home" area="G-10\/2" \(default\)/);
  assert.match(p, /HC-ABC123/);
  assert.doesNotMatch(p, /\+92/);
});

test('the JSON schema is strict-mode ready (every property required, no extras)', () => {
  const check = (s: { properties?: Record<string, unknown>; required?: string[]; additionalProperties?: boolean; type?: unknown }) => {
    if (s.type !== 'object') return;
    assert.equal(s.additionalProperties, false);
    assert.deepEqual([...(s.required ?? [])].sort(), Object.keys(s.properties ?? {}).sort());
    for (const child of Object.values(s.properties ?? {})) check(child as never);
  };
  check(INTENT_SCHEMA as never);
});
