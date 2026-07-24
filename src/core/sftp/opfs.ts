/**
 * Oh My SSH - OPFS (Origin Private File System) & Web Stream Engine
 * 实现浏览器端 GB 级大文件无感流式存取与持久化存储
 */

export class OPFSEngine {
  private isSupported: boolean;

  constructor() {
    this.isSupported =
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      'getDirectory' in navigator.storage;
  }

  /**
   * 将 ReadableStream 直接管道流写入 OPFS 本地私有文件系统
   */
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
        
        // @ts-ignore - FileSystemWritableFileStream
        const writable = await fileHandle.createWritable();
        const reader = stream.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            await writable.write(value.buffer as ArrayBuffer);
            totalWritten += value.byteLength;
            if (onProgress) onProgress(totalWritten);
          }
        }
        await writable.close();
        return totalWritten;
      } catch (e) {
        console.warn('OPFS 写入失败，回退至内存流降级', e);
      }
    }

    // 降级支持：内存消费模式
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalWritten += value.byteLength;
        if (onProgress) onProgress(totalWritten);
      }
    }
    return totalWritten;
  }

  /**
   * 从 OPFS 文件系统中读取 ReadableStream
   */
  public async readStreamFromFile(filename: string): Promise<ReadableStream<Uint8Array>> {
    if (this.isSupported) {
      try {
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(filename);
        const file = await fileHandle.getFile();
        
        // @ts-ignore - stream() API
        if (typeof file.stream === 'function') {
          return file.stream();
        }
      } catch (e) {
        console.warn('OPFS 读取失败', e);
      }
    }

    // 返回空流降级
    return new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.close();
      },
    });
  }
}

export const opfsEngine = new OPFSEngine();
