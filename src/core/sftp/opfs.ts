/**
 * Oh My SSH - OPFS (Origin Private File System) stream engine
 * Local pane backing store for dual-pane SFTP offline workspace.
 */

export type OpfsListEntry = {
  name: string;
  isDir: boolean;
  size: number;
  updatedAt: number;
};

export class OPFSEngine {
  private isSupported: boolean;

  constructor() {
    this.isSupported =
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      typeof navigator.storage?.getDirectory === 'function';
  }

  public get supported(): boolean {
    return this.isSupported;
  }

  public async writeStreamToFile(
    filename: string,
    stream: ReadableStream<Uint8Array>,
    onProgress?: (bytesWritten: number) => void
  ): Promise<number> {
    let totalWritten = 0;

    if (this.isSupported) {
      try {
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        const reader = stream.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            // Copy into a plain ArrayBuffer-backed view for FileSystemWritableFileStream
            const copy = new Uint8Array(value.byteLength);
            copy.set(value);
            await writable.write(copy);
            totalWritten += value.byteLength;
            onProgress?.(totalWritten);
          }
        }
        await writable.close();
        return totalWritten;
      } catch (e) {
        console.warn('OPFS write failed, falling back to memory drain', e);
      }
    }

    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalWritten += value.byteLength;
        onProgress?.(totalWritten);
      }
    }
    return totalWritten;
  }

  public async readStreamFromFile(filename: string): Promise<ReadableStream<Uint8Array>> {
    if (this.isSupported) {
      try {
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(filename);
        const file = await fileHandle.getFile();
        if (typeof file.stream === 'function') {
          return file.stream();
        }
      } catch (e) {
        console.warn('OPFS read failed', e);
      }
    }

    return new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.close();
      },
    });
  }

  /** List entries under OPFS root (or nested relative path). */
  public async listDirectory(relativePath = ''): Promise<OpfsListEntry[]> {
    if (!this.isSupported) return [];

    try {
      const root = await navigator.storage.getDirectory();
      let dir: FileSystemDirectoryHandle = root;
      const parts = relativePath.split('/').filter(Boolean);
      for (const part of parts) {
        dir = await dir.getDirectoryHandle(part);
      }

      const entries: OpfsListEntry[] = [];
      // @ts-expect-error async iterator on directory handle
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'directory') {
          entries.push({ name, isDir: true, size: 0, updatedAt: Date.now() });
        } else {
          try {
            const file = await handle.getFile();
            entries.push({
              name,
              isDir: false,
              size: file.size,
              updatedAt: file.lastModified,
            });
          } catch {
            entries.push({ name, isDir: false, size: 0, updatedAt: Date.now() });
          }
        }
      }
      return entries.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    } catch (e) {
      console.warn('OPFS list failed', e);
      return [];
    }
  }

  public async writeTextFile(filename: string, content: string): Promise<void> {
    const bytes = new TextEncoder().encode(content);
    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(bytes);
        ctrl.close();
      },
    });
    await this.writeStreamToFile(filename, stream);
  }

  public async ensureDemoFiles(): Promise<void> {
    if (!this.isSupported) return;
    try {
      const existing = await this.listDirectory();
      if (existing.length > 0) return;
      await this.writeTextFile('release_notes.txt', 'Oh My SSH offline workspace\n');
      await this.writeTextFile('deploy.sh', '#!/bin/bash\necho deploy\n');
    } catch {
      /* ignore */
    }
  }
}

export const opfsEngine = new OPFSEngine();
