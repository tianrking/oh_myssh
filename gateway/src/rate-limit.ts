import type { GatewayEnv } from './types';

type Lease = { expiresAt: number };
type RateState = {
  windowStartedAt: number;
  issuedInWindow: number;
  leases: Record<string, Lease>;
};

const STORAGE_KEY = 'rate-state';

export class RateLimit {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: GatewayEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const body = await request.json<{
      sessionId?: string;
      expiresAt?: number;
      ticketsPerMinute?: number;
      maxSessions?: number;
    }>();
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    if (!/^[a-f0-9]{64}$/u.test(sessionId)) return new Response('Invalid session', { status: 400 });

    if (url.pathname === '/release') {
      await this.state.storage.transaction(async (txn) => {
        const current = (await txn.get<RateState>(STORAGE_KEY)) || this.emptyState(Date.now());
        delete current.leases[sessionId];
        await txn.put(STORAGE_KEY, current);
      });
      return Response.json({ ok: true });
    }

    if (url.pathname !== '/reserve' && url.pathname !== '/activate') {
      return new Response('Not found', { status: 404 });
    }

    const now = Date.now();
    const expiresAt = Number(body.expiresAt);
    const ticketsPerMinute = Math.max(1, Math.min(600, Number(body.ticketsPerMinute) || 30));
    const maxSessions = Math.max(1, Math.min(100, Number(body.maxSessions) || 16));
    let allowed = false;
    let reason = 'rate_limited';
    let retryAfter = 60;

    await this.state.storage.transaction(async (txn) => {
      const current = (await txn.get<RateState>(STORAGE_KEY)) || this.emptyState(now);
      for (const [id, lease] of Object.entries(current.leases)) {
        if (!Number.isFinite(lease.expiresAt) || lease.expiresAt <= now) delete current.leases[id];
      }
      if (now - current.windowStartedAt >= 60_000) {
        current.windowStartedAt = now;
        current.issuedInWindow = 0;
      }

      if (url.pathname === '/activate') {
        if (!current.leases[sessionId]) {
          reason = 'lease_missing';
        } else {
          current.leases[sessionId] = { expiresAt };
          allowed = true;
        }
      } else if (current.issuedInWindow >= ticketsPerMinute) {
        reason = 'ticket_rate_limited';
        retryAfter = Math.max(1, Math.ceil((60_000 - (now - current.windowStartedAt)) / 1000));
      } else if (Object.keys(current.leases).length >= maxSessions) {
        reason = 'too_many_sessions';
        retryAfter = 30;
      } else {
        current.issuedInWindow += 1;
        current.leases[sessionId] = { expiresAt };
        allowed = true;
      }
      await txn.put(STORAGE_KEY, current);
    });

    return Response.json(
      { allowed, reason, retryAfter },
      { status: allowed ? 200 : 429, headers: allowed ? undefined : { 'Retry-After': String(retryAfter) } },
    );
  }

  private emptyState(now: number): RateState {
    return { windowStartedAt: now, issuedInWindow: 0, leases: {} };
  }
}
