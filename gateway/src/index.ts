import {
  createSessionCookie,
  expiredSessionCookie,
  hasValidSession,
  parsePasswordBody,
  readSessionCookie,
  verifyPassword,
} from './auth';
import { RateLimit } from './rate-limit';
import { RelaySession } from './session';
import {
  constantTimeTokenEqual,
  originAllowed,
  parsePositiveInt,
  parseTicketProtocol,
  readBoundedJson,
  randomToken,
  RelayHttpError,
  resolvePublicTarget,
  sha256Base64Url,
} from './security';
import type { GatewayEnv, SessionRecord } from './types';

export { RateLimit, RelaySession };

function securityHeaders(origin?: string): Headers {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    Vary: 'Origin',
  });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Max-Age', '600');
  }
  return headers;
}

function json(body: unknown, status = 200, origin?: string, extra?: HeadersInit): Response {
  const headers = securityHeaders(origin);
  if (extra) new Headers(extra).forEach((value, key) => headers.set(key, value));
  return new Response(JSON.stringify(body), { status, headers });
}

function originAllowedForRequest(request: Request, env: GatewayEnv): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try {
    // The unified Workers deployment serves the page and relay from one
    // origin. Keep this independent of the generated workers.dev hostname;
    // ALLOWED_ORIGINS remains available for an optional Vercel UI.
    if (new URL(origin).origin === new URL(request.url).origin) return true;
  } catch {
    return false;
  }
  return originAllowed(origin, env.ALLOWED_ORIGINS);
}

export async function clientRateLimitKey(request: Request, env?: GatewayEnv): Promise<string> {
  // A signed browser session is a better client boundary than the source IP:
  // several users can share an address, while one authenticated user may
  // intentionally keep several SSH tabs open at once. The cookie value is
  // hashed before it becomes a Durable Object name and is never logged.
  if (env && await hasValidSession(request, env)) {
    const sessionCookie = readSessionCookie(request);
    if (sessionCookie) return `session:${await sha256Base64Url(sessionCookie)}`;
  }

  const ip = request.headers.get('CF-Connecting-IP')?.trim();
  if (ip) return `ip:${ip}`;
  const hostname = new URL(request.url).hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return 'ip:127.0.0.1';

  // Cloudflare normally provides CF-Connecting-IP on the edge-to-Worker hop.
  // Some custom-domain/control-plane paths (and local reverse proxies) omit it.
  // Do not trust user-supplied X-Forwarded-For/X-Real-IP as an authorization
  // input; use a bounded anonymous request fingerprint only for rate limiting.
  // This keeps the relay available while retaining a deterministic per-client
  // bucket when the platform cannot expose the source address.
  const fingerprint = [
    hostname,
    request.headers.get('Origin')?.trim() || '',
    request.headers.get('User-Agent')?.slice(0, 256) || '',
    request.headers.get('Accept-Language')?.slice(0, 128) || '',
    request.headers.get('Sec-CH-UA')?.slice(0, 256) || '',
    request.headers.get('Sec-CH-UA-Platform')?.slice(0, 128) || '',
    request.headers.get('Sec-CH-UA-Mobile')?.slice(0, 32) || '',
  ].join('\n');
  return `anon:${await sha256Base64Url(fingerprint)}`;
}

async function authorized(request: Request, env: GatewayEnv): Promise<boolean> {
  if (await hasValidSession(request, env)) return true;
  const header = request.headers.get('Authorization') || '';
  if (env.ACCESS_TOKEN && header.startsWith('Bearer ')) {
    return constantTimeTokenEqual(header.slice(7), env.ACCESS_TOKEN);
  }
  if (!env.APP_LOGIN_PASSWORD_HASH || !env.APP_SESSION_SECRET) {
    throw new RelayHttpError('Gateway login is not configured', 503);
  }
  return false;
}

