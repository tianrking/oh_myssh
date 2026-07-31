/**
 * Origin Private File System storage used by the local SFTP pane.
 *
 * Every public operation is fail-closed: unsupported browsers, missing files,
 * permission failures, and write failures reject instead of draining or
 * returning placeholder data that could be mistaken for a successful transfer.
 */

export type OpfsListEntry = {
  name: string;
  isDir: boolean;
  size: number;
  updatedAt: number;
};

export type OpfsFileInfo = {
  name: string;
  size: number;
  updatedAt: number;
};

export type OpfsReadableFile = OpfsFileInfo & {
  stream: ReadableStream<Uint8Array>;
};

export interface OpfsStorageProvider {
  getDirectory(): Promise<FileSystemDirectoryHandle>;
}

export class OPFSError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'OPFSError';
  }
}

export class OPFSUnavailableError extends OPFSError {
  constructor() {
    super('Origin Private File System is not supported in this browser');
    this.name = 'OPFSUnavailableError';
  }
}

function asOpfsError(message: string, cause: unknown): OPFSError {
  return cause instanceof OPFSError ? cause : new OPFSError(message, { cause });
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'NotFoundError';
}

export class OPFSEngine {
  constructor(private readonly storageOverride?: OpfsStorageProvider | null) {}

  private storageProvider(): OpfsStorageProvider | null {
    if (this.storageOverride !== undefined) return this.storageOverride;
    if (
      typeof navigator === 'undefined' ||
      !('storage' in navigator) ||
      typeof navigator.storage?.getDirectory !== 'function'
    ) {
      return null;
    }
    return navigator.storage;
  }

  public get supported(): boolean {
    return this.storageProvider() !== null;
  }

  private async rootDirectory(): Promise<FileSystemDirectoryHandle> {
    const storage = this.storageProvider();
    if (!storage) throw new OPFSUnavailableError();
    try {
      return await storage.getDirectory();
    } catch (cause) {
      throw asOpfsError('Unable to access Origin Private File System', cause);
    }
  }

  private async fileSnapshot(filename: string): Promise<File> {
    const root = await this.rootDirectory();
    try {
      const handle = await root.getFileHandle(filename);
      return await handle.getFile();
    } catch (cause) {
      throw asOpfsError(`Unable to read local file: ${filename}`, cause);
    }
  }

  public async statFile(filename: string): Promise<OpfsFileInfo> {
    const file = await this.fileSnapshot(filename);
    return { name: filename, size: file.size, updatedAt: file.lastModified };
  }

  public async openFileForReading(filename: string): Promise<OpfsReadableFile> {
    const file = await this.fileSnapshot(filename);
    if (typeof file.stream !== 'function') {
      throw new OPFSError(`Streaming reads are unavailable for local file: ${filename}`);
    }
    return {
      name: filename,
      size: file.size,
      updatedAt: file.lastModified,
      stream: file.stream() as ReadableStream<Uint8Array>,
    };
  }

  public async writeStreamToFile(
    filename: string,
    stream: ReadableStream<Uint8Array>,
    onProgress?: (bytesWritten: number) => void,
  ): Promise<number> {
    const root = await this.rootDirectory();
    let writable: FileSystemWritableFileStream;
    let createdFile = false;
    try {
      let fileHandle: FileSystemFileHandle;
      try {
        fileHandle = await root.getFileHandle(filename);
      } catch (cause) {
        if (!isNotFoundError(cause)) throw cause;
        fileHandle = await root.getFileHandle(filename, { create: true });
        createdFile = true;
      }
      writable = await fileHandle.createWritable();
    } catch (cause) {
      if (createdFile) await root.removeEntry(filename).catch(() => undefined);
      throw asOpfsError(`Unable to open local file for writing: ${filename}`, cause);
    }

    const reader = stream.getReader();
    let totalWritten = 0;
    let committed = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;

        // Do not pass a view backed by a larger SSH packet buffer to OPFS.
        const copy = new Uint8Array(value.byteLength);
        copy.set(value);
        await writable.write(copy);
        totalWritten += copy.byteLength;
        onProgress?.(totalWritten);
      }
      await writable.close();
      committed = true;
      return totalWritten;
    } catch (cause) {
      // Cancelling propagates to SftpClient.readFileStream(), which closes the
      // remote handle instead of continuing to download bytes we cannot save.
      await reader.cancel(cause).catch(() => undefined);
      if (!committed) await writable.abort(cause).catch(() => undefined);
      if (createdFile) await root.removeEntry(filename).catch(() => undefined);
      throw asOpfsError(`Failed to write local file: ${filename}`, cause);
    } finally {
      reader.releaseLock();
    }
  }

  public async readStreamFromFile(filename: string): Promise<ReadableStream<Uint8Array>> {
    return (await this.openFileForReading(filename)).stream;
  }

  /** List entries under the OPFS root (or a nested relative path). */
  public async listDirectory(relativePath = ''): Promise<OpfsListEntry[]> {
    const root = await this.rootDirectory();
    try {
      let directory: FileSystemDirectoryHandle = root;
      const parts = relativePath.split('/').filter(Boolean);
      for (const part of parts) {
        directory = await directory.getDirectoryHandle(part);
      }

      const entries: OpfsListEntry[] = [];
      // @ts-expect-error FileSystemDirectoryHandle async iteration is supported by Chromium.
      for await (const [name, handle] of directory.entries()) {
        if (handle.kind === 'directory') {
          entries.push({ name, isDir: true, size: 0, updatedAt: 0 });
          continue;
        }
        try {
          const file = await handle.getFile();
          entries.push({
            name,
            isDir: false,
            size: file.size,
            updatedAt: file.lastModified,
          });
        } catch (cause) {
          throw asOpfsError(`Unable to read local file metadata: ${name}`, cause);
        }
      }
      return entries.sort((left, right) => {
        if (left.isDir !== right.isDir) return left.isDir ? -1 : 1;
        return left.name.localeCompare(right.name);
      });
    } catch (cause) {
      throw asOpfsError(`Unable to list local directory: ${relativePath || '/'}`, cause);
    }
  }

  public async writeTextFile(filename: string, content: string): Promise<void> {
    const bytes = new TextEncoder().encode(content);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    await this.writeStreamToFile(filename, stream);
  }

  public async ensureDemoFiles(): Promise<void> {
    const existing = await this.listDirectory();
    if (existing.length > 0) return;
    await this.writeTextFile('release_notes.txt', 'Oh My SSH offline workspace\n');
    await this.writeTextFile('deploy.sh', '#!/bin/bash\necho deploy\n');
  }
}

export const opfsEngine = new OPFSEngine();
