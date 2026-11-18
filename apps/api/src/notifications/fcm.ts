import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { Message } from './messages.js';

/** The parts of a Firebase service account JSON that we use. */
export type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string };

export type SendResult = 'ok' | 'unregistered' | `error: ${string}`;

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

const base64url = (input: string | Buffer) => Buffer.from(input).toString('base64url');

/** A signed JWT that Google exchanges for an access token (service-account OAuth flow). */
export function signServiceAccountJwt(account: ServiceAccount, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: SCOPE,
      aud: account.token_uri ?? DEFAULT_TOKEN_URI,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(account.private_key);
  return `${header}.${claims}.${base64url(signature)}`;
}

/** Reads the service account from FIREBASE_SERVICE_ACCOUNT_FILE (a path) or FIREBASE_SERVICE_ACCOUNT_JSON. */
export function loadServiceAccount(env: NodeJS.ProcessEnv = process.env): ServiceAccount | null {
  try {
    const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON ?? (env.FIREBASE_SERVICE_ACCOUNT_FILE ? readFileSync(env.FIREBASE_SERVICE_ACCOUNT_FILE, 'utf8') : null);
    if (!raw) return null;
    const account = JSON.parse(raw) as ServiceAccount;
    return account.project_id && account.client_email && account.private_key ? account : null;
  } catch {
    return null;
  }
}

/** Sends to one Android phone through Firebase Cloud Messaging (HTTP v1). */
export class FcmSender {
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly account: ServiceAccount,
    private readonly http: typeof fetch = fetch,
  ) {}

  private async token(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const response = await this.http(this.account.token_uri ?? DEFAULT_TOKEN_URI, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signServiceAccountJwt(this.account),
      }),
    });
    if (!response.ok) throw new Error(`Firebase sign-in failed (${response.status})`);
    const json = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  async send(deviceToken: string, message: Message, data: Record<string, string>): Promise<SendResult> {
    try {
      const response = await this.http(`https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: deviceToken,
            notification: { title: message.title, body: message.body },
            data,
            android: { priority: 'HIGH', notification: { channel_id: 'orders' } },
          },
        }),
      });
      if (response.ok) return 'ok';
      const text = await response.text();
      // The app was uninstalled or the token was replaced: forget this phone.
      if (response.status === 404 || text.includes('UNREGISTERED') || text.includes('registration-token-not-registered')) {
        return 'unregistered';
      }
      return `error: ${response.status} ${text.slice(0, 200)}`;
    } catch (e) {
      return `error: ${(e as Error).message}`;
    }
  }
}
