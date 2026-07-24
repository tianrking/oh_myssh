# Oh My SSH

> 纯前端 · 真实 SSH2 · Xshell 级工作区 · 离线也能用

**Oh My SSH** 是本地优先的纯前端 SSH/SFTP 桌面工作区。浏览器内运行完整 **SSH2 协议栈**（`@microsoft/dev-tunnels-ssh` + WebCrypto），配合 xterm.js WebGL 终端、多标签分屏、双栏 SFTP 与加密 Vault。

已在真实主机上验证：**密码认证 Shell + 交互命令** 通过 E2E。

---

## 功能一览

| 能力 | 状态 |
|------|------|
| 真实 SSH2 握手 / 密码认证 / PTY Shell | ✅ |
| SFTP v3（列表 / 上传 / 下载） | ✅ |
| 多标签保活 + 左右/上下分屏 | ✅ |
| 广播输入 / 命令片段 / 会话日志导出 | ✅ |
| Offline Interactive Shell（无网络） | ✅ |
| Direct Sockets（Chromium IWA） | ✅ |
| 开发态 WS→TCP 中继（`npm run dev`） | ✅ |
| 自定义 WebSocket Relay | ✅ |
| 主题 / WebGL·Canvas 切换 / 快捷键 | ✅ |

---

## 快速开始

```bash
npm install
npm test              # 单元测试
npm run test:ssh      # 真实 SSH E2E（需环境变量密码）
npm run dev           # http://localhost:3000  内置 WS→TCP 中继
npm run build
npm run preview       # 预览同样带中继
```

### 连接真实服务器（推荐流程）

1. `npm run dev`
2. 打开 **快速连接**
3. 输入 `user@host:port` 与密码
4. 状态栏显示 **Local WS→TCP + SSH2** 即真实会话

传输路径：

```text
浏览器 SSH2 客户端  →  WebSocket  →  Vite 本地中继  →  TCP/22  →  OpenSSH
```

生产静态托管时：

- 使用 **Chromium IWA Direct Sockets**，或
- 配置自建 **WebSocket → TCP Relay**（顶部 Network 按钮）

> 普通网页无法直接打开 TCP 端口，这是浏览器安全模型，不是本项目缺陷。

### 真实 SSH E2E 测试

```bash
export OMS_SSH_HOST=your.server
export OMS_SSH_USER=root
export OMS_SSH_PASSWORD='your-password'
npm run test:ssh
```

**切勿把密码提交到 Git。** 密码仅存于当前标签页内存，不写入 IndexedDB。

---

## 快捷键

| 键 | 功能 |
|----|------|
| `⌘/Ctrl+K` | 命令面板 |
| `⌘/Ctrl+T` | 新建连接 |
| `⌘/Ctrl+W` | 关闭标签 |
| `Ctrl+Tab` | 切换标签 |
| `⌘/Ctrl+Shift+B` | 广播栏 |

---

## 架构

```text
React Workspace
  ├── TerminalEngine (xterm.js + WebGL + StreamFrameBatcher)
  ├── SessionRegistry (broadcast / snippets / logs)
  └── SSH2 Client (@microsoft/dev-tunnels-ssh + WebCrypto)
          │
          ├── DirectSocketsTransport     (IWA)
          ├── WebSocketRelayTransport    (自建 / 自定义)
          └── Vite WS→TCP Relay          (dev/preview only)
          │
          ├── Shell channel + PTY
          └── SFTP subsystem (v3)
```

离线主机（`offline.local`）走 **Offline Interactive Shell**，无需网络。

---

## 项目结构

```text
src/
├── components/          # 工作区 UI
├── core/
│   ├── ssh/             # 真实 SSH2 客户端 + SFTP + 传输适配
│   ├── shell/           # 离线 Shell
│   ├── session/         # 会话注册表
│   ├── socket/          # Transport 抽象
│   ├── terminal/        # xterm 引擎
│   ├── vault/           # WebCrypto + Dexie
│   └── sftp/            # OPFS 本地侧
scripts/
├── vite-ws-tcp-relay.ts # 开发中继插件
└── e2e-ssh-check.mjs    # 真实主机 E2E
```

---

## 安全说明

- 密码/私钥默认 **仅内存**，连接配置入库时不落盘明文凭据。
- 服务端 host key 当前会话接受（后续可做 known_hosts UI）。
- 开发中继仅绑定本机 Vite 进程，勿在公网暴露无鉴权中继。

---

## 文档

- [产品蓝图](docs/PRODUCT_BLUEPRINT.md)
- [架构与路线图](docs/ARCHITECTURE_AND_ROADMAP.md)
- [性能工程](docs/PERFORMANCE_ENGINEERING.md)
- [同步与安全](docs/SYNC_AND_SECURITY.md)

---

## License

Apache-2.0
