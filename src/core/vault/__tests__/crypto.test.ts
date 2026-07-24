import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret, VaultDecryptionError, VaultManager } from '../crypto';

describe('Vault Crypto Layer - AES-256-GCM & WebCrypto', () => {
  const masterPassword = 'SuperSecretMasterPassword2026!';
  const sampleSecret = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH6+sampleKeyContentForTest';

  it('应该能够成功使用正确的主密码进行加解密', async () => {
    const encrypted = await encryptSecret(sampleSecret, masterPassword);
    expect(encrypted).toBeDefined();
    expect(typeof encrypted).toBe('string');
    expect(encrypted.length).toBeGreaterThan(30);

    const decrypted = await decryptSecret(encrypted, masterPassword);
    expect(decrypted).toBe(sampleSecret);
  });

  it('使用错误的主密码尝试解密时，必须抛出 VaultDecryptionError', async () => {
    const encrypted = await encryptSecret(sampleSecret, masterPassword);
    const wrongPassword = 'WrongMasterPassword123';

    await expect(decryptSecret(encrypted, wrongPassword)).rejects.toThrow(VaultDecryptionError);
  });

  it('两次相同的明文加密后生成的密文必须不同 (IV/Salt 随机化)', async () => {
    const enc1 = await encryptSecret(sampleSecret, masterPassword);
    const enc2 = await encryptSecret(sampleSecret, masterPassword);
    expect(enc1).not.toBe(enc2);

    expect(await decryptSecret(enc1, masterPassword)).toBe(sampleSecret);
    expect(await decryptSecret(enc2, masterPassword)).toBe(sampleSecret);
  });

  it('VaultManager 锁屏状态控制与拒绝未解锁读取', async () => {
    const vm = new VaultManager();
    expect(vm.getUnlockedStatus()).toBe(false);

    await expect(vm.encrypt('secret')).rejects.toThrow('Vault 处于锁定状态');

    vm.unlock(masterPassword);
    expect(vm.getUnlockedStatus()).toBe(true);

    const enc = await vm.encrypt(sampleSecret);
    const dec = await vm.decrypt(enc);
    expect(dec).toBe(sampleSecret);

    vm.lock();
    expect(vm.getUnlockedStatus()).toBe(false);
  });
});
