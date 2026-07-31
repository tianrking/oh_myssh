import { Buffer } from 'buffer';
import {
  PublicKeyAlgorithm,
  type KeyPair,
  type Signer,
  type Verifier,
} from '@microsoft/dev-tunnels-ssh';
import { importKey } from '@microsoft/dev-tunnels-ssh-keys';

const OPENSSH_BEGIN = '-----BEGIN OPENSSH PRIVATE KEY-----';
const OPENSSH_END = '-----END OPENSSH PRIVATE KEY-----';
const ED25519 = 'ssh-ed25519';

type Ed25519Parameters = {
  publicKey: Uint8Array;
  seed?: Uint8Array;
};

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function uint32(value: number): Uint8Array {
  const output = new Uint8Array(4);
  new DataView(output.buffer).setUint32(0, value, false);
  return output;
}

function sshString(value: string | Uint8Array): Uint8Array {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return concat(uint32(bytes.byteLength), bytes);
}

class BinaryReader {
  private offset = 0;

  constructor(private readonly data: Uint8Array) {}

  get remaining(): number {
    return this.data.byteLength - this.offset;
  }

  read(length: number, label: string): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.remaining) {
      throw new Error(`Malformed ${label}`);
    }
    const value = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  readUInt32(label: string): number {
    const bytes = this.read(4, `${label} length`);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
  }

  readString(label: string, maxLength = 256 * 1024): Uint8Array {
    const length = this.readUInt32(label);
    if (length > maxLength) throw new Error(`${label} is too large`);
    return this.read(length, label);
  }

  readText(label: string, maxLength = 4096): string {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(this.readString(label, maxLength));
    } catch (error) {
      if (error instanceof Error && error.message.includes(label)) throw error;
      throw new Error(`Malformed ${label}: invalid UTF-8`);
    }
  }

  readPositiveMpint(label: string): Uint8Array {
    let value = this.readString(label, 128 * 1024);
    if (!value.length || (value[0] & 0x80) !== 0) throw new Error(`Malformed ${label}`);
    if (value[0] === 0) {
      if (value.length === 1 || (value[1] & 0x80) === 0) throw new Error(`Non-canonical ${label}`);
      value = value.slice(1);
    }
    return value;
  }

  assertEnd(label: string): void {
    if (this.remaining !== 0) throw new Error(`Trailing data in ${label}`);
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let i = 0; i < left.byteLength; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

function derLength(length: number): Uint8Array {
  if (length < 0x80) return new Uint8Array([length]);
  if (length < 0x100) return new Uint8Array([0x81, length]);
  if (length < 0x10000) return new Uint8Array([0x82, length >> 8, length & 0xff]);
  if (length < 0x1000000) return new Uint8Array([0x83, length >> 16, (length >> 8) & 0xff, length & 0xff]);
  throw new Error('DER value is too large');
}

function der(tag: number, value: Uint8Array): Uint8Array {
  return concat(new Uint8Array([tag]), derLength(value.byteLength), value);
}

function derInteger(value: Uint8Array): Uint8Array {
  let normalized = value;
  while (normalized.length > 1 && normalized[0] === 0 && (normalized[1] & 0x80) === 0) {
    normalized = normalized.slice(1);
  }
  if ((normalized[0] & 0x80) !== 0) normalized = concat(new Uint8Array([0]), normalized);
  return der(0x02, normalized);
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function bigIntToBytes(value: bigint): Uint8Array {
  if (value === 0n) return new Uint8Array([0]);
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  return new Uint8Array(bytes);
}

function rsaPkcs8(
  nBytes: Uint8Array,
  eBytes: Uint8Array,
  dBytes: Uint8Array,
  pBytes: Uint8Array,
  qBytes: Uint8Array,
  iqmpBytes: Uint8Array,
): Uint8Array {
  const n = bytesToBigInt(nBytes);
  const e = bytesToBigInt(eBytes);
  const d = bytesToBigInt(dBytes);
  const p = bytesToBigInt(pBytes);
  const q = bytesToBigInt(qBytes);
  const iqmp = bytesToBigInt(iqmpBytes);
  if (p <= 2n || q <= 2n || p * q !== n) throw new Error('RSA factors do not match the modulus');
  if (e < 3n || (e & 1n) === 0n || d < 1n) throw new Error('Invalid RSA exponents');
  if ((iqmp * q) % p !== 1n) throw new Error('Invalid RSA CRT coefficient');
  if ((d * e) % (p - 1n) !== 1n || (d * e) % (q - 1n) !== 1n) {
    throw new Error('RSA private exponent does not match the public exponent');
  }

  const pkcs1 = der(0x30, concat(
    derInteger(new Uint8Array([0])),
    derInteger(nBytes),
    derInteger(eBytes),
    derInteger(dBytes),
    derInteger(pBytes),
    derInteger(qBytes),
    derInteger(bigIntToBytes(d % (p - 1n))),
    derInteger(bigIntToBytes(d % (q - 1n))),
    derInteger(iqmpBytes),
  ));
  const rsaOid = new Uint8Array([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]);
  const algorithm = der(0x30, concat(rsaOid, new Uint8Array([0x05, 0x00])));
  return der(0x30, concat(derInteger(new Uint8Array([0])), algorithm, der(0x04, pkcs1)));
}

function ecdsaPkcs8(curve: string, scalar: Uint8Array): Uint8Array {
  const curveOid = curve === 'nistp256'
    ? new Uint8Array([0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07])
    : curve === 'nistp384'
      ? new Uint8Array([0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22])
      : curve === 'nistp521'
        ? new Uint8Array([0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x23])
        : null;
  if (!curveOid) throw new Error(`Unsupported ECDSA curve: ${curve}`);
  const ecPrivate = der(0x30, concat(
    derInteger(new Uint8Array([1])),
    der(0x04, scalar),
    der(0xa0, curveOid),
  ));
  const ecOid = new Uint8Array([0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);
  return der(0x30, concat(
    derInteger(new Uint8Array([0])),
    der(0x30, concat(ecOid, curveOid)),
    der(0x04, ecPrivate),
  ));
}

function pkcs8Pem(bytes: Uint8Array): string {
  const base64 = Buffer.from(bytes).toString('base64');
  const lines = base64.match(/.{1,64}/g)?.join('\n') || '';
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`;
}

function ed25519Pkcs8(seed: Uint8Array): Uint8Array {
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const algorithm = new Uint8Array([0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70]);
  const nestedSeed = der(0x04, seed);
  return der(0x30, concat(version, algorithm, der(0x04, nestedSeed)));
}

class Ed25519KeyPair implements KeyPair {
  readonly keyAlgorithmName = ED25519;
  comment: string | null = null;
  private publicKey?: CryptoKey;
  private privateKey?: CryptoKey;
  private rawPublicKey?: Uint8Array;
  private seed?: Uint8Array;

  get hasPublicKey(): boolean {
    return !!this.publicKey;
  }

  get hasPrivateKey(): boolean {
    return !!this.privateKey;
  }

  async setPublicKeyBytes(keyBytes: Buffer): Promise<void> {
    const reader = new BinaryReader(new Uint8Array(keyBytes));
    if (reader.readText('Ed25519 key type') !== ED25519) throw new Error('Invalid Ed25519 public key');
    const publicKey = reader.readString('Ed25519 public key', 32);
    reader.assertEnd('Ed25519 public key');
    if (publicKey.byteLength !== 32) throw new Error('Invalid Ed25519 public key length');
    await this.importParameters({ publicKey });
  }

  async getPublicKeyBytes(algorithmName = ED25519): Promise<Buffer | null> {
    if (!this.rawPublicKey) return null;
    if (algorithmName !== ED25519) throw new Error(`Invalid Ed25519 algorithm: ${algorithmName}`);
    return Buffer.from(concat(sshString(ED25519), sshString(this.rawPublicKey)));
  }

  async generate(): Promise<void> {
    const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
    this.publicKey = pair.publicKey;
    this.privateKey = pair.privateKey;
    this.rawPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    if (!jwk.d) throw new Error('Generated Ed25519 key has no private seed');
    this.seed = new Uint8Array(Buffer.from(jwk.d, 'base64url'));
  }

  async importParameters(parameters: Ed25519Parameters): Promise<void> {
    if (parameters.publicKey.byteLength !== 32) throw new Error('Invalid Ed25519 public key length');
    this.rawPublicKey = new Uint8Array(parameters.publicKey);
    this.publicKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(this.rawPublicKey),
      { name: 'Ed25519' },
      true,
      ['verify'],
    );
    this.privateKey = undefined;
    this.seed = undefined;
    if (parameters.seed) {
      if (parameters.seed.byteLength !== 32) throw new Error('Invalid Ed25519 private seed length');
      this.seed = new Uint8Array(parameters.seed);
      this.privateKey = await crypto.subtle.importKey(
        'pkcs8',
        toArrayBuffer(ed25519Pkcs8(this.seed)),
        { name: 'Ed25519' },
        true,
        ['sign'],
      );
      const probe = new Uint8Array([0x6f, 0x68, 0x6d, 0x79, 0x73, 0x73, 0x68]);
      const signature = await crypto.subtle.sign('Ed25519', this.privateKey, probe);
      if (!(await crypto.subtle.verify('Ed25519', this.publicKey, signature, probe))) {
        throw new Error('Ed25519 private seed does not match the public key');
      }
    }
  }

  async exportParameters(): Promise<Ed25519Parameters> {
    if (!this.rawPublicKey) throw new Error('Ed25519 public key is not set');
    return {
      publicKey: new Uint8Array(this.rawPublicKey),
      seed: this.seed ? new Uint8Array(this.seed) : undefined,
    };
  }

  signingKey(): CryptoKey {
    if (!this.privateKey) throw new Error('Ed25519 private key is not set');
    return this.privateKey;
  }

  verificationKey(): CryptoKey {
    if (!this.publicKey) throw new Error('Ed25519 public key is not set');
    return this.publicKey;
  }

  dispose(): void {
    this.privateKey = undefined;
    this.publicKey = undefined;
    this.seed?.fill(0);
    this.seed = undefined;
    this.rawPublicKey = undefined;
  }
}

class Ed25519SignerVerifier implements Signer, Verifier {
  readonly digestLength = 64;

  constructor(private readonly keyPair: Ed25519KeyPair) {}

  async sign(data: Buffer): Promise<Buffer> {
    return Buffer.from(
      await crypto.subtle.sign('Ed25519', this.keyPair.signingKey(), Uint8Array.from(data)),
    );
  }

  async verify(data: Buffer, signature: Buffer): Promise<boolean> {
    return crypto.subtle.verify(
      'Ed25519',
      this.keyPair.verificationKey(),
      Uint8Array.from(signature),
      Uint8Array.from(data),
    );
  }

  dispose(): void {}
}

export class Ed25519PublicKeyAlgorithm extends PublicKeyAlgorithm {
  constructor() {
    super(ED25519, ED25519, 'none');
  }

  createKeyPair(): KeyPair {
    return new Ed25519KeyPair();
  }

  async generateKeyPair(): Promise<KeyPair> {
    const keyPair = new Ed25519KeyPair();
    await keyPair.generate();
    return keyPair;
  }

  createSigner(keyPair: KeyPair): Signer {
    if (!(keyPair instanceof Ed25519KeyPair)) throw new TypeError('Ed25519 key pair expected');
    return new Ed25519SignerVerifier(keyPair);
  }

  createVerifier(keyPair: KeyPair): Verifier {
    if (!(keyPair instanceof Ed25519KeyPair)) throw new TypeError('Ed25519 key pair expected');
    return new Ed25519SignerVerifier(keyPair);
  }
}

export const ed25519PublicKeyAlgorithm = new Ed25519PublicKeyAlgorithm();

function validatePrivateTail(reader: BinaryReader): void {
  reader.readString('private key comment', 16 * 1024);
  const paddingLength = reader.remaining;
  if (paddingLength > 7) throw new Error('Malformed OpenSSH private key padding');
  for (let i = 1; i <= paddingLength; i++) {
    const value = reader.read(1, 'private key padding')[0];
    if (value !== i) throw new Error('Malformed OpenSSH private key padding');
  }
}

function parsePublicBlob(blob: Uint8Array): { type: string; fields: Uint8Array[] } {
  const reader = new BinaryReader(blob);
  const type = reader.readText('public key type');
  const fields: Uint8Array[] = [];
  while (reader.remaining) fields.push(reader.readString('public key field', 128 * 1024));
  return { type, fields };
}

async function parseOpenSshPrivateKey(pem: string): Promise<KeyPair> {
  const escapedBegin = OPENSSH_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = OPENSSH_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escapedBegin}\\r?\\n([A-Za-z0-9+/=\\r\\n]+)\\r?\\n${escapedEnd}$`, 'u').exec(pem.trim());
  if (!match) throw new Error('Malformed OpenSSH private key');
  const encoded = match[1].replace(/\s/g, '');
  const raw = new Uint8Array(Buffer.from(encoded, 'base64'));
  if (Buffer.from(raw).toString('base64') !== encoded) throw new Error('Malformed OpenSSH private key Base64');
  const magic = new TextEncoder().encode('openssh-key-v1\0');
  if (!equalBytes(raw.slice(0, magic.length), magic)) throw new Error('Unsupported OpenSSH private key container');
  const reader = new BinaryReader(raw.slice(magic.length));
  const cipher = reader.readText('cipher name');
  const kdf = reader.readText('KDF name');
  const kdfOptions = reader.readString('KDF options', 128 * 1024);
  if (cipher !== 'none' || kdf !== 'none' || kdfOptions.length !== 0) {
    throw new Error('Encrypted OpenSSH private keys are not supported in-browser; use an encrypted PKCS#8 PEM key');
  }
  if (reader.readUInt32('key count') !== 1) throw new Error('Only one key per OpenSSH file is supported');
  const outerPublicBlob = reader.readString('public key', 128 * 1024);
  const privateReader = new BinaryReader(reader.readString('private key section', 256 * 1024));
  reader.assertEnd('OpenSSH key container');
  const check1 = privateReader.readUInt32('check integer');
  const check2 = privateReader.readUInt32('check integer');
  if (check1 !== check2) throw new Error('OpenSSH private key check integers do not match');
  const keyType = privateReader.readText('private key type');
  const outer = parsePublicBlob(outerPublicBlob);
  if (outer.type !== keyType) throw new Error('OpenSSH public and private key types do not match');

  if (keyType === ED25519) {
    const publicKey = privateReader.readString('Ed25519 public key', 32);
    const privateKey = privateReader.readString('Ed25519 private key', 64);
    if (publicKey.length !== 32 || privateKey.length !== 64) throw new Error('Invalid Ed25519 key length');
    if (!equalBytes(privateKey.slice(32), publicKey) || outer.fields.length !== 1 || !equalBytes(outer.fields[0], publicKey)) {
      throw new Error('Ed25519 public key does not match its private key');
    }
    validatePrivateTail(privateReader);
    const keyPair = new Ed25519KeyPair();
    await keyPair.importParameters({ publicKey, seed: privateKey.slice(0, 32) });
    return keyPair;
  }

  if (keyType === 'ssh-rsa') {
    const n = privateReader.readPositiveMpint('RSA modulus');
    const e = privateReader.readPositiveMpint('RSA public exponent');
    const d = privateReader.readPositiveMpint('RSA private exponent');
    const iqmp = privateReader.readPositiveMpint('RSA CRT coefficient');
    const p = privateReader.readPositiveMpint('RSA prime p');
    const q = privateReader.readPositiveMpint('RSA prime q');
    if (outer.fields.length !== 2 || !equalBytes(outer.fields[0], e) || !equalBytes(outer.fields[1].at(0) === 0 ? outer.fields[1].slice(1) : outer.fields[1], n)) {
      throw new Error('RSA public key does not match its private key');
    }
    validatePrivateTail(privateReader);
    return importKey(pkcs8Pem(rsaPkcs8(n, e, d, p, q, iqmp)));
  }

  if (keyType.startsWith('ecdsa-sha2-')) {
    const curve = privateReader.readText('ECDSA curve');
    const point = privateReader.readString('ECDSA public point', 1024);
    let scalar = privateReader.readPositiveMpint('ECDSA private scalar');
    const coordinateBytes = curve === 'nistp256' ? 32 : curve === 'nistp384' ? 48 : curve === 'nistp521' ? 66 : 0;
    if (!coordinateBytes || keyType !== `ecdsa-sha2-${curve}` || scalar.length > coordinateBytes) {
      throw new Error(`Unsupported or malformed ECDSA key: ${keyType}`);
    }
    if (
      point.length !== coordinateBytes * 2 + 1 ||
      point[0] !== 4 ||
      outer.fields.length !== 2 ||
      new TextDecoder().decode(outer.fields[0]) !== curve ||
      !equalBytes(outer.fields[1], point)
    ) {
      throw new Error('ECDSA public key does not match its private key');
    }
    validatePrivateTail(privateReader);
    if (scalar.length < coordinateBytes) scalar = concat(new Uint8Array(coordinateBytes - scalar.length), scalar);
    return importKey(pkcs8Pem(ecdsaPkcs8(curve, scalar)));
  }

  throw new Error(`Unsupported OpenSSH private key type: ${keyType}`);
}

/** Import RSA/ECDSA PEM keys plus unencrypted OpenSSH Ed25519/RSA/ECDSA keys. */
export async function importClientPrivateKey(pem: string, passphrase?: string): Promise<KeyPair> {
  const normalized = pem.trim();
  if (!normalized) throw new Error('Private key is empty');
  if (normalized.startsWith(OPENSSH_BEGIN)) {
    if (passphrase) {
      throw new Error('Encrypted OpenSSH keys are not supported; use encrypted PKCS#8 PEM instead');
    }
    return parseOpenSshPrivateKey(normalized);
  }
  try {
    const key = await importKey(normalized, passphrase || null);
    if (!key.hasPrivateKey) throw new Error('The supplied key has no private component');
    return key;
  } catch (error) {
    throw new Error(`Unable to import private key: ${error instanceof Error ? error.message : String(error)}`);
  }
}