async function releaseLoginAttempt(
  limiter: DurableObjectStub,
  attemptId: string,
): Promise<void> {
  await limiter.fetch('https://rate.internal/release', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: attemptId }),
  }).catch(() => undefined);
}

async function login(request: Request, env: GatewayEnv, origin: string): Promise<Response> {
  if (!env.APP_LOGIN_PASSWORD_HASH || !env.APP_SESSION_SECRET) {
    throw new RelayHttpError('Gateway login is not configured', 503);
  }
  const body = await readBoundedJson<unknown>(request, 2048);
  const password = parsePasswordBody(body);
  const attemptId = env.SESSIONS.newUniqueId().toString();
  const limiter = env.RATE_LIMITS.get(
    env.RATE_LIMITS.idFromName(`login:${await clientRateLimitKey(request)}`),
  );
  const attemptsPerMinute = parsePositiveInt(env.LOGIN_ATTEMPTS_PER_MINUTE, 5, 1, 60);
  const reservation = await limiter.fetch('https://rate.internal/reserve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: attemptId,
      expiresAt: Date.now() + 60_000,
      ticketsPerMinute: attemptsPerMinute,
      maxSessions: 1,
    }),
  });
  if (!reservation.ok) {
    const retryAfter = reservation.headers.get('Retry-After') || '60';
    return json({ error: 'Too many login attempts' }, 429, origin, { 'Retry-After': retryAfter });
  }

  try {
    if (!(await verifyPassword(password, env.APP_LOGIN_PASSWORD_HASH))) {
      return json({ error: 'Invalid login password' }, 401, origin);
    }
    const session = await createSessionCookie(env);
    return json(
      { authenticated: true, expiresAt: session.expiresAt },
      200,
      origin,
      { 'Set-Cookie': session.header },
    );
  } finally {
    await releaseLoginAttempt(limiter, attemptId);
  }
}

async function sessionStatus(request: Request, env: GatewayEnv, origin: string): Promise<Response> {
  if (!env.APP_LOGIN_PASSWORD_HASH || !env.APP_SESSION_SECRET) {
    throw new RelayHttpError('Gateway login is not configured', 503);
  }
  return json({ authenticated: await hasValidSession(request, env) }, 200, origin);
}

function logout(origin: string): Response {
  return json({ authenticated: false }, 200, origin, { 'Set-Cookie': expiredSessionCookie() });
}

async function createTicket(request: Request, env: GatewayEnv, origin: string): Promise<Response> {
  if (!(await authorized(request, env))) return json({ error: 'Unauthorized' }, 401, origin);
  const body = await readBoundedJson<{ host?: unknown; port?: unknown }>(request);
  if (typeof body.host !== 'string') return json({ error: 'host is required' }, 400, origin);
  const target = await resolvePublicTarget(body.host, body.port, {
    allowedPorts: env.ALLOWED_PORTS,
    allowedHosts: env.ALLOWED_HOSTS,
  });

  const now = Date.now();
  const ticketTtlSeconds = parsePositiveInt(env.TICKET_TTL_SECONDS, 30, 10, 120);
  const ticketsPerMinute = parsePositiveInt(env.TICKETS_PER_MINUTE, 30, 1, 600);
  const maxSessions = parsePositiveInt(env.MAX_SESSIONS_PER_IP, 16, 1, 100);
  const expiresAt = now + ticketTtlSeconds * 1000;
  const sessionId = env.SESSIONS.newUniqueId();
  const limiterId = env.RATE_LIMITS.idFromName(await clientRateLimitKey(request, env));
  const limiter = env.RATE_LIMITS.get(limiterId);
  const reservation = await limiter.fetch('https://rate.internal/reserve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: sessionId.toString(),
      expiresAt,
      ticketsPerMinute,
      maxSessions,
    }),
  });
  if (!reservation.ok) {
    const limitBody = await reservation
      .json<{ reason?: unknown; retryAfter?: unknown }>()
      .catch(() => undefined);
    const reason = typeof limitBody?.reason === 'string' ? limitBody.reason : 'rate_limited';
    const retryAfter = reservation.headers.get('Retry-After') || String(
      Number.isFinite(Number(limitBody?.retryAfter)) ? Number(limitBody?.retryAfter) : 30,
    );
    return json(
      { error: 'Gateway rate limit exceeded', reason, retryAfter: Number(retryAfter) },
      429,
      origin,
      { 'Retry-After': retryAfter },
    );
  }

  const ticket = randomToken(32);
  const record: SessionRecord = {
    initialized: true,
    used: false,
    ticketHash: await sha256Base64Url(ticket),
    expiresAt,
    host: target.host,
    address: target.address,
    port: target.port,
    family: target.family,
    limiterId: limiterId.toString(),
    sessionId: sessionId.toString(),
  };
  const initialized = await env.SESSIONS.get(sessionId).fetch('https://session.internal/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  if (!initialized.ok) {
    await limiter.fetch('https://rate.internal/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId.toString() }),
    });
    throw new RelayHttpError('Unable to initialize relay session', 503);
  }

  return json(
    {
      protocol: 'ohmyssh.v1',
      sessionId: sessionId.toString(),
      ticket,
      expiresAt,
      target: { host: target.host, port: target.port },
    },
    201,
    origin,
  );
}

