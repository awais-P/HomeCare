import { createVerify, generateKeyPairSync } from 'node:crypto';

import { FcmSender, signServiceAccountJwt, type ServiceAccount } from './fcm.js';
import { composeMessage, isStale } from './messages.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const account: ServiceAccount = {
  project_id: 'homecare-test',
  client_email: 'push@homecare-test.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};

describe('composeMessage', () => {
  it('writes order updates in English and Urdu', () => {
    expect(composeMessage('order_status', { code: 'HC-ABC123', status: 'on_the_way' })).toEqual({
      title: 'Order HC-ABC123',
      body: 'Your order is on the way to you.',
    });
    expect(composeMessage('order_status', { code: 'HC-ABC123', status: 'delivered' }, 'ur')?.title).toBe('آرڈر HC-ABC123');
  });

  it('asks about substitutions, with or without an alternative', () => {
    expect(composeMessage('substitution', { item: 'Olpers 1 litre', suggestion: 'Nestle Milkpak' })?.body).toBe(
      'Olpers 1 litre is not available. Get Nestle Milkpak instead?',
    );
    expect(composeMessage('substitution', { item: 'Dawn bread', suggestion: null })?.body).toBe('Dawn bread is not available. Skip it?');
  });

  it('tells riders about offers and answers', () => {
    expect(composeMessage('new_offer', { fee: 150, km: 1.2 })?.body).toContain('Rs 150');
    expect(composeMessage('substitution_answer', { item: 'Olpers', approved: false })?.body).toBe('The customer said no: Olpers');
  });

  it('writes ustaad booking updates', () => {
    expect(composeMessage('job_status', { code: 'UJ-ABC123', status: 'arrived' })).toEqual({
      title: 'Booking UJ-ABC123',
      body: 'Your ustaad has arrived.',
    });
    expect(composeMessage('new_job_offer', { trade: 'plumber', timing: 'now', km: 1.4 })?.title).toBe('New job: Plumber');
    expect(composeMessage('job_quote', { total: 2000 })?.body).toBe('Rs 2000 for the work. Tap to approve or decline.');
    expect(composeMessage('quote_answer', { approved: true }, 'ur')?.body).toContain('منظور');
  });

  it('shows chat messages with who sent them', () => {
    expect(composeMessage('chat_message', { code: 'HC-ABC123', from: 'customer', preview: 'Gate 2 please' })).toEqual({
      title: 'Customer · HC-ABC123',
      body: 'Gate 2 please',
    });
    expect(composeMessage('chat_message', { code: 'UJ-ABC123', from: 'admin', preview: 'Hi' })?.title).toBe('HomeCare support · UJ-ABC123');
  });

  it('ignores unknown kinds and statuses', () => {
    expect(composeMessage('something_else', {})).toBeNull();
    expect(composeMessage('order_status', { status: 'requested' })).toBeNull();
  });
});

describe('isStale', () => {
  const now = new Date('2026-11-18T10:00:00Z');
  it('drops offers after a minute but keeps order updates for 30 minutes', () => {
    expect(isStale('new_offer', new Date('2026-11-18T09:58:30Z'), now)).toBe(true);
    expect(isStale('order_status', new Date('2026-11-18T09:58:30Z'), now)).toBe(false);
    expect(isStale('order_status', new Date('2026-11-18T09:20:00Z'), now)).toBe(true);
  });
});

describe('Firebase sending', () => {
  it('signs a service-account JWT that verifies with the public key', () => {
    const jwt = signServiceAccountJwt(account, 1_800_000_000);
    const [header, claims, signature] = jwt.split('.');
    const ok = createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, 'base64url'));
    expect(ok).toBe(true);
    const body = JSON.parse(Buffer.from(claims, 'base64url').toString());
    expect(body).toMatchObject({ iss: account.client_email, exp: 1_800_003_600, aud: 'https://oauth2.googleapis.com/token' });
  });

  it('sends the message and reports uninstalled apps', async () => {
    const calls: { url: string; body: string }[] = [];
    let fcmStatus = 200;
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: typeof init?.body === 'string' ? init.body : '' });
      if (String(url).includes('oauth2')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
      return new Response(fcmStatus === 200 ? '{}' : '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}', {
        status: fcmStatus,
      });
    }) as typeof fetch;
    const sender = new FcmSender(account, fakeFetch);

    expect(await sender.send('device-1', { title: 'T', body: 'B' }, { kind: 'order_status', order_id: 'o1' })).toBe('ok');
    const sent = JSON.parse(calls[1].body);
    expect(calls[1].url).toBe('https://fcm.googleapis.com/v1/projects/homecare-test/messages:send');
    expect(sent.message).toMatchObject({ token: 'device-1', notification: { title: 'T', body: 'B' }, data: { order_id: 'o1' } });

    fcmStatus = 404;
    expect(await sender.send('device-2', { title: 'T', body: 'B' }, {})).toBe('unregistered');
    expect(calls.filter((c) => c.url.includes('oauth2'))).toHaveLength(1); // access token reused
  });
});
