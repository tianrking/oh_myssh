import { describe, it, expect, vi } from 'vitest';
import { StreamFrameBatcher } from '../batcher';

describe('StreamFrameBatcher - 终端帧合并与背压控制器', () => {
  it('应该能够合并多个推送的小 Uint8Array 数据块并在 flush 时一次性输出', () => {
    const outputs: Uint8Array[] = [];
    const batcher = new StreamFrameBatcher((chunk) => {
      outputs.push(chunk);
    });

    const encoder = new TextEncoder();
    batcher.push(encoder.encode('Hello '));
    batcher.push(encoder.encode('World!'));

    expect(batcher.getBufferedBytes()).toBe(12);

    batcher.flushImmediately();

    expect(outputs.length).toBe(1);
    expect(new TextDecoder().decode(outputs[0])).toBe('Hello World!');
    expect(batcher.getBufferedBytes()).toBe(0);
  });

  it('超过 maxBatchSize 限制时必须触发背压立即刷新', () => {
    const outputs: Uint8Array[] = [];
    const batcher = new StreamFrameBatcher(
      (chunk) => {
        outputs.push(chunk);
      },
      { maxBatchSize: 10 }
    );

    const largeChunk = new Uint8Array(15);
    batcher.push(largeChunk);

    expect(outputs.length).toBe(1);
    expect(outputs[0].byteLength).toBe(15);
    expect(batcher.getBufferedBytes()).toBe(0);
  });
});
