import { describe, it, expect, beforeEach } from 'vitest';
import { sessionRegistry } from '../registry';
import type { TerminalEngine } from '../../terminal/engine';

function mockEngine() {
  const inputs: string[] = [];
  return {
    inputs,
    engine: {
      writeInput: (d: string) => inputs.push(d),
      exportLog: () => 'log-data',
      focus: () => {},
      resize: () => {},
      setTheme: () => {},
    } as unknown as TerminalEngine,
  };
}

describe('sessionRegistry', () => {
  beforeEach(() => {
    // clear by unregistering known ids
    for (const s of sessionRegistry.list()) {
      sessionRegistry.unregister(s.tabId);
    }
  });

  it('registers, broadcasts, and exports logs', () => {
    const a = mockEngine();
    const b = mockEngine();
    sessionRegistry.register('t1', a.engine, { mode: 'offline', title: 'A', host: 'h1' });
    sessionRegistry.register('t2', b.engine, { mode: 'offline', title: 'B', host: 'h2' });

    expect(sessionRegistry.size()).toBe(2);

    sessionRegistry.setActive('t1');
    expect(sessionRegistry.runOnActive('ls')).toBe(true);
    expect(a.inputs[0]).toBe('ls\r');

    const n = sessionRegistry.broadcast('pwd');
    expect(n).toBe(2);
    expect(a.inputs).toContain('pwd\r');
    expect(b.inputs).toContain('pwd\r');

    expect(sessionRegistry.exportLog('t1')).toBe('log-data');

    sessionRegistry.unregister('t1');
    expect(sessionRegistry.size()).toBe(1);
  });
});
