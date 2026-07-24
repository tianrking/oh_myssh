import { describe, it, expect, beforeEach } from 'vitest';
import { db, seedInitialDataIfNeeded } from '../storage';

describe('OhMySSHDatabase Dexie 数据库存储测试', () => {
  it('数据库结构与表属性定义正确', () => {
    expect(db.hosts).toBeDefined();
    expect(db.snippets).toBeDefined();
    expect(db.layouts).toBeDefined();
  });
});
