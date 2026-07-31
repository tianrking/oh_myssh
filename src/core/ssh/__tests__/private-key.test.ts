import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import ssh2 from 'ssh2';
import { importClientPrivateKey } from '../private-key';

let privateKey: KeyObject;
let publicKey: KeyObject;

beforeAll(() => {
  ({ privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001,
  }));
});

function exportPrivate(type: 'pkcs1' | 'pkcs8'): string {
  return privateKey.export({ type, format: 'pem' }).toString();
}

describe('importClientPrivateKey', () => {
  it.each([
    ['PKCS#8', 'pkcs8' as const],
    ['PKCS#1', 'pkcs1' as const],
  ])('imports a runtime-generated RSA %s PEM private key', async (_label, type) => {
    const key = await importClientPrivateKey(exportPrivate(type));

    expect(key.keyAlgorithmName).toBe('ssh-rsa');
    expect(key.hasPrivateKey).toBe(true);
    expect(key.hasPublicKey).toBe(true);
    await expect(key.getPublicKeyBytes()).resolves.toBeInstanceOf(Buffer);

    key.dispose();
  });

  it('imports encrypted PKCS#8 with the correct passphrase and rejects a wrong one', async () => {
    const encrypted = privateKey.export({
      type: 'pkcs8',
      format: 'pem',
      cipher: 'aes-256-cbc',
      passphrase: 'test-only-passphrase',
    }).toString();

    const key = await importClientPrivateKey(encrypted, 'test-only-passphrase');
    expect(key.hasPrivateKey).toBe(true);
    key.dispose();

    await expect(importClientPrivateKey(encrypted, 'wrong-passphrase')).rejects.toThrow(
      /Unable to import private key/,
    );
  });

  it.each(['ed25519', 'rsa'] as const)(
    'imports a real unencrypted OpenSSH %s private-key container',
    async (type) => {
      const generated = ssh2.utils.generateKeyPairSync(
        type,
        type === 'rsa' ? { bits: 2048 } : undefined,
      );
      const key = await importClientPrivateKey(generated.private);
      expect(key.keyAlgorithmName).toBe(type === 'ed25519' ? 'ssh-ed25519' : 'ssh-rsa');
      expect(key.hasPrivateKey).toBe(true);
      expect(key.hasPublicKey).toBe(true);
      key.dispose();
    },
  );

  it('rejects empty, malformed, and public-only PEM input', async () => {
    const publicOnly = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    await expect(importClientPrivateKey('   ')).rejects.toThrow('Private key is empty');
    await expect(importClientPrivateKey('-----BEGIN PRIVATE KEY-----\nnot-base64\n-----END PRIVATE KEY-----')).rejects.toThrow(
      /Unable to import private key/,
    );
    await expect(importClientPrivateKey(publicOnly)).rejects.toThrow(/private component|Unable to import private key/);
  });

  it('rejects an OpenSSH-looking key when a passphrase is supplied instead of mis-parsing it', async () => {
    const testOnlyInvalidOpenSsh = [
      '-----BEGIN OPENSSH PRIVATE KEY-----',
      'dGVzdC1vbmx5LW5vdC1hLXJlYWwta2V5',
      '-----END OPENSSH PRIVATE KEY-----',
    ].join('\n');

    await expect(importClientPrivateKey(testOnlyInvalidOpenSsh, 'passphrase')).rejects.toThrow(
      'Encrypted OpenSSH keys are not supported',
    );
  });
});
