import { Buffer } from 'buffer';
import type { KeyPair } from '@microsoft/dev-tunnels-ssh';

const STORAGE_KEY = 'ohmyssh.known-hosts.v1';
const memoryStore = new Map<string, KnownHostRecord>();

export type KnownHostRecord = {
  host: string;
  port: number;
  keyType: string;
  fingerprint: string;
  trustedAt: number;
};

export type HostKeyPrompt = KnownHostRecord & {
  status: 'first-seen' | 'changed';
  previousFingerprint?: string;
  previousKeyType?: string;
};

export type ConfirmHostKey = (prompt: HostKeyPrompt) => boolean | Promise<boolean>;

function normalizeKnownHost(host: string): string {
  let normalized = host.trim().toLowerCase();
  if (normalized.startsWith('[') && normalized.endsWith(']')) normalized = normalized.slice(1, -1);
  return normalized.replace(/\.$/u, '');
}

export function knownHostId(host: string, port: number): string {
  return `${normalizeKnownHost(host)}:${port}`;
}

function loadRecords(): Record<string, KnownHostRecord> {
  if (typeof localStorage === 'undefined') return Object.fromEntries(memoryStore);
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, KnownHostRecord>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveRecords(records: Record<string, KnownHostRecord>): void {
  for (const [id, record] of Object.entries(records)) memoryStore.set(id, record);
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Trust remains available for this page lifetime if persistent storage is unavailable.
  }
}

export function getKnownHost(host: string, port: number): KnownHostRecord | undefined {
  const id = knownHostId(host, port);
  return loadRecords()[id] || memoryStore.get(id);
}

export function trustKnownHost(record: KnownHostRecord): void {
  const records = loadRecords();
  records[knownHostId(record.host, record.port)] = {
    ...record,
    host: normalizeKnownHost(record.host),
  };
  saveRecords(records);
}

export function forgetKnownHost(host: string, port: number): void {
  const id = knownHostId(host, port);
  const records = loadRecords();
  delete records[id];
  memoryStore.delete(id);
  saveRecords(records);
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64').replace(/=+$/u, '');
}

export async function hostKeyFingerprint(keyPair: KeyPair): Promise<{ keyType: string; fingerprint: string }> {
  const publicKey = await keyPair.getPublicKeyBytes();
  if (!publicKey?.byteLength) throw new Error('SSH server supplied an empty host key');
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(publicKey));
  return {
    keyType: keyPair.keyAlgorithmName,
    fingerprint: `SHA256:${base64(new Uint8Array(digest))}`,
  };
}

function defaultConfirmation(prompt: HostKeyPrompt): boolean {
  // The production UI is intentionally click-free after the product login. Trust the
  // first key on a host once and persist it as TOFU; a later key change still requires
  // an explicit confirmation and is rejected when the browser cannot show one.
  if (prompt.status === 'first-seen') return true;
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return false;
  const message = [
    '警告：服务器主机密钥已经变化，可能是服务器重装，也可能是中间人攻击。',
    '',
    `${prompt.host}:${prompt.port}`,
    `原指纹：${prompt.previousFingerprint}`,
    `新指纹：${prompt.fingerprint}`,
    '',
    '只有在你已通过可信渠道确认变更时，才选择继续。',
  ];
  return window.confirm(message.join('\n'));
}

/**
 * TOFU: matching keys pass silently, first-seen keys are stored automatically, and changed
 * keys require explicit confirmation before storage can be updated.
 */
export async function verifyKnownHost(
  host: string,
  port: number,
  keyPair: KeyPair,
  confirmHostKey: ConfirmHostKey = defaultConfirmation,
): Promise<boolean> {
  const { keyType, fingerprint } = await hostKeyFingerprint(keyPair);
  const normalizedHost = normalizeKnownHost(host);
  const current = getKnownHost(normalizedHost, port);
  if (current?.fingerprint === fingerprint && current.keyType === keyType) return true;

  const prompt: HostKeyPrompt = {
    host: normalizedHost,
    port,
    keyType,
    fingerprint,
    trustedAt: Date.now(),
    status: current ? 'changed' : 'first-seen',
    previousFingerprint: current?.fingerprint,
    previousKeyType: current?.keyType,
  };
  const accepted = await confirmHostKey(prompt);
  if (!accepted) return false;
  trustKnownHost(prompt);
  return true;
}
