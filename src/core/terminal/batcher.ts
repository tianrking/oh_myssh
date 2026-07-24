/**
 * Oh My SSH - Terminal Stream Frame Batcher & Backpressure Control
 * 控制 xterm.js 的高频字节流输出，防止大数据量刷屏拖垮 UI 线程
 */

export interface BatcherOptions {
  maxBatchSize?: number;
  flushIntervalMs?: number;
}

export class StreamFrameBatcher {
  private queue: Uint8Array[] = [];
  private totalBufferedBytes = 0;
  private maxBatchSize: number;
  private flushIntervalMs: number;
  private isScheduled = false;
  private onFlushCallback: (chunk: Uint8Array) => void;

  constructor(onFlush: (chunk: Uint8Array) => void, options: BatcherOptions = {}) {
    this.onFlushCallback = onFlush;
    this.maxBatchSize = options.maxBatchSize || 64 * 1024; // 64KB
    this.flushIntervalMs = options.flushIntervalMs || 16; // 约 60FPS
  }

  /**
   * 推入新数据块并安排批处理刷新
   */
  public push(chunk: Uint8Array): void {
    this.queue.push(chunk);
    this.totalBufferedBytes += chunk.byteLength;

    // 缓冲区过大时立即触发背压同步刷新
    if (this.totalBufferedBytes >= this.maxBatchSize) {
      this.flushImmediately();
    } else if (!this.isScheduled) {
      this.isScheduled = true;
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => this.flush());
      } else {
        setTimeout(() => this.flush(), this.flushIntervalMs);
      }
    }
  }

  /**
   * 按帧合并所有入队的数据块并消费
   */
  public flush(): void {
    this.isScheduled = false;
    if (this.queue.length === 0) return;

    if (this.queue.length === 1) {
      const single = this.queue.shift()!;
      this.totalBufferedBytes = 0;
      this.onFlushCallback(single);
      return;
    }

    // 合并多块 Uint8Array 避免频繁在主线程触发多词渲染
    const merged = new Uint8Array(this.totalBufferedBytes);
    let offset = 0;
    for (const item of this.queue) {
      merged.set(item, offset);
      offset += item.byteLength;
    }

    this.queue = [];
    this.totalBufferedBytes = 0;
    this.onFlushCallback(merged);
  }

  public flushImmediately(): void {
    this.flush();
  }

  public getBufferedBytes(): number {
    return this.totalBufferedBytes;
  }

  public clear(): void {
    this.queue = [];
    this.totalBufferedBytes = 0;
    this.isScheduled = false;
  }
}
