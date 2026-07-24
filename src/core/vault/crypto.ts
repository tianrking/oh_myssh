/**
 * Oh My SSH - Browser Vault Crypto Layer
 * 使用 WebCrypto API (AES-256-GCM + PBKDF2) 实现端到端加密零内存泄露 Vault
 */

export class VaultDecryptionError extends Error {
  constructor(message = 'Vault 解密失败：主密码错误或校验 Tag 损坏') {
    super(message);
    this.name = 'VaultDecryptionError';
  }
}

/**
 * 将字符串编码为 Uint8Array
 */
function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * 将 Uint8Array 解码为字符串
 */
function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * ArrayBuffer 转 Base64
 */
function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Base64 转 Uint8Array
 */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 从主密码和 Salt 派生 AES-GCM CryptoKey
 */
export async function deriveKey(
  masterPassword: string,
  salt: Uint8Array,
  iterations = 100000
): Promise<CryptoKey> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const keyMaterial = await cryptoObj.subtle.importKey(
    'raw',
    textToBytes(masterPassword),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return cryptoObj.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * AES-256-GCM 加密明文
 */
export async function encryptSecret(
  plaintext: string,
  masterPassword: string
): Promise<string> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const salt = cryptoObj.getRandomValues(new Uint8Array(16));
  const iv = cryptoObj.getRandomValues(new Uint8Array(12));

  const key = await deriveKey(masterPassword, salt);
  const encryptedBuffer = await cryptoObj.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    textToBytes(plaintext)
  );

  // 打包 Payload: [16 字节 Salt] + [12 字节 IV] + [密文 Body]
  const payload = new Uint8Array(salt.length + iv.length + encryptedBuffer.byteLength);
  payload.set(salt, 0);
  payload.set(iv, salt.length);
  payload.set(new Uint8Array(encryptedBuffer), salt.length + iv.length);

  return bufferToBase64(payload);
}

/**
 * AES-256-GCM 解密密文
 */
export async function decryptSecret(
  ciphertextBase64: string,
  masterPassword: string
): Promise<string> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  try {
    const payload = base64ToBytes(ciphertextBase64);
    if (payload.length < 16 + 12 + 1) {
      throw new VaultDecryptionError('无效的密文格式');
    }

    const salt = payload.subarray(0, 16);
    const iv = payload.subarray(16, 28);
    const ciphertext = payload.subarray(28);

    const key = await deriveKey(masterPassword, salt);
    const decryptedBuffer = await cryptoObj.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      ciphertext
    );

    return bytesToText(new Uint8Array(decryptedBuffer));
  } catch (err) {
    if (err instanceof VaultDecryptionError) throw err;
    throw new VaultDecryptionError();
  }
}

/**
 * 本地 Vault 管理服务
 */
export class VaultManager {
  private masterPassword: string | null = null;
  private isUnlocked = false;

  public unlock(password: string): boolean {
    if (!password || password.trim().length === 0) return false;
    this.masterPassword = password;
    this.isUnlocked = true;
    return true;
  }

  public lock(): void {
    this.masterPassword = null;
    this.isUnlocked = false;
  }

  public getUnlockedStatus(): boolean {
    return this.isUnlocked;
  }

  public async encrypt(plaintext: string): Promise<string> {
    if (!this.isUnlocked || !this.masterPassword) {
      throw new Error('Vault 处于锁定状态，无法进行敏感数据加密');
    }
    return encryptSecret(plaintext, this.masterPassword);
  }

  public async decrypt(ciphertext: string): Promise<string> {
    if (!this.isUnlocked || !this.masterPassword) {
      throw new Error('Vault 处于锁定状态，无法进行敏感数据解密');
    }
    return decryptSecret(ciphertext, this.masterPassword);
  }
}

export const vault = new VaultManager();