async function upgrade(request: Request, env: GatewayEnv): Promise<Response> {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return json({ error: 'WebSocket upgrade required' }, 426);
  }
  const ticket = parseTicketProtocol(request.headers.get('Sec-WebSocket-Protocol'));
  if (!ticket) return json({ error: 'Missing relay protocol or ticket' }, 401);
  const session = new URL(request.url).searchParams.get('session') || '';
  if (!/^[a-f0-9]{64}$/u.test(session)) return json({ error: 'Invalid session id' }, 400);

  let id: DurableObjectId;
  try {
    id = env.SESSIONS.idFromString(session);
  } catch {
    return json({ error: 'Invalid session id' }, 400);
  }
  const headers = new Headers(request.headers);
  headers.set('x-ohmyssh-ticket', ticket);
  headers.set('Sec-WebSocket-Protocol', 'ohmyssh.v1');
  headers.delete('Authorization');
  return env.SESSIONS.get(id).fetch('https://session.internal/connect', { headers });
}

export default {
  async fetch(request: Request, env: GatewayEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return json({
        ok: true,
        service: 'oh-myssh-relay',
        protocol: 'ohmyssh.v1',
        deployment: env.ASSETS ? 'unified-workers' : 'relay-only',
        credentialPath: 'browser-only SSH encryption',
      });
    }

    // Static assets are public and browser navigations do not send an Origin
    // header. Serve the unified Worker UI before applying API CORS checks.
    if (!url.pathname.startsWith('/api/')) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return json({ error: 'Static assets binding is not configured' }, 503);
    }

    const origin = request.headers.get('Origin');
    if (!originAllowedForRequest(request, env)) {
      return json({ error: 'Origin is not allowed' }, 403);
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: securityHeaders(origin!) });

    try {
      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        return await login(request, env, origin!);
      }
      if (url.pathname === '/api/auth/session' && request.method === 'POST') {
        return await sessionStatus(request, env, origin!);
      }
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
        return logout(origin!);
      }
      if (url.pathname === '/api/ticket' && request.method === 'POST') {
        return await createTicket(request, env, origin!);
      }
      if (url.pathname === '/api/tcp') return await upgrade(request, env);
      return json({ error: 'Not found' }, 404, origin!);
    } catch (error) {
      if (error instanceof RelayHttpError) return json({ error: error.message }, error.status, origin!);
      console.error('relay request failed', errorMessage(error));
      return json({ error: 'Gateway request failed' }, 500, origin!);
    }
  },
} satisfies ExportedHandler<GatewayEnv>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
