import { describe, expect, it } from 'vitest';
import { isAllowedRelayOrigin, parseRelayTarget } from './vite-ws-tcp-relay';

describe('Vite-only TCP relay boundary', () => {
  it('accepts exact same-origin upgrades and rejects unrelated origins', () => {
    expect(isAllowedRelayOrigin('http://localhost:3000', 'localhost:3000')).toBe(true);
    expect(isAllowedRelayOrigin('https://localhost:3000', 'localhost:3000')).toBe(true);
    expect(isAllowedRelayOrigin('https://attacker.example', 'localhost:3000')).toBe(false);
    expect(isAllowedRelayOrigin(undefined, 'localhost:3000')).toBe(false);
  });

  it('parses strict targets and does not accept parseInt-style port suffixes', () => {
    expect(
      parseRelayTarget('/__ohmyssh_tcp?host=example.com&port=2222', 'localhost:3000'),
    ).toEqual({ host: 'example.com', port: 2222 });
    expect(() =>
      parseRelayTarget('/__ohmyssh_tcp?host=example.com&port=22evil', 'localhost:3000'),
    ).toThrow(/Invalid/u);
    expect(() =>
      parseRelayTarget('/__ohmyssh_tcp?host=https%3A%2F%2Fexample.com', 'localhost:3000'),
    ).toThrow(/Invalid/u);
  });
});
