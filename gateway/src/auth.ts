import { constantTimeTokenEqual, encodeBase64Url, randomToken, RelayHttpError } from './security';
import type { GatewayEnv } from './types';

export const AUTH_COOKIE_NAME = 'ohmyssh_session';
export const PASSWORD_HASH_SCHEME = 'pbkdf2-sha256';
// Cloudflare Workers WebCrypto currently caps PBKDF2 iteration counts at 100,000.
export const PASSWORD_HASH_ITERATIONS = 100_000;
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('Invalid base64url value');
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function derivePasswordDigest(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as unknown as BufferSource, iterations },
    key,
    256,
  );
  return encodeBase64Url(bits);
}

/** Create a deploy-time password record. The plaintext never belongs in source or assets. */
export async function createPasswordHash(
  password: string,
  salt = crypto.getRandomValues(new Uint8Array(16)),
  iterations = PASSWORD_HASH_ITERATIONS,
): Promise<string> {
  if (!password || encoder.encode(password).byteLength > 512) throw new RelayHttpError('Invalid login password', 400);
  if (!Number.isSafeInteger(iterations) || iterations < 50_000 || iterations > 100_000) {
    throw new RelayHttpError('Invalid password hash settings', 500);
  }
  const digest = await derivePasswordDigest(password, salt, iterations);
  return `${PASSWORD_HASH_SCHEME}$${iterations}$${encodeBase64Url(salt)}$${digest}`;
}

export async function verifyPassword(password: string, encodedHash: string | undefined): Promise<boolean> {
  const record = encodedHash?.replace(/^\uFEFF/u, '').trim() || '';
  if (!password || !record || record.length > 1024) return false;
  const parts = record.split('$');
  if (parts.length !== 4 || parts[0] !== PASSWORD_HASH_SCHEME) return false;
  const iterations = Number(parts[1]);
  if (!Number.isSafeInteger(iterations) || iterations < 50_000 || iterations > 100_000) return false;
  try {
    const salt = decodeBase64Url(parts[2]);
    if (salt.byteLength < 8 || salt.byteLength > 64) return false;
    const digest = await derivePasswordDigest(password, salt, iterations);
    return await constantTimeTokenEqual(digest, parts[3]);
  } catch {
    return false;
  }
}

function cookieValue(request: Request, name: string): string | undefined {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function signSession(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return encodeBase64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

function cookieHeader(value: string, maxAge: number): string {
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export async function createSessionCookie(env: GatewayEnv, now = Math.floor(Date.now() / 1000)):
  Promise<{ value: string; expiresAt: number; header: string }> {
  const secret = env.APP_SESSION_SECRET?.trim();
  if (!secret) throw new RelayHttpError('Gateway login is not configured', 503);
  const expiresAt = now + SESSION_TTL_SECONDS;
  const payload = `${expiresAt}.${randomToken(24)}`;
  const value = `${payload}.${await signSession(payload, secret)}`;
  return { value, expiresAt, header: cookieHeader(value, SESSION_TTL_SECONDS) };
}

export async function hasValidSession(request: Request, env: GatewayEnv, now = Math.floor(Date.now() / 1000)):
  Promise<boolean> {
  const secret = env.APP_SESSION_SECRET?.trim();
  if (!secret) return false;
  const value = cookieValue(request, AUTH_COOKIE_NAME);
  if (!value || value.length > 1024) return false;
  const pieces = value.split('.');
  if (pieces.length !== 3 || !/^\d+$/u.test(pieces[0])) return false;
  const expiresAt = Number(pieces[0]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
  try {
    const expected = await signSession(`${pieces[0]}.${pieces[1]}`, secret);
    return await constantTimeTokenEqual(pieces[2], expected);
  } catch {
    return false;
  }
}

export function expiredSessionCookie(): string {
  return cookieHeader('', 0);
}

export function parsePasswordBody(body: unknown): string {
  if (!body || typeof body !== 'object' || !('password' in body) || typeof body.password !== 'string') {
    throw new RelayHttpError('Password is required', 400);
  }
  if (!body.password || encoder.encode(body.password).byteLength > 512) {
    throw new RelayHttpError('Invalid login password', 400);
  }
  return body.password;
}
