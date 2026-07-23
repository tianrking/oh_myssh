# 纯前端开源项目研究与复用决策

研究快照：2026-07-23

本文严格按照“只有浏览器前端，没有 Go、Node/Python 后端、本地 Agent
或项目自建 Gateway”的产品边界重新整理。

## 0. 2026-07-23 研究快照

| 项目 | 当前观察版本 | 在本项目中的角色 |
|---|---|---|
| Chromium libapps/nassh | `nassh-0.79` | OpenSSH WASM/WASI/socket 权威底座 |
| xterm.js | `6.0.0` | 生产 terminal renderer |
| wterm | `0.2.1` | 实验 renderer |
| `@wasmer/sdk` | `0.10.0` | 后续 WASIX 离线 Shell |
| React | `19.2.8` | 产品 UI |
| Vite | `8.1.5` | 静态构建、Worker/WASM bundling |
| Electerm | `3.15.159` | 产品信息架构参考 |
| Tabby | `1.0.235` | profile/split/快捷键参考 |
| Nexterm | `1.2.2-BETA` | 现代工作区参考，不复用服务端 |

版本仅表示研究当天的快照。真正实现时必须 exact pin、记录上游 revision，
并通过自动化升级 PR 更新，而不能把此表当作浮动依赖范围。Chromium libapps 的
GitHub mirror release 信息可能落后，必须以
[Git at Google 官方仓库](https://chromium.googlesource.com/apps/libapps/)为准。

## 1. 最重要的研究结论

纯前端真实 SSH 可以实现，已经有权威的开源实现证明：

- Chromium [libapps](https://chromium.googlesource.com/apps/libapps/)
  包含 Chrome Secure Shell、OpenSSH WASM 移植和浏览器 WASI runtime。
- `ssh_client/` 是 OpenSSH 的 WASM/WASI 移植。
- `wassh/` 把 POSIX socket、文件系统、信号等调用桥接到 JavaScript。
- `nassh/` 将终端 UI、OpenSSH WASM 和 socket transport 组合成可用的
  Chrome Secure Shell。

真正的困难不是 SSH 加密算法，而是浏览器有没有权力连接原始 TCP/22。

Chromium `wassh` 官方将网络方式分为：

1. WebSocket：开放网页可用，但必须连接 relay，且不能完整支持端口转发。
2. Chrome Sockets：可以直连标准 SSH 并支持端口转发，但只存在于兼容
   的 Chrome 应用环境。
3. Direct Sockets：可以直连标准 SSH 并支持端口转发，但浏览器支持有限。

因此项目的正确架构不是后端 SSH Gateway，而是：

```text
React Workspace
        |
TerminalEngine
        |
OpenSSH WASM + wassh
        |
Browser Socket Adapter
        |
Direct Sockets / Chrome Sockets / optional relay
```

## 2. 平台可行性

### 2.1 普通网页/PWA

普通 Web 应用只能使用 HTTP、WebSocket、WebRTC、WebTransport 等受限制
的网络 API，不能直接创建任意原始 TCP 连接。

影响：

- OpenSSH WASM 可以运行，但没有办法直接把 socket 连接到 TCP/22。
- WebTransport 只能连接 HTTPS 的 HTTP/3 WebTransport server，不会把
  标准 SSH server 自动变成 WebTransport server。
- WebSocket 也需要目标端支持 WebSocket；标准 SSH server 不支持。

所以普通 PWA 要连接真实 SSH，只能使用用户提供的 relay。这仍可保持
`oh_myssh` 仓库为纯前端，但不能称为“端到端零服务”。

### 2.2 Isolated Web App

Chromium
[Direct Sockets](https://developer.chrome.com/docs/iwa/direct-sockets)
允许 Isolated Web App 创建 `TCPSocket`、`TCPServerSocket` 和
`UDPSocket`。[WICG specification](https://wicg.github.io/direct-sockets/)
定义了 Streams、BYOB、private/local address permission 等底层行为。Chrome
官方明确把 SSH、Telnet、RDP 和 IoT 协议列为使用场景。

IWA 特性：

- 静态资源打包为签名 `.swbn`。
- 使用 `isolated-app://` origin。
- 强制严格 CSP 和跨源隔离。
- 可显式申请 `direct-sockets` 权限。
- 可以完全离线安装和运行。
- 可以直接连接标准 SSH TCP/22，不需要 relay。

限制：

- IWA 与 Direct Sockets 仍不是所有浏览器、所有用户都能无门槛安装。
- Chrome 143 起，ChromeOS Admin Panel 只允许安装/更新
  [allowlist](https://developer.chrome.com/docs/iwa/allowlist) 中的 IWA。
- 其他操作系统从 IWA 初始支持起也受官方 allowlist 约束。
- 未进入 early adopter program 的开发者通常没有申请入口；开发模式不受此限制。
- Chrome/ChromeOS 120+ 可通过 `chrome://web-app-internals` 开发模式测试 IWA。
- 项目必须把“技术可行”和“可面向所有普通用户分发”分开表述。

结论：IWA 是纯前端直连 SSH 的主技术方向，但能否进入 allowlist、普通用户如何
安装和更新，是与代码可行性同等重要的 P0 风险。

### 2.3 Chrome Secure Shell 路线

Chromium [Secure Shell/nassh](https://chromium.googlesource.com/apps/libapps/+/HEAD/nassh)
已经将 hterm 与 OpenSSH WASM 组合为 Chrome SSH 客户端。

它证明：

- SSH 协议和加密可以完整运行在 WASM。
- 私钥可以只保存在浏览器端。
- SFTP、端口转发和标准 OpenSSH 参数可以通过浏览器 runtime 支持。
- 不需要用 Go/Node 重新实现 SSH。

但它不等于普通网页拥有 TCP 权限。其网络能力仍来自 Chrome Sockets、
Direct Sockets 或 relay。

## 3. 第一优先级参考：Chromium libapps

官方仓库：

- [libapps](https://chromium.googlesource.com/apps/libapps/)
- [GitHub mirror](https://github.com/libapps/libapps-mirror)
- [ssh_client](https://chromium.googlesource.com/apps/libapps/+/HEAD/ssh_client)
- [wassh](https://chromium.googlesource.com/apps/libapps/+/HEAD/wassh)
- [nassh](https://chromium.googlesource.com/apps/libapps/+/HEAD/nassh)
- [hterm](https://chromium.googlesource.com/apps/libapps/+/HEAD/hterm)

许可证：BSD-3-Clause。

### 3.1 `ssh_client`

`ssh_client` 将 OpenSSH、OpenSSL、zlib 等编译为 WASM/WASI。

应优先验证：

- 是否可以直接复用其编译产物。
- 如何将 stdout/stdin 与 xterm.js 连接。
- 如何导入私钥、`known_hosts` 和 OpenSSH 配置。
- `ssh`、`sftp`、`scp` 的构建产物和体积。
- OpenSSH 上游安全更新如何自动同步。

不建议第一版自己实现 SSH-2 协议、KEX、cipher 和认证。

### 3.2 `wassh`

`wassh` 是最关键的 runtime 参考：

- WASI syscall handler。
- POSIX socket 到浏览器 socket 的桥接。
- 虚拟文件系统。
- hostname 与浏览器 DNS 行为适配。
- Chrome Sockets、Direct Sockets 和 WebSocket relay 抽象。
- socket option 的兼容处理。

项目应建立自己的 `SocketTransport` 接口，但尽量复用或适配 `wassh`，
而不是重写整个 WASI runtime。

```ts
interface SocketTransport {
  capabilities(): SocketCapabilities;
  connect(host: string, port: number): Promise<DuplexByteStream>;
  listen?(address: string, port: number): Promise<SocketListener>;
  openUdp?(options: UdpOptions): Promise<UdpSocket>;
}
```

实现：

- `DirectSocketsTransport`
- `ChromeSocketsTransport`
- `RelayTransport`
- `UnsupportedTransport`

### 3.3 `nassh`

参考：

- connection profile。
- OpenSSH command-line 参数生成。
- host key、身份文件和浏览器存储。
- OpenSSH WASM 生命周期。
- SFTP/`nasftp`。
- 硬件密钥和浏览器权限处理。

不直接采用：

- hterm UI。
- Chrome App 专属页面结构。
- 老的偏好设置和 UI 体系。

我们使用 React + xterm.js 重做产品层，只复用底层 SSH/WASI/socket 能力。

## 4. 终端渲染参考

| 项目 | 许可证 | 决策 |
|---|---|---|
| [xterm.js](https://github.com/xtermjs/xterm.js) | MIT | 生产默认 |
| [wterm](https://github.com/vercel-labs/wterm) | Apache-2.0 | 实验 adapter |
| [hterm](https://chromium.googlesource.com/apps/libapps/+/HEAD/hterm) | BSD-3-Clause | nassh 行为参考 |
| [ttyd](https://github.com/tsl0922/ttyd) | MIT | CJK/IME/高吞吐测试参考 |

### 4.1 xterm.js

xterm.js 官方支持：

- `bash`、`vim`、`tmux`、curses 和鼠标事件。
- CJK、emoji、IME。
- WebGL renderer。
- fit、search、serialize、clipboard、image 和 links addons。
- headless terminal。

采用：

- `@xterm/xterm`
- `@xterm/addon-webgl`
- `@xterm/addon-fit`
- `@xterm/addon-search`
- `@xterm/addon-serialize`
- unicode11、clipboard 按需开启；experimental unicode-graphemes 和 image
  通过兼容/性能测试后再启用。

终端 renderer 与 SSH runtime 必须分离：

```text
xterm.js.write(bytes)        <- OpenSSH stdout
xterm.js.onData(input)       -> OpenSSH stdin
```

### 4.2 wterm

wterm 0.2.x 的 Zig/WASM core、DOM renderer、dirty-row 更新、原生文本选择和
可选 `@wterm/ghostty` backend 值得持续验证，但不能直接成为首版默认。

研究日期时仍存在官方问题：

- [CJK 输入产生多余字符](https://github.com/vercel-labs/wterm/issues/85)
- [IME 组合窗口问题](https://github.com/vercel-labs/wterm/issues/70)
- [宽字符 continuation cell](https://github.com/vercel-labs/wterm/issues/71)
- [宽字符光标宽度](https://github.com/vercel-labs/wterm/issues/54)
- [Ghostty scrollback 未实现路径](https://github.com/vercel-labs/wterm/issues/91)

以上问题在 2026-07-23 仍为 open。

结论：保留 `WtermEngine`，通过 feature flag 测试。

### 4.3 hterm

hterm 是 Chromium Secure Shell 和 ChromeOS Terminal 的终端实现。

我们不必采用其 UI，但它的行为测试很有价值：

- OpenSSH 特殊序列。
- OSC 52 clipboard。
- tmux/screen passthrough。
- 字体、键盘和 ChromeOS 行为。

## 5. 离线 Shell 参考

[Wasmer JavaScript SDK](https://github.com/wasmerio/wasmer-js)
的当前浏览器入口是 `@wasmer/sdk`，可以运行 WASI/WASIX package。

采用范围：

- 完全离线的受限 Shell。
- Python、文本处理和脚本工具。
- 与远程 SSH 共用 terminal renderer。
- OPFS 挂载的虚拟工作区。

限制：

- WASIX shell 不是操作系统真实 Shell。
- 不能读取本机任意文件。
- 不能创建 Windows ConPTY 或 WSL。
- `SharedArrayBuffer` 需要 cross-origin isolation。
- WASIX 的网络能力仍受宿主浏览器 API 限制。

OpenSSH WASM 与 WASIX Shell 是两条 runtime：

```text
Remote session: OpenSSH WASM + wassh
Offline local:  Wasmer WASIX
```

不要为了“统一”而强行把二者塞进同一个 runtime。

## 6. SFTP 方案

纯前端 SFTP 有三个候选：

### 方案 A：复用 Chromium `nasftp`

优点：

- 已与 nassh/OpenSSH WASM 生态配合。
- 浏览器端实现。
- BSD-3-Clause。

风险：

- API 可能与 nassh/hterm 耦合。
- 需要适配 React 文件管理器。

### 方案 B：使用 OpenSSH WASM 的 `sftp`

优点：

- 与 OpenSSH 行为一致。
- 安全更新跟随上游。

风险：

- CLI stdin/stdout 不适合结构化文件管理器。
- 解析人类输出不可靠。
- 可能需要为 SFTP subsystem 增加机器可读 bridge。

### 方案 C：浏览器端独立 SFTP protocol client

优点：

- API 最适合 UI。
- 可以精确实现分块、进度、取消和并发。

风险：

- 需要实现和维护 SFTP protocol。
- 安全与兼容测试成本最高。

建议：

1. Phase 0 优先评估 `nasftp`。
2. 不解析 `sftp` CLI 的文本输出作为正式 API。
3. 若 `nasftp` 耦合过深，再独立抽取 SFTP protocol core。

## 7. 产品型项目参考

这些项目不作为运行时底座，只参考产品设计。

| 项目 | 许可证 | 借鉴 | 不采用 |
|---|---|---|---|
| [Electerm](https://github.com/electerm/electerm) | MIT | 主机树、标签、分屏、SFTP、快捷命令 | Electron/Node 连接层 |
| [Nexterm](https://github.com/gnmyt/Nexterm) | MIT | 现代工作区、双栏文件、会话 UI | Node Server、C Engine、Guacamole 主路径 |
| [Tabby](https://github.com/Eugeny/tabby) | MIT | profile、跳板机、快捷键、插件 | Electron/原生后端 |
| [JumpServer](https://github.com/jumpserver/jumpserver) | GPL-3.0 | 会话行为和审计概念 | GPL 实现、企业 PAM |
| [Apache Guacamole](https://guacamole.apache.org/) | Apache-2.0 | 未来 RDP/VNC 研究 | 首版和纯前端核心 |

### 7.1 Electerm

参考：

- 主机、标签、文件管理器的信息架构。
- 快捷命令广播。
- 小文件编辑。
- 主题和快捷键。
- 多协议错误呈现。

不参考：

- Node SSH2 连接层。
- Electron IPC。
- 第一版覆盖所有协议。

### 7.2 Nexterm

原先最值得参考的是控制面与 Engine 分离，但这与严格纯前端边界不一致。

现在仅参考：

- React 工作区。
- SFTP 操作模型。
- Session/Tab UI。
- 录屏和共享的交互表现。

不采用：

- Node/Express 控制面。
- C Engine。
- 凭据在服务进程间传递。

### 7.3 Tabby

参考：

- profile 和 jump host 配置。
- 多层分屏。
- 快捷键。
- 登录脚本。
- 终端偏好。

Tabby Web 的 Gateway 方案仅作为普通 PWA relay compatibility 的设计参考，
不是 `oh_myssh` 的核心部署方式。

### 7.4 云同步产品参考

Electerm 已支持把 bookmarks、themes 和 quick commands 同步到 GitHub/Gitee
secret Gist、WebDAV、自定义服务或 Electerm Cloud。Tabby 的 `sync-config` 和
`ssh-keymap` 插件证明了两个有价值的产品模式：

- 同步 provider 应该可替换，不能锁死官方云端。
- 可同步的 Identity 名称与设备本地私钥路径必须解耦。

Oh My SSH 借鉴 provider adapter 和 identity mapping，但不会直接复用它们的格式：

- 本地优先，未登录也完整可用。
- 所有远端对象在客户端加密。
- settings/profile 默认可同步，private key/password 单独授权。
- terminal scrollback、SFTP 文件和恢复材料永不同步。
- 同步服务不代理 SSH。

详细协议见
[本地 Vault、端到端加密同步与安全边界](SYNC_AND_SECURITY.md)。

## 8. Browser Vault

纯前端意味着不能依赖 OS Keychain。

浏览器 Vault 需要自己实现：

- IndexedDB 保存加密后的 key blob。
- OPFS 保存较大的导入文件和临时数据。
- Argon2id WASM 从用户主密码派生 KEK。
- AES-GCM 加密私钥和敏感配置。
- 每条记录使用独立 nonce。
- Vault 解锁密钥只保存在当前页面 session。
- 空闲、锁屏、页面隐藏和用户操作触发自动锁定。
- 可选 WebAuthn PRF 解锁。

必须诚实说明：

- JavaScript/WASM 内存无法做到原生锁页内存级别的绝对清零。
- 浏览器扩展、恶意依赖和 XSS 都会威胁已解锁 Vault。
- IWA 的静态签名包、严格 CSP 和禁用远程代码是必要安全边界。

## 9. Adopt / Adapt / Build / Reject

### Adopt

- React、TypeScript、Vite。
- xterm.js 和稳定 addons。
- Wasmer JS。
- WebCrypto、IndexedDB、OPFS。
- IWA Web Bundle 官方工具。

### Adapt

- Chromium `ssh_client`。
- Chromium `wassh`。
- Chromium `wasi-js-bindings`。
- Chromium `nasftp`。
- Direct Sockets transport。

### Build

- React 工作区。
- `TerminalEngine`。
- `SshRuntime`。
- `SocketTransport`。
- Browser Vault。
- SFTP UI adapter。
- host key/`known_hosts` UI。
- 分屏、主机、工作区和命令片段。
- IWA 打包和更新体验。
- 能力检测和平台降级。

### Reject

- Go `terminald`。
- Node/Python SSH backend。
- 本地 Agent。
- 项目自建云 Gateway。
- 浏览器中访问系统真实 PTY 的承诺。
- 在普通 PWA 中宣称可以无 relay 直连 TCP/22。

## 10. 许可证策略

候选核心：

- Chromium libapps：BSD-3-Clause。
- OpenSSH：BSD 系许可证集合。
- xterm.js：MIT。
- wterm：Apache-2.0。
- Wasmer JS：MIT。

项目开始编码前应：

1. 确定 Apache-2.0、MIT 或其他兼容许可证。
2. 建立 `THIRD_PARTY_NOTICES.md`。
3. 固定 OpenSSH、OpenSSL 和 WASM build 来源。
4. 自动追踪 OpenSSH 安全更新。
5. 不复制 JumpServer 等 GPL 项目代码。

本文不构成法律意见。

## 11. 最终参考优先级

第一优先级：

- **1. Chromium ssh_client/wassh**：真正的浏览器 OpenSSH。
- **2. Direct Sockets/IWA**：零 relay 的 TCP/22 能力。
- **3. xterm.js**：生产终端。
- **4. Chromium nassh/nasftp**：连接、SFTP 和浏览器存储行为。

第二优先级：

- **5. Electerm**：Xshell/MobaXterm 类工作区。
- **6. Tabby**：profile、分屏和快捷键。
- **7. Nexterm**：现代服务器管理 UI。
- **8. ttyd/hterm**：兼容性测试。

实验优先级：

- **9. wterm/Ghostty WASM**：未来 renderer。
- **10. Wasmer WASIX**：离线 Shell。
- **11. WebAuthn PRF**：Vault 无密码/二次解锁。

## 12. 开始编码前必须完成的实验

1. 在 Chromium IWA dev mode 中成功创建 `TCPSocket` 连接测试 SSH server。
2. 跑通 `ssh_client` WASM，并将 stdio 接到 xterm.js。
3. 验证密码、Ed25519、RSA、host key 和 `known_hosts`。
4. 验证 `nasftp` 是否可以独立适配 React。
5. 测量 OpenSSH WASM、OpenSSL、WASI runtime 的总体积和冷启动。
6. 验证普通 PWA、IWA 和不支持平台的 capability detection。
7. 验证 IWA 签名 bundle 的安装和升级。
8. 验证 CJK、IME、tmux、vim、mouse、resize 和持续输出。
9. 对 Browser Vault 做 threat model。
10. 确认 IWA 的实际目标用户和分发渠道。

只有第 1 和第 2 项成功后，才进入完整产品 UI 开发。
