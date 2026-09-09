// apps/workers/src/lib/apnsClient.ts
//
// Minimal, dependency-free APNs (Apple Push Notification service) client using
// token-based auth (PWA audit remediation B4). Built on Node's http2 + crypto
// so it adds no npm dependency. Delivery is a no-op unless APNS_* is configured,
// mirroring how the Web Push path no-ops without VAPID config.

import http2 from 'node:http2';
import { createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { areWorkerOutboundNotificationsEnabled } from '@worker-shared/config/workerExecutionPolicy';

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  bundleId: string;
  privateKeyPem: string;
  production: boolean;
}

export interface ApnsAlertPayload {
  title: string;
  body: string;
  url?: string;
}

export type ApnsSendResult =
  | { ok: true }
  | { ok: false; status: number; reason: string; unregister: boolean };

/** Read APNs config from the environment. Returns null if anything required is missing. */
export function readApnsConfig(env: NodeJS.ProcessEnv = process.env): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = env.APNS_TEAM_ID?.trim();
  const bundleId = env.APNS_BUNDLE_ID?.trim();
  const rawKey = env.APNS_PRIVATE_KEY?.trim();
  if (!keyId || !teamId || !bundleId || !rawKey) return null;

  // .p8 keys are multi-line PEM. Env files often store them with escaped \n.
  const privateKeyPem = rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey;

  return {
    keyId,
    teamId,
    bundleId,
    privateKeyPem,
    production: env.APNS_PRODUCTION === 'true',
  };
}

export function isApnsDeliveryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.APNS_DELIVERY_ENABLED === 'true' &&
    areWorkerOutboundNotificationsEnabled(env) &&
    readApnsConfig(env) !== null
  );
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Build a signed ES256 JWT for APNs provider authentication. */
export function buildApnsAuthToken(config: ApnsConfig, nowSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: config.keyId }));
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: nowSeconds }));
  const signingInput = `${header}.${claims}`;
  const key = createPrivateKey(config.privateKeyPem);
  // dsaEncoding 'ieee-p1363' yields the raw r||s signature JOSE/JWT expects.
  const signature = cryptoSign('sha256', Buffer.from(signingInput), {
    key,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${base64url(signature)}`;
}

// APNs allows an auth token to be reused for 20–60 minutes. Refresh at 40.
let cachedToken: { value: string; expiresAtSeconds: number } | null = null;

function authToken(config: ApnsConfig): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAtSeconds > now) return cachedToken.value;
  const value = buildApnsAuthToken(config, now);
  cachedToken = { value, expiresAtSeconds: now + 40 * 60 };
  return value;
}

/** Reset the cached provider token — for tests and key rotation. */
export function resetApnsAuthTokenCache(): void {
  cachedToken = null;
}

const TERMINAL_REASONS = new Set([
  'BadDeviceToken',
  'Unregistered',
  'DeviceTokenNotForTopic',
  'ExpiredToken',
]);

/**
 * Send one alert notification to one device token. Never throws — returns a
 * structured result so the caller can decide whether to retire the token.
 */
export async function sendApnsNotification(
  deviceToken: string,
  payload: ApnsAlertPayload,
  config: ApnsConfig,
): Promise<ApnsSendResult> {
  const host = config.production
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com';

  const body = JSON.stringify({
    aps: { alert: { title: payload.title, body: payload.body }, sound: 'default' },
    ...(payload.url ? { url: payload.url } : {}),
  });

  return new Promise<ApnsSendResult>((resolve) => {
    let settled = false;
    const client = http2.connect(host);

    const finish = (result: ApnsSendResult) => {
      if (settled) return;
      settled = true;
      try {
        client.close();
      } catch {
        /* already closing */
      }
      resolve(result);
    };

    client.on('error', () =>
      finish({ ok: false, status: 0, reason: 'connection_error', unregister: false }),
    );

    let req: http2.ClientHttp2Stream;
    try {
      req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${authToken(config)}`,
        'apns-topic': config.bundleId,
        'apns-push-type': 'alert',
        'content-type': 'application/json',
      });
    } catch {
      return finish({ ok: false, status: 0, reason: 'request_init_failed', unregister: false });
    }

    let status = 0;
    let data = '';
    req.setEncoding('utf8');
    req.on('response', (headers) => {
      status = Number(headers[':status']) || 0;
    });
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      if (status === 200) return finish({ ok: true });
      let reason = `http_${status || 'error'}`;
      try {
        const parsed = JSON.parse(data);
        if (parsed?.reason) reason = String(parsed.reason);
      } catch {
        /* non-JSON body */
      }
      finish({
        ok: false,
        status,
        reason,
        unregister: status === 410 || TERMINAL_REASONS.has(reason),
      });
    });
    req.on('error', () =>
      finish({ ok: false, status: 0, reason: 'request_error', unregister: false }),
    );
    req.setTimeout(10_000, () =>
      finish({ ok: false, status: 0, reason: 'timeout', unregister: false }),
    );
    req.end(body);
  });
}
