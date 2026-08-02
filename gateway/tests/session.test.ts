import { describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:sockets', () => ({ connect: vi.fn() }));

import { webSocketDataToBytes } from '../src/session';

describe('Worker WebSocket binary frames', () => {
  it('normalizes ArrayBuffer, typed views, and Blob payloads', async () => {
    const expected = Uint8Array.from([1, 2, 3, 4]);

    await expect(webSocketDataToBytes(expected.buffer)).resolves.toEqual(expected);
    await expect(webSocketDataToBytes(new DataView(expected.buffer))).resolves.toEqual(expected);
    await expect(webSocketDataToBytes(new Blob([expected]))).resolves.toEqual(expected);
    await expect(webSocketDataToBytes('control frame')).resolves.toBeNull();
  });
});
