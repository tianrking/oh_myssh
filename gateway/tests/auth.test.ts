import { describe, expect, it } from 'vitest';
import {
  AUTH_COOKIE_NAME,
  createPasswordHash,
  createSessionCookie,
  expiredSessionCookie,
  hasValidSession,
  verifyPassword,
} from '../src/auth';

describe('browser login authentication', () => {
  it('verifies PBKDF2 password records without storing plaintext', async () => {
    const salt = new Uint8Array(16).fill(7);
    const encoded = await createPasswordHash('fixture-password', salt, 50_000);
    expect(encoded).toMatch(/^pbkdf2-sha256\$50000\$/u);
    expect(await verifyPassword('fixture-password', encoded)).toBe(true);
    expect(await verifyPassword('fixture-password', `\uFEFF${encoded}\r\n`)).toBe(true);
    expect(await verifyPassword('wrong-password', encoded)).toBe(false);
  });

  it('accepts only a signed, unexpired HttpOnly session cookie', async () => {
    const env = { APP_SESSION_SECRET: 'fixture-session-secret' } as any;
    const session = await createSessionCookie(env, 1_000);
    const request = new Request('https://ssh.w0x7ce.eu/api/ticket', {
      headers: { Cookie: `${AUTH_COOKIE_NAME}=${session.value}` },
    });
    expect(await hasValidSession(request, env, 1_001)).toBe(true);
    expect(await hasValidSession(request, env, session.expiresAt + 1)).toBe(false);

    const tampered = new Request(request, {
      headers: { Cookie: `${AUTH_COOKIE_NAME}=${session.value.slice(0, -1)}x` },
    });
    expect(await hasValidSession(tampered, env, 1_001)).toBe(false);
    expect(expiredSessionCookie()).toContain('Max-Age=0');
  });
});
