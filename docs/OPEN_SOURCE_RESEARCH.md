# 开源项目研究与复用决策

研究快照：2026-07-23

本文只使用项目官方仓库、官方文档和官方 issue 作为主要依据。活跃度和产品状态是研究日期时的快照，不构成长期保证。

## 1. 结论先行

`oh_myssh` 不应该 fork Electerm、Nexterm、Tabby Web、JumpServer 或其他完整产品作为底座。

推荐路线是：

1. 使用 xterm.js、Go SSH/SFTP/PTY/WebSocket 等成熟基础库。
2. 参考 Electerm、Nexterm 和 Tabby 的交互与功能组织。
3. 参考 JumpServer、ShellHub、Warpgate 的会话、网关和安全边界。
4. 将 Apache Guacamole 隔离成未来的 RDP/VNC sidecar。
5. 自己实现工作区、会话协议、流控、本地 Agent、凭据边界和离线数据模型。

原因：

- 完整产品通常带着自己的历史架构、部署模型、权限体系和商业目标。
- 我们的差异点是“本地优先、Web 原生、密钥不离开本机”，不是企业 PAM。
- 大型 fork 会让后续升级、许可证和安全审计成本长期失控。

## 2. 完整产品参考

| 项目 | 许可证 | 借鉴重点 | 为什么不作为底座 |
|---|---|---|---|
| [Electerm](https://github.com/electerm/electerm) | MIT | Xshell/MobaXterm 类工作区、SSH/SFTP/FTP/Telnet/串口/RDP/VNC 的产品组织，标签与快捷命令体验 | 以 Electron/Node 为核心，功能面很大；Web 版仍带有桌面架构假设 |
| [Nexterm](https://github.com/gnmyt/Nexterm) | MIT | 现代 React UI、xterm、SFTP、连接 Engine、FlatBuffers 协议、Guacamole 集成 | 官方仍标为 Beta；Node 控制面、C Engine、Guacamole/libssh2 组合较重 |
| [Tabby](https://github.com/Eugeny/tabby) | MIT | 分屏、快捷键、配置档案、跳板机、agent forwarding、插件体系 | 完整桌面终端，Web 不是其最轻的主路径 |
| [Tabby Web](https://github.com/Eugeny/tabby-web) | MIT | Web App 与独立 Connection Gateway 分层、自托管网关、安全风险说明 | 官方 README 明确说明维护者目前无法持续投入支持 |
| [JumpServer](https://github.com/jumpserver/jumpserver) | GPL-3.0 | Web Terminal、字符协议 Connector、图形协议 Connector、审计与会话生命周期 | 企业 PAM 较重；GPL-3.0 代码不能随意复制进宽松许可证项目 |
| [ShellHub](https://github.com/shellhub-io/shellhub) | Apache-2.0 | 设备 Agent、反向连接、集中 SSH Gateway、SFTP/转发/录屏 | 核心目标是 Edge/IoT 设备集中管理，不是个人远程工作区 |
| [Warpgate](https://github.com/warp-tech/warpgate) | Apache-2.0 | 透明堡垒机、统一入口、RBAC、审计、协议模块化 | 产品重心是 PAM/Bastion，不应成为首版范围 |
| [Apache Guacamole](https://guacamole.apache.org/) | Apache-2.0 | 浏览器 RDP/VNC/SSH 协议代理、`guacd` 隔离、`guacamole-common-js` | UI 和部署较传统；不值得用它承载我们的 SSH/SFTP 主路径 |

### 2.1 Electerm

官方仓库显示 Electerm 已覆盖：

- SSH、SFTP、FTP、Telnet、串口。
- RDP、VNC、SPICE。
- 多标签、快捷命令、同步、代理、隧道、Zmodem/trzsz。
- React、Vite、xterm.js/WebGL，并同时支持 Electron 和 Web 发行。

值得借鉴：

- 主机树、连接配置、标签页、终端和文件管理器的页面关系。
- 快捷命令对一个或多个终端广播。
- 远程小文件直接编辑、传输进度和主题系统。
- 覆盖桌面与 Web 的端到端测试矩阵。

不应复制：

- 把所有协议和高级能力一次性放入首版。
- 让 Electron/Node API 渗透到 Web 工作区接口。
- 让一个巨大的连接配置对象同时承担 UI、凭据和运行时状态。

我们的使用方式：产品交互和测试用例参考，不 fork 整体代码。

### 2.2 Nexterm

Nexterm 当前仓库已经形成比较清晰的多层结构：

- `client/`：React + Vite + xterm.js + Monaco。
- `server/`：Node/Express 控制面、身份、会话和 API。
- `engine/`：C 编写的连接 Engine。
- `schema/`：FlatBuffers 控制协议和 SFTP 协议。
- `vendor/guacamole-server`：RDP/VNC 等图形协议基础。

其 `control_plane.fbs` 将 `SessionOpen`、`SessionResize`、`ConnectionData`、`ExecCommand`、`PortCheck` 等操作显式建模；`sftp_protocol.fbs` 将目录、属性、删除、重命名、读写、缩略图和错误响应独立建模。这种“控制面与数据 Engine 分离、协议有版本化 schema”的方向值得直接吸收。

值得借鉴：

- Session Manager 与 Engine 解耦。
- SSH、SFTP 和图形会话使用统一 session ID。
- SFTP 不复用 REST JSON 拼大文件，而是使用二进制协议。
- 会话录制采用有界缓冲和 asciicast 风格事件。
- RDP/VNC 使用 Guacamole，而不是自己实现协议。

需要修正：

- 不能在协议消息中长期携带私钥正文。
- Engine 必须支持 credential reference 或 signer callback。
- 浏览器、控制面、Engine 之间必须有端到端背压。
- 首版不引入 Node 控制面 + C Engine + Guacamole 的全部部署复杂度。

我们的使用方式：参考协议拆分和 session 模型；不直接采用其完整运行栈。

### 2.3 Tabby 与 Tabby Web

[Tabby](https://github.com/Eugeny/tabby) 是成熟的桌面终端/SSH 客户端，值得参考：

- 多层嵌套分屏。
- Windows PowerShell、WSL、Git Bash 等 profile 组织。
- Jump host、agent forwarding、端口转发和登录脚本。
- 配置、主题、插件与快捷键体系。

[Tabby Web](https://github.com/Eugeny/tabby-web) 将 Web 应用和 [tabby-connection-gateway](https://github.com/Eugeny/tabby-connection-gateway) 分开。Gateway 本质是 WebSocket 到 TCP 的桥接，并允许用户自托管，避免流量经过第三方网关。

值得借鉴：

- Web UI 与连接 Gateway 分离。
- 用户可以明确选择自托管数据平面。
- 对网关被攻破、MITM 和证书风险进行公开说明。

不应照搬：

- 通用 WebSocket-to-TCP Gateway 的权限面过大。
- 只靠长期共享 token 保护 Gateway 不适合我们的最终安全目标。
- Tabby Web 官方已经说明维护资源有限，不能把项目命运绑定在其升级节奏上。

我们的使用方式：参考部署拓扑和风险说明，自己实现窄权限的会话协议。

### 2.4 JumpServer

JumpServer 的模块划分非常有参考价值：

- [Lina](https://github.com/jumpserver/lina)：主 Web UI。
- [Luna](https://github.com/jumpserver/luna)：Web Terminal。
- [KoKo](https://github.com/jumpserver/koko)：SSH、Telnet、Kubernetes、SFTP 和数据库字符协议 Connector。
- [Lion](https://github.com/jumpserver/lion)：RDP/VNC 图形协议 Connector。

值得借鉴：

- UI、字符协议、图形协议和策略控制分层。
- 会话 attach/detach、录像、审计、文件管理和协议适配器边界。
- Go Connector 中对 PTY、SFTP、WebSocket 和终端解析的组织方式。

限制：

- JumpServer 是 GPL-3.0。
- 如果 `oh_myssh` 采用 Apache-2.0/MIT 类许可证，不能复制 JumpServer 的实现代码。
- 可以研究公开接口和系统设计，但实现必须独立完成并保留来源记录。

我们的使用方式：只做架构和行为参考。

### 2.5 ShellHub

ShellHub 的定位是集中管理边缘设备和云端设备，重点在：

- 设备 Agent 主动连接 Gateway。
- 无公网 IP、无需修改防火墙也能远程访问。
- 标准 OpenSSH/PuTTY 接入。
- SFTP/SCP、端口转发、防火墙规则、审计和录屏。

值得借鉴：

- 本地 Agent 与云 Gateway 的配对和重连状态机。
- 反向通道和受控端口转发。
- 设备身份与用户身份分离。

不进入首版：

- 设备 fleet 管理。
- Edge/IoT inventory。
- 强制录屏和合规报表。

### 2.6 Warpgate

Warpgate 已把 SSH、HTTP、Kubernetes、MySQL、PostgreSQL、RDP 和 VNC 拆为独立 Rust 模块，并提供浏览器 SSH 与桌面访问。

值得借鉴：

- 单入口、多协议 provider。
- 短期访问、透明代理和审计边界。
- 协议模块与管理 UI 分离。
- 单二进制和容器化发行思路。

不进入首版：

- 完整 PAM、数据库协议代理和 Kubernetes access proxy。
- 复杂 RBAC/SSO。

### 2.7 Apache Guacamole

Guacamole 的 `guacd` 负责将 RDP/VNC 等二进制协议翻译为浏览器可处理的 Guacamole 协议，客户端由 `guacamole-common-js` 驱动。

采用策略：

- 第二阶段作为独立 sidecar 接入 RDP/VNC。
- `terminald` 只负责签发短期连接票据、策略和生命周期。
- Guacamole 数据流不得与 SSH 字节流共用同一个背压窗口。
- 不使用 Guacamole 作为第一版 SSH/SFTP 的核心。

## 3. 终端与连接基础项目

| 项目 | 许可证 | 决策 |
|---|---|---|
| [xterm.js](https://github.com/xtermjs/xterm.js) | MIT | 生产默认终端 |
| [wterm](https://github.com/vercel-labs/wterm) | Apache-2.0 | 实验终端，必须通过兼容性门槛 |
| [ttyd](https://github.com/tsl0922/ttyd) | MIT | 参考小型 Web TTY、Origin 校验和跨平台测试 |
| [WeTTY](https://github.com/butlerx/wetty) | MIT | 参考 node-pty/WebSocket/xterm 的最小链路 |
| [Wasmer JS](https://github.com/wasmerio/wasmer-js) | MIT | 受限的浏览器内离线 Shell |
| [Mosh](https://github.com/mobile-shell/mosh) | GPL-3.0 | 只参考漫游、重连和本地回显思想 |

### 3.1 xterm.js：生产默认

xterm.js 官方明确支持：

- `bash`、`vim`、`tmux`、curses 和鼠标事件。
- CJK、emoji、IME。
- 可选 WebGL renderer。
- fit、search、serialize、image、clipboard、web links 等 addons。
- headless terminal，可用于服务端状态或测试。

采用：

- `@xterm/xterm`
- `@xterm/addon-webgl`
- `@xterm/addon-fit`
- `@xterm/addon-search`
- `@xterm/addon-serialize`
- 按需启用 Unicode、clipboard、image 和 links。

不采用：

- `addon-attach` 直接绑定产品协议。

我们需要自己的 transport adapter、流控和错误模型。

### 3.2 wterm：实验，不做默认

wterm 的优点：

- Zig/WASM 核心。
- DOM renderer，原生文本选择、浏览器搜索和无障碍更自然。
- dirty-row 更新。
- React package 和 WebSocket transport 示例。

但研究日期时，官方 issue 仍包含：

- [CJK 输入产生多余字符](https://github.com/vercel-labs/wterm/issues/85)。
- [IME 窗口与组合输入问题](https://github.com/vercel-labs/wterm/issues/70)。
- [宽字符 continuation cell 问题](https://github.com/vercel-labs/wterm/issues/71)。
- [宽字符光标宽度错误](https://github.com/vercel-labs/wterm/issues/54)。
- [Ghostty scrollback 尚有未实现路径](https://github.com/vercel-labs/wterm/issues/91)。
- 鼠标模式、同步输出、resize 和 box drawing 等兼容性问题。

结论：

- 保留 `WtermEngine` 实验实现。
- 不能在 MVP 中默认启用。
- 只有通过我们的 CJK/IME、tmux/vim、scrollback、mouse、resize 和持续输出测试后，才讨论晋级。

### 3.3 ttyd 与 WeTTY

ttyd 是 C/libwebsockets/libuv 风格的小型单命令 Web TTY，官方列出 WebGL2、CJK/IME、Zmodem/trzsz、Sixel、TLS、Origin 校验和跨平台支持。

WeTTY 使用 Node、node-pty、Socket.IO 和 xterm.js。

用途：

- 建立最小 PTY-to-WebSocket 测试夹具。
- 参考窗口 resize、心跳、Origin 和断开处理。
- 对比我们的 `terminald` 启动时间、内存和吞吐。

它们都不是完整的主机、凭据、SFTP 和工作区基础。

### 3.4 Wasmer JS

Wasmer JavaScript SDK 支持 WASI/WASIX package，可在浏览器运行 Python 等程序。

重要限制：

- WASIX Worker 依赖 `SharedArrayBuffer`。
- 页面需要 HTTPS 或安全上下文。
- 需要正确配置 COOP/COEP 跨源隔离 header。
- 它不能让普通网页直接建立任意 TCP/22 连接。
- 它不能安全地替代 OS Keychain、SSH agent 或本机真实 PTY。

采用范围：

- 教学/演示 Shell。
- 离线文本工具。
- 脚本和格式转换。

不承担真实 SSH。

## 4. 基础库建议

| 能力 | 首选 | 许可证/说明 |
|---|---|---|
| SSH | [`golang.org/x/crypto/ssh`](https://pkg.go.dev/golang.org/x/crypto/ssh) | BSD 风格 Go 官方扩展库 |
| SFTP | [`github.com/pkg/sftp`](https://github.com/pkg/sftp) | BSD-2-Clause |
| Unix PTY | [`github.com/creack/pty`](https://github.com/creack/pty) | MIT |
| WebSocket | [`github.com/coder/websocket`](https://github.com/coder/websocket) | ISC |
| Windows PTY | ConPTY adapter | Windows 原生能力，需要单独封装和测试 |
| RDP/VNC | Apache Guacamole | Apache-2.0，第二阶段 sidecar |

复杂 OpenSSH config、FIDO、安全密钥、ProxyCommand 和 agent forwarding 不应强行在第一版纯 Go SSH provider 中全部重做。

设计上必须保留：

```text
SessionProvider
  ├─ GoSSHProvider          MVP
  ├─ NativeOpenSSHProvider  后续：复杂 OpenSSH/FIDO
  ├─ LocalPTYProvider
  └─ GuacamoleProvider      后续：RDP/VNC
```

## 5. Build / Adopt / Study 决策

### Adopt：直接依赖

- xterm.js 及稳定 addons。
- Go SSH、SFTP、PTY 和 WebSocket 库。
- React、TypeScript、Vite PWA。
- IndexedDB/OPFS 封装库。
- 第二阶段的 Apache Guacamole。

### Experiment：隔离验证

- wterm/Ghostty WASM。
- Wasmer WASIX。
- Native OpenSSH provider。
- asciicast 格式兼容录屏。

### Build：项目核心价值

- 现代工作区和信息架构。
- `TerminalEngine` 抽象。
- `terminald` 本地/云双模式。
- 二进制会话协议和端到端背压。
- session attach/detach/reconnect。
- 主机、工作区、命令片段和 SFTP 数据模型。
- OS Keychain/ssh-agent 凭据引用。
- host key 校验与 `known_hosts` 管理。
- 大文件传输通道和断点恢复。
- 离线安装、升级和迁移。

### Study Only：只研究，不复制

- JumpServer GPL-3.0 实现。
- Mosh GPL-3.0 实现。
- 商业产品的 UI、图标和文案。
- 任何无法确认来源和许可证的代码片段。

## 6. 许可证策略

当前仓库尚未选择许可证。

推荐决策顺序：

1. 先确定是否允许第三方将核心闭源托管。
2. 若重视广泛采用和开放核心商业模式，优先评估 Apache-2.0。
3. 若重视托管服务修改必须回馈社区，优先评估 AGPL-3.0。
4. 许可证确定前不接受外部代码贡献。
5. 建立 `THIRD_PARTY_NOTICES.md`，记录直接依赖、许可证和用途。
6. 对 GPL 项目只做 clean-room 行为参考。

本文不构成法律意见，正式发布前应完成一次许可证审查。

## 7. 最终参考优先级

第一优先级：

- **1. xterm.js**：终端兼容性和渲染。
- **2. Nexterm**：控制面/Engine/SFTP 协议拆分。
- **3. Electerm**：Xshell/MobaXterm 类产品体验。
- **4. Tabby**：分屏、profile、跳板机和桌面终端习惯。

第二优先级：

- **5. ShellHub**：Agent/Gateway 配对和反向连接。
- **6. Warpgate**：会话、策略和单二进制发行。
- **7. JumpServer**：Connector 和审计边界，仅研究。
- **8. Guacamole**：RDP/VNC sidecar。

实验优先级：

- **9. wterm**：未来终端引擎。
- **10. Wasmer JS**：浏览器离线 Shell。
- **11. ttyd/WeTTY**：最小性能和协议对照。

## 8. 开始编码前的验证任务

- 用同一套 VT 回放分别跑 xterm.js 和 wterm。
- 验证 CJK、IME、emoji、双宽字符、tmux、vim、top、htop、mouse、resize。
- 验证 5 MiB/s 持续输出时主线程和缓冲上限。
- 做 Go SSH/SFTP/PTY 的最小 vertical slice。
- Windows 上验证 ConPTY、PowerShell、CMD 和 WSL。
- 验证本地 Agent 同源 PWA 在断网时冷启动。
- 验证私钥不会进入浏览器存储、日志和 WebSocket frame。

通过这些验证后再开始完整 UI，避免先做漂亮界面、最后才发现终端与会话内核不可靠。
