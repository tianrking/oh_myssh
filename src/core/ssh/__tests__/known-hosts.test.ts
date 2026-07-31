import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyPair } from '@microsoft/dev-tunnels-ssh';
import { forgetKnownHost, getKnownHost, verifyKnownHost } from '../known-hosts';

function key(bytes: number[], keyType = 'ssh-ed25519'): KeyPair {
  return {
    keyAlgorithmName: keyType,
    hasPublicKey: true,
    hasPrivateKey: false,
    comment: null,
    getPublicKeyBytes: async () => Buffer.from(bytes),
    setPublicKeyBytes: async () => undefined,
    generate: async () => undefined,
    importParameters: async () => undefined,
    exportParameters: async () => ({}),
    dispose: () => undefined,
  } as KeyPair;
}

describe('strict known-hosts TOFU', () => {
  beforeEach(() => {
    forgetKnownHost('example.com', 22);
  });

  it('stores a first-seen key only after explicit acceptance', async () => {
    const reject = vi.fn(async () => false);
    await expect(verifyKnownHost('Example.COM.', 22, key([1, 2, 3]), reject)).resolves.toBe(false);
    expect(getKnownHost('example.com', 22)).toBeUndefined();

    const accept = vi.fn(async () => true);
    await expect(verifyKnownHost('example.com', 22, key([1, 2, 3]), accept)).resolves.toBe(true);
    expect(getKnownHost('example.com', 22)?.fingerprint).toMatch(/^SHA256:/u);
  });

  it('accepts a matching key silently and blocks a changed key without overwriting', async () => {
    await verifyKnownHost('example.com', 22, key([1, 2, 3]), async () => true);
    const original = getKnownHost('example.com', 22)?.fingerprint;
    const prompt = vi.fn(async () => false);

    await expect(verifyKnownHost('example.com', 22, key([1, 2, 3]), prompt)).resolves.toBe(true);
    expect(prompt).not.toHaveBeenCalled();
    await expect(verifyKnownHost('example.com', 22, key([9, 9, 9]), prompt)).resolves.toBe(false);
    expect(getKnownHost('example.com', 22)?.fingerprint).toBe(original);
  });
});
