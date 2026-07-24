# Oh My SSH

> WebSSH 的直连能力，Xshell 的稳定会话，MobaXterm 的桌面工作区，以及现代 Web 产品的离线体验。

**Oh My SSH** 是一个本地优先、严格纯前端的 SSH/SFTP 现代桌面级工作区。默认提供高性能 **Offline Interactive Shell**（完全可离线）；在 Chromium IWA 下走 Direct Sockets 直连 TCP/22；或配置 WebSocket Relay 连接真实 SSH。

当前状态：**核心工作区可用 · 全量 Vitest 29/29 通过 · 离线优先可交付**。

---

## 核心特性

- **零后端纯前端**：HTML / CSS / TypeScript / WASM / 浏览器 API，无项目后端。
- **始终可用的离线 Shell**：虚拟文件系统、readline（历史/补全/Ctrl 组合键）、常用运维命令。
- **连接决策树**：DirectSockets (IWA) → WebSocket Relay → Offline Shell（失败自动回退）。
- **会话保活**：多标签全部挂载，切换 Tab 不销毁 SSH/离线会话。
- **Xshell 风格工作区**：多标签、左右/上下分屏、主机树、⌘K 命令面板、广播输入。
- **xterm.js + WebGL + StreamFrameBatcher**：GPU 渲染 + 帧批处理背压。
- **加密 Vault（WebCrypto AES-256-GCM）** + IndexedDB 主机/片段存储。
- **双栏 SFTP + OPFS**：本地侧真实 OPFS 列表与流式写入。

---

## 快速开始

```bash
npm install
npm test          # 29 tests
npm run build
npm run dev       # http://localhost:5173
```

### 真实 SSH 路径

| 模式 | 条件 | 说明 |
|------|------|------|
| **Offline Shell** | 默认 | 纯本地，无网络，完整开发演示体验 |
| **Direct Sockets** | Chromium IWA + `TCPSocket` | 浏览器直连目标 TCP/22 |
| **WebSocket Relay** | 顶部 Relay 配置 `wss://...` | 经自建网关转发真实 SSH |

普通网页 **不能** 直接打开任意 TCP/22（W3C 安全模型）。要连真实服务器：安装 IWA，或自建 WebSocket SSH 网关后在 UI 中配置 Relay。

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `⌘/Ctrl + K` | 命令面板 / 片段 |
| `⌘/Ctrl + T` | 新建连接 |
| `⌘/Ctrl + W` | 关闭当前标签 |
| `Ctrl + Tab` | 切换标签 |
| `⌘/Ctrl + Shift + B` | 广播输入栏 |

离线 Shell 内：`↑↓` 历史、`Tab` 补全、`Ctrl+C/L/U/W`。

---

## 架构

```text
UI (React)
  ├── Host Tree / Tabs / Splits / SFTP / Palette
  └── TerminalEngine (xterm.js + WebGL + Batcher)
          │
          ▼
    SessionRegistry  ←── broadcast / snippets / export log
          │
          ▼
    SocketTransport
      ├── DirectSocketsTransport  (IWA)
      ├── WebSocketRelayTransport (optional)
      └── OfflineShellEngine      (always available)
```

---

## 测试

```bash
npm test
# Test Files  12 passed
# Tests       29 passed
```

覆盖：Vault 加解密、OPFS 流、WASI 桥、帧批处理、Socket 决策、Offline Shell、Session Registry、终端管道稳定性。

---

## 项目结构

```text
src/
├── components/     # 工作区 UI
├── core/
│   ├── session/    # 全局会话注册表
│   ├── shell/      # 高性能离线 Shell
│   ├── socket/     # Transport 抽象
│   ├── terminal/   # xterm 引擎 + 批处理
│   ├── vault/      # 加密与 IndexedDB
│   ├── sftp/       # OPFS 流式引擎
│   └── wasm/       # WASI 桥
└── workers/        # SSH Worker 占位（WASM 协议扩展点）
```

---

## 文档

- [产品蓝图](docs/PRODUCT_BLUEPRINT.md)
- [架构与路线图](docs/ARCHITECTURE_AND_ROADMAP.md)
- [性能工程](docs/PERFORMANCE_ENGINEERING.md)
- [同步与安全](docs/SYNC_AND_SECURITY.md)

---

## 许可证

Apache-2.0
