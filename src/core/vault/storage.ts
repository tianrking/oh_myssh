import Dexie, { type Table } from 'dexie';

export interface HostProfile {
  id?: number;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'privateKey' | 'agent';
  password?: string;
  privateKey?: string;
  passphrase?: string;
  group?: string;
  tags: string[];
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export interface QuickSnippet {
  id?: number;
  title: string;
  command: string;
  category?: string;
}

export interface SavedLayout {
  id?: number;
  name: string;
  tabsJson: string;
  updatedAt: number;
}

export class OhMySSHDatabase extends Dexie {
  hosts!: Table<HostProfile>;
  snippets!: Table<QuickSnippet>;
  layouts!: Table<SavedLayout>;

  constructor() {
    super('OhMySSH_Database');
    this.version(1).stores({
      hosts: '++id, name, host, group, *tags, updatedAt',
      snippets: '++id, title, category',
      layouts: '++id, name, updatedAt',
    });
  }
}

export const db = new OhMySSHDatabase();

/**
 * 演示用预设主机列表 (首次加载为空时初始化)
 */
export async function seedInitialDataIfNeeded() {
  const count = await db.hosts.count();
  if (count === 0) {
    await db.hosts.bulkAdd([
      {
        name: '生产主服务器 (US-West)',
        host: '192.168.1.100',
        port: 22,
        username: 'root',
        authType: 'password',
        group: '生产集群',
        tags: ['Production', 'K8s', 'US'],
        color: '#ef4444',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        name: '开发测试机 (Dev-Node)',
        host: 'dev.internal.net',
        port: 22,
        username: 'ubuntu',
        authType: 'password',
        group: '测试环境',
        tags: ['Dev', 'Docker'],
        color: '#3b82f6',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        name: 'Hong Kong Gateway',
        host: 'hk.gateway.io',
        port: 2222,
        username: 'admin',
        authType: 'password',
        group: '跳板机',
        tags: ['Proxy', 'BGP'],
        color: '#10b981',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);

    await db.snippets.bulkAdd([
      { title: '查看系统资源监控', command: 'htop || top', category: '运维诊断' },
      { title: 'Docker 容器实时状态', command: 'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"', category: 'Docker' },
      { title: '查看磁盘占用排行', command: 'du -sh * | sort -hr | head -n 10', category: '磁盘清理' },
      { title: '查看网络监听端口', command: 'netstat -tulpn || ss -tulpn', category: '网络调试' },
    ]);
  }
}
