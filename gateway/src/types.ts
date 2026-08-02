export interface GatewayEnv {
  ASSETS?: Fetcher;
  SESSIONS: DurableObjectNamespace;
  RATE_LIMITS: DurableObjectNamespace;
  /** Legacy machine/client bearer credential kept for backwards compatibility. */
  ACCESS_TOKEN?: string;
  /** PBKDF2-SHA-256 record; the plaintext is never shipped to the browser. */
  APP_LOGIN_PASSWORD_HASH?: string;
  /** HMAC secret used to sign the HttpOnly browser session cookie. */
  APP_SESSION_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  ALLOWED_PORTS?: string;
  ALLOWED_HOSTS?: string;
  TICKETS_PER_MINUTE?: string;
  MAX_SESSIONS_PER_IP?: string;
  TICKET_TTL_SECONDS?: string;
  CONNECT_TIMEOUT_MS?: string;
  IDLE_TIMEOUT_SECONDS?: string;
  MAX_SESSION_SECONDS?: string;
  MAX_BYTES_PER_DIRECTION?: string;
  MAX_FRAME_BYTES?: string;
  MAX_QUEUED_BYTES?: string;
  LOGIN_ATTEMPTS_PER_MINUTE?: string;
}

export type SessionRecord = {
  initialized: true;
  used: boolean;
  ticketHash: string;
  expiresAt: number;
  host: string;
  address: string;
  port: number;
  family: 4 | 6;
  limiterId: string;
  sessionId: string;
};
