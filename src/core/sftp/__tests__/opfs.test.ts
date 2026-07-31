import { describe, expect, it } from 'vitest';
import {
  OPFSEngine,
  OPFSError,
  OPFSUnavailableError,
  type OpfsStorageProvider,
} from '../opfs';

type StoredFile = {
  bytes: Uint8Array;
  lastModified: number;
};

function notFound(name: string): Error {
  return Object.assign(new Error(`File not found: ${name}`), { name: 'NotFoundError' });
}

function createFakeStorage(
  initial: Record<string, Uint8Array> = {},
  options: { failWrite?: boolean } = {},
) {
  const files = new Map<string, StoredFile>(
    Object.entries(initial).map(([name, bytes]) => [
      name,
      { bytes: bytes.slice(), lastModified: Date.now() },
    ]),
  );
  const state = { aborted: false };

  const fileHandle = (name: string) => ({
    kind: 'file' as const,
    name,
    async getFile() {
      const stored = files.get(name);
      if (!stored) throw notFound(name);
      const snapshot = stored.bytes.slice();
      const blob = new Blob([snapshot]);
      return {
        size: snapshot.byteLength,
        lastModified: stored.lastModified,
        stream: () => blob.stream(),
      } as File;
    },
    async createWritable() {
      const chunks: Uint8Array[] = [];
      return {
        async write(value: Uint8Array) {
          if (options.failWrite) throw new Error('simulated disk failure');
          chunks.push(value.slice());
        },
        async close() {
          const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          files.set(name, { bytes, lastModified: Date.now() });
        },
        async abort() {
          state.aborted = true;
        },
      } as unknown as FileSystemWritableFileStream;
    },
  });

  const root = {
    kind: 'directory' as const,
    name: '',
    async getFileHandle(name: string, createOptions?: { create?: boolean }) {
      if (!files.has(name) && !createOptions?.create) throw notFound(name);
      if (!files.has(name)) {
        files.set(name, { bytes: new Uint8Array(), lastModified: Date.now() });
      }
      return fileHandle(name) as unknown as FileSystemFileHandle;
    },
    async getDirectoryHandle(name: string) {
      throw notFound(name);
    },
    async removeEntry(name: string) {
      files.delete(name);
    },
    async *entries() {
      for (const name of files.keys()) {
        yield [name, fileHandle(name)] as const;
      }
    },
  } as unknown as FileSystemDirectoryHandle;

  const storage: OpfsStorageProvider = {
    async getDirectory() {
      return root;
    },
  };
  return { storage, files, state };
}

function oneChunk(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

describe('OPFSEngine fail-closed streaming semantics', () => {
  it('streams a file to OPFS and reports committed byte progress', async () => {
    const { storage, files } = createFakeStorage();
    const engine = new OPFSEngine(storage);
    const first = new TextEncoder().encode('stream ');
    const second = new TextEncoder().encode('payload');
    const progress: number[] = [];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(first);
        controller.enqueue(second);
        controller.close();
      },
    });

    const written = await engine.writeStreamToFile('test.bin', stream, (bytes) => {
      progress.push(bytes);
    });

    expect(written).toBe(first.byteLength + second.byteLength);
    expect(progress).toEqual([first.byteLength, first.byteLength + second.byteLength]);
    expect(new TextDecoder().decode(files.get('test.bin')?.bytes)).toBe('stream payload');
    await expect(engine.statFile('test.bin')).resolves.toMatchObject({
      name: 'test.bin',
      size: written,
    });
  });

  it('rejects every storage operation when OPFS is unavailable', async () => {
    const engine = new OPFSEngine(null);

    await expect(engine.listDirectory()).rejects.toBeInstanceOf(OPFSUnavailableError);
    await expect(engine.readStreamFromFile('missing.bin')).rejects.toBeInstanceOf(
      OPFSUnavailableError,
    );
    await expect(
      engine.writeStreamToFile('missing.bin', oneChunk(new Uint8Array([1]))),
    ).rejects.toBeInstanceOf(OPFSUnavailableError);
  });

  it('rejects a missing local file instead of returning an empty stream', async () => {
    const { storage } = createFakeStorage();
    const engine = new OPFSEngine(storage);

    await expect(engine.readStreamFromFile('missing.bin')).rejects.toMatchObject({
      name: 'OPFSError',
      message: 'Unable to read local file: missing.bin',
    });
  });

  it('aborts the OPFS write and cancels its source stream on persistence failure', async () => {
    const { storage, files, state } = createFakeStorage({}, { failWrite: true });
    const engine = new OPFSEngine(storage);
    let sourceCancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
      },
      cancel() {
        sourceCancelled = true;
      },
    });

    await expect(engine.writeStreamToFile('broken.bin', stream)).rejects.toEqual(
      expect.objectContaining<Partial<OPFSError>>({
        name: 'OPFSError',
        message: 'Failed to write local file: broken.bin',
      }),
    );
    expect(state.aborted).toBe(true);
    expect(sourceCancelled).toBe(true);
    expect(files.has('broken.bin')).toBe(false);
  });
});
