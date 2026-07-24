import { describe, it, expect } from 'vitest';
import { OPFSEngine } from '../opfs';

describe('OPFSEngine - Origin Private File System & 流式大文件处理', () => {
  it('应该能够成功通过 ReadableStream 写入文件并准确计算累计字节数', async () => {
    const engine = new OPFSEngine();
    const testData = new TextEncoder().encode('Stream OPFS test chunk content 2026!');

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(testData);
        controller.close();
      },
    });

    let reportedBytes = 0;
    const total = await engine.writeStreamToFile('test_file.bin', stream, (bytes) => {
      reportedBytes = bytes;
    });

    expect(total).toBe(testData.byteLength);
    expect(reportedBytes).toBe(testData.byteLength);
  });
});
