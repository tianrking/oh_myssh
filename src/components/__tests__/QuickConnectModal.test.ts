import { describe, expect, it } from 'vitest';
import { parseConnectionString } from '../QuickConnectModal';

describe('quick connection parser', () => {
  it('parses hostnames and explicit ports', () => {
    expect(parseConnectionString('ubuntu@example.com:2222')).toEqual({
      username: 'ubuntu',
      host: 'example.com',
      port: 2222,
    });
  });

  it('parses bracketed and unbracketed IPv6 safely', () => {
    expect(parseConnectionString('root@[2606:4700:4700::1111]:2200')).toEqual({
      username: 'root',
      host: '2606:4700:4700::1111',
      port: 2200,
    });
    expect(parseConnectionString('2606:4700:4700::1111')).toEqual({
      username: 'root',
      host: '2606:4700:4700::1111',
      port: 22,
    });
  });

  it('rejects invalid ports and URL-shaped hosts', () => {
    expect(() => parseConnectionString('root@example.com:99999')).toThrow(/端口/u);
    expect(() => parseConnectionString('root@https://example.com')).toThrow(/主机/u);
  });
});
