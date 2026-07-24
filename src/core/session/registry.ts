/**
 * Global session registry — enables broadcast, snippets, log export
 * and command palette injection without React state for byte streams.
 */

import type { TerminalEngine } from '../terminal/engine';

export type SessionMode = 'direct' | 'relay' | 'offline' | 'unknown' | 'local-relay';

export interface SessionEntry {
  tabId: string;
  engine: TerminalEngine;
  mode: SessionMode;
  title: string;
  host: string;
  registeredAt: number;
}

class SessionRegistry {
  private sessions = new Map<string, SessionEntry>();
  private activeTabId: string | null = null;

  register(
    tabId: string,
    engine: TerminalEngine,
    meta: { mode: SessionMode; title: string; host: string }
  ): void {
    this.sessions.set(tabId, {
      tabId,
      engine,
      mode: meta.mode,
      title: meta.title,
      host: meta.host,
      registeredAt: Date.now(),
    });
  }

  unregister(tabId: string): void {
    this.sessions.delete(tabId);
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
    }
  }

  setActive(tabId: string | null): void {
    this.activeTabId = tabId;
  }

  getActive(): SessionEntry | null {
    if (!this.activeTabId) return null;
    return this.sessions.get(this.activeTabId) ?? null;
  }

  get(tabId: string): SessionEntry | null {
    return this.sessions.get(tabId) ?? null;
  }

  list(): SessionEntry[] {
    return Array.from(this.sessions.values());
  }

  /** Write raw data to one session (does not auto-append CR). */
  writeTo(tabId: string, data: string): boolean {
    const entry = this.sessions.get(tabId);
    if (!entry) return false;
    entry.engine.writeInput(data);
    return true;
  }

  /** Write a full command line + CR to the active SSH session. */
  runOnActive(command: string): boolean {
    if (!this.activeTabId) return false;
    const cmd = command.endsWith('\r') || command.endsWith('\n') ? command : command + '\r';
    return this.writeTo(this.activeTabId, cmd);
  }

  /** Broadcast a command to all registered SSH sessions. */
  broadcast(command: string): number {
    const cmd = command.endsWith('\r') || command.endsWith('\n') ? command : command + '\r';
    let count = 0;
    for (const entry of this.sessions.values()) {
      entry.engine.writeInput(cmd);
      count++;
    }
    return count;
  }

  exportLog(tabId: string): string {
    return this.sessions.get(tabId)?.engine.exportLog() ?? '';
  }

  focus(tabId: string): void {
    this.sessions.get(tabId)?.engine.focus();
  }

  resize(tabId: string): void {
    this.sessions.get(tabId)?.engine.resize();
  }

  setThemeAll(themeName: string): void {
    for (const entry of this.sessions.values()) {
      entry.engine.setTheme(themeName);
    }
  }

  size(): number {
    return this.sessions.size;
  }
}

export const sessionRegistry = new SessionRegistry();
