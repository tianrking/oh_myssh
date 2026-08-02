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

function clientIp(request: Request): string {
  const ip = request.headers.get('CF-Connecting-IP')?.trim();
  if (ip) return ip;
  const hostname = new URL(request.url).hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return '127.0.0.1';
  throw new RelayHttpError('Client address is unavailable', 400);
}

async function authorized(request: Request, env: GatewayEnv): Promise<boolean> {
  if (!env.ACCESS_TOKEN) throw new RelayHttpError('Gateway ACCESS_TOKEN is not configured', 503);
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  return constantTimeTokenEqual(header.slice(7), env.ACCESS_TOKEN);
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
  const ticketsPerMinute = parsePositiveInt(env.TICKETS_PER_MINUTE, 10, 1, 600);
  const maxSessions = parsePositiveInt(env.MAX_SESSIONS_PER_IP, 4, 1, 100);
  const expiresAt = now + ticketTtlSeconds * 1000;
  const sessionId = env.SESSIONS.newUniqueId();
  const limiterId = env.RATE_LIMITS.idFromName(clientIp(request));
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
    const retryAfter = reservation.headers.get('Retry-After') || '30';
    return json({ error: 'Gateway rate limit exceeded' }, 429, origin, { 'Retry-After': retryAfter });
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
