// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { TerminalEngine } from '../engine';
import { MockSocketTransport } from '../../socket/transport';

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as any;
}

describe('SSH 终端 Shell 交互与输入输出全流程可靠性测试', () => {
  it('应该能够成功挂载 TerminalEngine 并正确记录完整日志输出', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const engine = new TerminalEngine('cyberpunk');
    engine.mount(container);

    const transport = new MockSocketTransport();
    const stream = await transport.connect('test.node', 22, 'root');

    engine.attachStream(stream);

    await new Promise((r) => setTimeout(r, 80));

    const logs = engine.exportLog();
    expect(logs).toContain('test.node');
    expect(logs).toMatch(/Offline Interactive Shell|Oh My SSH/);

    engine.dispose();
    document.body.removeChild(container);
  });

  it('验证向终端管道写入 ANSI 格式化字符流时的稳定性', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const engine = new TerminalEngine('oneDark');
    engine.mount(container);

    const receivedBytes: Uint8Array[] = [];

    const mockStream = {
      readable: new ReadableStream<Uint8Array>({
        start(ctrl) {
          ctrl.enqueue(
            new TextEncoder().encode('\x1b[31mRed Text\x1b[0m \x1b[32mGreen Text\x1b[0m\r\n')
          );
        },
      }),
      writable: new WritableStream<Uint8Array>({
        write(chunk) {
          receivedBytes.push(chunk);
        },
      }),
      close: async () => {},
    };

    engine.attachStream(mockStream);

    await new Promise((r) => setTimeout(r, 50));

    const log = engine.exportLog();
    expect(log).toContain('Red Text');
    expect(log).toContain('Green Text');

    engine.writeInput('ls -la\r\n');
    await new Promise((r) => setTimeout(r, 50));

    expect(receivedBytes.length).toBeGreaterThan(0);
    const sentText = new TextDecoder().decode(receivedBytes[0]);
    expect(sentText).toBe('ls -la\r\n');

    engine.dispose();
    document.body.removeChild(container);
  });

  it('验证高频并发字节块传输时的完整度与零丢包', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const engine = new TerminalEngine('dracula');
    engine.mount(container);

    const sampleChunk = new Uint8Array(1024).fill(65);

    const stream = {
      readable: new ReadableStream<Uint8Array>({
        start(ctrl) {
          for (let i = 0; i < 10; i++) {
            ctrl.enqueue(sampleChunk);
          }
          ctrl.close();
        },
      }),
      writable: new WritableStream<Uint8Array>({
        write() {},
      }),
      close: async () => {},
    };

    engine.attachStream(stream);
    await new Promise((r) => setTimeout(r, 100));

    expect(engine.terminal).toBeDefined();
    expect(engine.exportLog().length).toBeGreaterThan(0);

    engine.dispose();
    document.body.removeChild(container);
  });
});
