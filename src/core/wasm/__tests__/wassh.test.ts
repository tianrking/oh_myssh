import { describe, it, expect } from 'vitest';
import { WasiSyscallBridge } from '../wassh';

describe('WasiSyscallBridge - OpenSSH WASI 桥接单元测试', () => {
  it('应该能够成功绑定内存并执行 fd_write 写入向量数据', async () => {
    const bridge = new WasiSyscallBridge();
    const memory = new WebAssembly.Memory({ initial: 1 });
    bridge.setMemory(memory);

    const writtenChunks: Uint8Array[] = [];
    const dummyWriter = {
      write: async (chunk: Uint8Array) => {
        writtenChunks.push(chunk);
      },
    } as any;

    const fd = bridge.registerSocketFd({} as any, dummyWriter);
    expect(fd).toBeGreaterThanOrEqual(3);

    // 在 Memory 中放置测试字符 "WASI OpenSSH Test"
    const view = new DataView(memory.buffer);
    const bytes = new Uint8Array(memory.buffer);
    const text = new TextEncoder().encode('WASI OpenSSH Test');
    bytes.set(text, 100);

    // 构建 iovs [ptr=100, len=text.byteLength]
    view.setUint32(0, 100, true);
    view.setUint32(4, text.byteLength, true);

    const ret = bridge.fd_write(fd, 0, 1, 50);
    expect(ret).toBe(0);
    expect(writtenChunks.length).toBe(1);
    expect(new TextDecoder().decode(writtenChunks[0])).toBe('WASI OpenSSH Test');
  });

  it('应该正确提供 WASI clock_time_get 时钟纳秒接口', () => {
    const bridge = new WasiSyscallBridge();
    const memory = new WebAssembly.Memory({ initial: 1 });
    bridge.setMemory(memory);

    const imports = bridge.getWasiImports();
    const ret = imports.clock_time_get(0, 0n, 10);
    expect(ret).toBe(0);

    const view = new DataView(memory.buffer);
    const timeNs = view.getBigUint64(10, true);
    expect(timeNs).toBeGreaterThan(0n);
  });
});
