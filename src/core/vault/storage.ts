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

const OFFLINE_HOST: HostProfile = {
  name: '离线开发 Shell (Demo)',
  host: 'offline.local',
  port: 22,
  username: 'ubuntu',
  authType: 'password',
  group: '本地 / 离线',
  tags: ['Offline', 'Demo', 'Dev'],
  color: '#06b6d4',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

/**
 * Seed demo hosts & snippets. Offline host is first so default open always works.
 * Also migrates older DBs that lack an Offline-tagged host.
 */
export async function seedInitialDataIfNeeded() {
  const count = await db.hosts.count();
  if (count === 0) {
    await db.hosts.bulkAdd([
      OFFLINE_HOST,
      {
        name: '本地回环演示',
        host: '127.0.0.1',
        port: 22,
        username: 'root',
        authType: 'password',
        group: '本地 / 离线',
        tags: ['Offline', 'Local'],
        color: '#8b5cf6',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        name: '生产主服务器 (示例)',
        host: '192.168.1.100',
        port: 22,
        username: 'root',
        authType: 'password',
        group: '生产集群',
        tags: ['Production', 'K8s'],
        color: '#ef4444',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        name: '开发测试机',
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
        authType: 'privateKey',
        group: '跳板机',
        tags: ['Proxy', 'Jump'],
        color: '#10b981',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);

    await db.snippets.bulkAdd([
      { title: '系统资源监控', command: 'htop || top', category: '运维诊断' },
      { title: 'Docker 容器状态', command: 'docker ps', category: 'Docker' },
      { title: '磁盘占用排行', command: 'df -h', category: '磁盘清理' },
      { title: '进程列表', command: 'ps', category: '运维诊断' },
      { title: 'Git 状态', command: 'git status', category: '开发' },
      { title: '系统信息', command: 'neofetch', category: '系统' },
      { title: '目录树', command: 'tree', category: '文件系统' },
      { title: '当前路径', command: 'pwd', category: '文件系统' },
    ]);
    return;
  }

  // Migration: ensure offline demo host exists for older installs
  const hasOffline = await db.hosts
    .filter((h) => h.host === 'offline.local' || (h.tags || []).includes('Offline'))
    .count();
  if (hasOffline === 0) {
    await db.hosts.add({ ...OFFLINE_HOST, createdAt: Date.now(), updatedAt: Date.now() });
  }
}
