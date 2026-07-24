import { describe, it, expect } from 'vitest';
import { parseProxyJumpString, buildProxyChain, type JumpHostConfig } from '../proxyjump';

describe('ProxyJump 跳板机代理解析测试', () => {
  it('应该能够成功解析单跳板机字符串', () => {
    const jumps = parseProxyJumpString('admin@hk.gateway.io:2222');
    expect(jumps.length).toBe(1);
    expect(jumps[0].username).toBe('admin');
    expect(jumps[0].host).toBe('hk.gateway.io');
    expect(jumps[0].port).toBe(2222);
  });

  it('应该能够成功解析多级级联 ProxyJump 字符串', () => {
    const jumps = parseProxyJumpString('bastion1@10.0.0.1:22, bastion2@10.0.0.2:2222');
    expect(jumps.length).toBe(2);
    expect(jumps[0].username).toBe('bastion1');
    expect(jumps[0].host).toBe('10.0.0.1');

    expect(jumps[1].username).toBe('bastion2');
    expect(jumps[1].host).toBe('10.0.0.2');
    expect(jumps[1].port).toBe(2222);
  });

  it('buildProxyChain 应该正确合并目标主机与跳板链条', () => {
    const target: JumpHostConfig = {
      host: '192.168.1.100',
      port: 22,
      username: 'root',
      authType: 'password',
    };

    const chain = buildProxyChain(target, 'jump@gateway.org:222');
    expect(chain.target.host).toBe('192.168.1.100');
    expect(chain.jumpHosts.length).toBe(1);
    expect(chain.jumpHosts[0].host).toBe('gateway.org');
  });
});
