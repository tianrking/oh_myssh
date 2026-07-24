/**
 * Oh My SSH - ProxyJump Jump Host Chain Resolver
 * 解析 SSH 代理跳板机链条 (ProxyJump)，实现 Bastion 跳板机代理转发配置
 */

export interface JumpHostConfig {
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'privateKey';
  password?: string;
  privateKey?: string;
}

export interface ProxyJumpChain {
  target: JumpHostConfig;
  jumpHosts: JumpHostConfig[];
}

/**
 * 解析如 "user1@jump1:2222,user2@jump2:22" 格式的 ProxyJump 字符串
 */
export function parseProxyJumpString(proxyJumpStr: string): JumpHostConfig[] {
  if (!proxyJumpStr || !proxyJumpStr.trim()) return [];

  const parts = proxyJumpStr.split(',').map((p) => p.trim()).filter(Boolean);
  const result: JumpHostConfig[] = [];

  for (const part of parts) {
    let username = 'root';
    let host = '127.0.0.1';
    let port = 22;
    let remaining = part;

    if (remaining.includes('@')) {
      const userParts = remaining.split('@');
      username = userParts[0];
      remaining = userParts[1];
    }

    if (remaining.includes(':')) {
      const hostParts = remaining.split(':');
      host = hostParts[0];
      port = parseInt(hostParts[1], 10) || 22;
    } else {
      host = remaining;
    }

    result.push({
      host,
      port,
      username,
      authType: 'password',
    });
  }

  return result;
}

/**
 * 构建完整的跳板机代理链路
 */
export function buildProxyChain(
  targetHost: JumpHostConfig,
  proxyJumpStr?: string
): ProxyJumpChain {
  const jumpHosts = proxyJumpStr ? parseProxyJumpString(proxyJumpStr) : [];
  return {
    target: targetHost,
    jumpHosts,
  };
}
