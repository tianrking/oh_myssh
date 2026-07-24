/**
 * Oh My SSH - Dedicated SSH WASM Web Worker
 * 隔离 SSH 协议处理与解析，避免阻塞主线程 UI
 */

export interface SSHWorkerMessage {
  type: 'CONNECT' | 'DISCONNECT' | 'DATA_SEND' | 'PING';
  payload?: any;
}

self.onmessage = async (event: MessageEvent<SSHWorkerMessage>) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'CONNECT': {
      // 模拟 Worker 中的 SSH WASM 握手过程
      self.postMessage({
        type: 'STATUS_CHANGE',
        payload: { status: 'CONNECTING', host: payload?.host, port: payload?.port },
      });

      setTimeout(() => {
        self.postMessage({
          type: 'STATUS_CHANGE',
          payload: { status: 'CONNECTED', sessionInfo: 'OpenSSH_WASM_9.8p1' },
        });
      }, 100);
      break;
    }

    case 'DATA_SEND': {
      // 模拟接收数据与回复
      const encoder = new TextEncoder();
      const chunk = encoder.encode(`[Worker echo]: ${payload}\r\n`);
      self.postMessage({
        type: 'DATA_RECEIVE',
        payload: chunk,
      });
      break;
    }

    case 'PING': {
      self.postMessage({ type: 'PONG', payload: Date.now() });
      break;
    }

    case 'DISCONNECT': {
      self.postMessage({
        type: 'STATUS_CHANGE',
        payload: { status: 'DISCONNECTED' },
      });
      break;
    }
  }
};
