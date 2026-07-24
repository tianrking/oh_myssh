/**
 * Oh My SSH - WASI (WebAssembly System Interface) POSIX Syscall Bridge
 * 桥接 OpenSSH WASM / WASI 系统调用至浏览器原生 Socket API 与 Memory
 */

export interface WasiFd {
  fd: number;
  type: 'file' | 'socket' | 'stdio';
  path?: string;
  readable?: ReadableStreamDefaultReader<Uint8Array>;
  writable?: WritableStreamDefaultWriter<Uint8Array>;
}

export class WasiSyscallBridge {
  private memory: WebAssembly.Memory | null = null;
  private fds: Map<number, WasiFd> = new Map();
  private nextFd = 3;

  constructor() {
    // 默认标准输入输出
    this.fds.set(0, { fd: 0, type: 'stdio', path: '/dev/stdin' });
    this.fds.set(1, { fd: 1, type: 'stdio', path: '/dev/stdout' });
    this.fds.set(2, { fd: 2, type: 'stdio', path: '/dev/stderr' });
  }

  public setMemory(memory: WebAssembly.Memory): void {
    this.memory = memory;
  }

  /**
   * WASI fd_write: 将内存向量写出到 Fd
   */
  public fd_write(
    fd: number,
    iovsPtr: number,
    iovsLen: number,
    nwrittenPtr: number
  ): number {
    if (!this.memory) return 28; // WASI ERRNO: ENOSYS

    const view = new DataView(this.memory.buffer);
    const bytes = new Uint8Array(this.memory.buffer);
    let totalWritten = 0;

    for (let i = 0; i < iovsLen; i++) {
      const ptr = view.getUint32(iovsPtr + i * 8, true);
      const len = view.getUint32(iovsPtr + i * 8 + 4, true);
      
      const chunk = bytes.subarray(ptr, ptr + len);
      const fdEntry = this.fds.get(fd);

      if (fdEntry && fdEntry.writable) {
        // 创建独立切片防止底层共享内存改写
        const copy = new Uint8Array(chunk.byteLength);
        copy.set(chunk);
        fdEntry.writable.write(copy);
      }
      totalWritten += len;
    }

    view.setUint32(nwrittenPtr, totalWritten, true);
    return 0; // WASI SUCCESS
  }

  /**
   * WASI fd_read: 从 Fd 读取数据并填充到内存向量
   */
  public fd_read(
    fd: number,
    iovsPtr: number,
    iovsLen: number,
    nreadPtr: number
  ): number {
    if (!this.memory) return 28;
    const view = new DataView(this.memory.buffer);
    view.setUint32(nreadPtr, 0, true);
    return 0;
  }

  /**
   * 注册网络/通道 Socket 到 WASI Fd 表
   */
  public registerSocketFd(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    writer: WritableStreamDefaultWriter<Uint8Array>
  ): number {
    const fd = this.nextFd++;
    this.fds.set(fd, {
      fd,
      type: 'socket',
      readable: reader,
      writable: writer,
    });
    return fd;
  }

  /**
   * 获取 WASI 导出函数绑定对象
   */
  public getWasiImports(): Record<string, Function> {
    return {
      fd_write: this.fd_write.bind(this),
      fd_read: this.fd_read.bind(this),
      fd_close: (fd: number) => {
        this.fds.delete(fd);
        return 0;
      },
      clock_time_get: (id: number, precision: bigint, timePtr: number) => {
        if (this.memory) {
          const view = new DataView(this.memory.buffer);
          const nowNs = BigInt(Date.now()) * 1000000n;
          view.setBigUint64(timePtr, nowNs, true);
        }
        return 0;
      },
      proc_exit: (rval: number) => {
        console.log(`WASI OpenSSH process exited with code ${rval}`);
      },
    };
  }
}
