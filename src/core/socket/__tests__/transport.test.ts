import { describe, it, expect } from 'vitest';
import { DirectSocketsTransport, MockSocketTransport, WebSocketRelayTransport } from '../transport';

describe('SocketTransport 抽象网络层单元测试', () => {
  it('DirectSocketsTransport 探针功能应在标准 Node/Vitest 环境返回 directTcp: false', async () => {
    const transport = new DirectSocketsTransport();
    const caps = await transport.probe();
    expect(caps.directTcp).toBe(false);
  });

  it('DirectSocketsTransport 在无 TCPSocket 时 connect 应抛出友好错误提示', async () => {
    const transport = new DirectSocketsTransport();
    await expect(transport.connect('127.0.0.1', 22)).rejects.toThrow(
      '当前浏览器环境不支持 Chromium Direct Sockets'
    );
  });

  it('WebSocketRelayTransport 能够正确初始化代理 URL 与识别名称', async () => {
    const transport = new WebSocketRelayTransport('wss://custom.relay/ssh');
    expect(transport.name).toBe('WebSocket Relay');
    const caps = await transport.probe();
    expect(caps.directTcp).toBe(false);
  });

  it('MockSocketTransport 应该支持模拟终端连接与接收欢迎横幅及指令交互', async () => {
    const mock = new MockSocketTransport();
    const caps = await mock.probe();
    expect(caps.directTcp).toBe(true);

    const stream = await mock.connect('demo.server', 22);
    expect(stream.readable).toBeDefined();
    expect(stream.writable).toBeDefined();

    const reader = stream.readable.getReader();
    const writer = stream.writable.getWriter();

    // 读取欢迎横幅首块
    const { value } = await reader.read();
    expect(value).toBeDefined();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('===');

    // 发送 uname 命令
    const encoder = new TextEncoder();
    await writer.write(encoder.encode('uname\r\n'));

    // 释放资源
    reader.releaseLock();
    writer.releaseLock();
    await stream.close();
  });
});
