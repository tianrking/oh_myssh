export interface GatewayEnv {
  SESSIONS: DurableObjectNamespace;
  RATE_LIMITS: DurableObjectNamespace;
  ACCESS_TOKEN?: string;
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
