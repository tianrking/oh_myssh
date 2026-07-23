# Oh My SSH 产品蓝图与体验规范

状态：Accepted for Phase 0

基线日期：2026-07-23

## 1. 一句话定义

Oh My SSH 是一个本地优先、零项目后端、浏览器直连的高性能 SSH/SFTP
工作区：

> 输入任意 `user@host:port`，像 WebSSH 一样直接，像 Xshell/MobaXterm
> 一样高效，像现代桌面产品一样安静、精确、流畅。

它不是堡垒机，不是远程桌面门户，也不是需要用户先部署服务端的面板。

## 2. 产品承诺

### 2.1 用户得到什么

- 打开应用即可快速连接任意标准 SSH server。
- 主机、密钥、工作区和偏好默认只存在当前设备。
- 没有网络时仍能打开应用、管理配置和使用离线能力。
- SSH/SFTP 流量不经过 Oh My SSH 控制的服务器。
- 后续开启云同步时，服务端只保存端到端加密密文。
- 对平台不支持的能力明确说明，不伪装、不静默降级。

### 2.2 永久不做的事情

- 不把 SSH 密码或私钥明文发送给项目服务。
- 不让云同步服务成为 SSH 代理。
- 不在普通 PWA 中声称能够无 Relay 直连 TCP/22。
- 不默认记录或上传终端内容。
- 不为了动画、毛玻璃或装饰牺牲终端可读性和输入延迟。
- 不把终端字节流塞进 React 状态树。

## 3. 目标用户与核心任务

### 3.1 第一目标用户

- 需要频繁连接 Linux 主机的开发者和运维人员。
- 希望在共享或受限设备上使用可安装 Web 应用的用户。
- 不愿把密钥和会话交给第三方 WebSSH 服务的用户。
- 喜欢 Xshell/MobaXterm 工作流，但希望获得现代 UI 的用户。

### 3.2 核心任务

按优先级排序：

1. 在 10 秒内输入主机信息并发起 SSH 连接。
2. 安全确认 host key，使用密码或私钥完成认证。
3. 在一个窗口管理多标签、多分屏和多个主机。
4. 通过 SFTP 浏览、上传、下载和管理远程文件。
5. 保存主机与工作区，下次恢复原布局。
6. 使用快捷命令、广播输入和命令面板减少重复操作。
7. 在多设备间可选同步加密配置，而不改变 SSH 直连路径。

## 4. 产品原则

### Local-first

本地数据是事实来源。所有写入先落本地事务，再异步同步。离线不是降级模式，
而是正常模式。

### Direct by default

在 IWA 支持环境中，连接路径只有：

```text
Oh My SSH IWA -> Direct Sockets -> target TCP/22
```

### Capability-driven

应用先探测真实能力，再开放功能。`Direct Sockets`、WebGL、OPFS、
SharedArrayBuffer、WebAuthn PRF 都必须运行时验证。

### Terminal-first performance

键盘输入、终端渲染、resize 和文件传输是最高优先级。装饰动画和非关键数据
加载不得抢占这些路径。

### Explicit trust

首次 host key、指纹变化、批量广播、覆盖文件、导出私钥和启用密钥同步都需要
明确用户确认。

### Honest security

Browser Vault 弱于操作系统 Keychain。文档必须说明它能防什么、不能防什么，
不能使用“绝对安全”或“零知识”作为未经审计的宣传词。

## 5. 信息架构

桌面工作区固定为五个区域：

```text
┌────────┬──────────────────────────────────────┬──────────────┐
│ Rail   │ Tabs / Breadcrumb / Connection       │ Inspector    │
│        ├──────────────────────────────────────┤              │
│ Hosts  │                                      │ SFTP / Info  │
│ Groups │         Terminal Split Tree          │ Snippets     │
│ Search │                                      │              │
│        ├──────────────────────────────────────┴──────────────┤
│        │ Transfer queue / Problems / Connection status       │
└────────┴──────────────────────────────────────────────────────┘
```

### 5.1 左侧导航

- Quick Connect 永远位于首位。
- 主机按收藏、最近、分组和标签组织。
- 搜索支持名称、hostname、username、标签和备注。
- 列表项显示可读名称、目标地址和轻量状态，不堆叠按钮。
- 所有次级操作进入右键菜单或命令面板。

### 5.2 中央工作区

- 一个 tab 对应一个可恢复工作单元。
- tab 内使用不可变 split tree 描述水平/垂直分屏。
- 激活 pane 有低对比度边框和清晰标题，不使用强发光。
- pane 可拖动、最大化、移动到新 tab，并保存为 workspace。
- terminal、SFTP、离线 Shell 共享 tab/pane 外壳，但 runtime 完全分离。

### 5.3 右侧 Inspector

- 默认折叠，不永久挤压终端。
- 根据当前会话切换 SFTP、连接信息、命令片段和端口转发。
- 双栏 SFTP 在独立 tab 或宽屏模式使用；窄侧栏只提供单栏快速文件操作。

### 5.4 底部面板

- 仅在存在传输、错误或诊断时展开。
- 传输队列显示速度、进度、剩余时间、取消和重试。
- 诊断内容可复制，但必须自动清除密码、私钥和终端内容。

## 6. 关键用户流程

### 6.1 Quick Connect

1. `Ctrl/Cmd + K` 打开命令面板。
2. 输入 `user@host:port`，允许粘贴 OpenSSH 风格目标。
3. 选择一次性连接或保存为主机。
4. 选择密码、导入私钥或已有 Vault Identity。
5. 首次连接展示 host key 算法和 SHA-256 指纹。
6. 接受后进入 terminal；拒绝则立即关闭 socket。

Quick Connect 表单只要求当前连接必需字段，高级 OpenSSH 参数折叠到高级区域。

### 6.2 Host key 变化

- 立即阻止连接，不提供“一直忽略”按钮。
- 同时展示旧指纹、新指纹、hostname、解析 IP 和算法。
- 提供复制验证命令和“确认已在其他渠道验证”流程。
- 接受变更需要二次确认，并保留安全事件记录。

### 6.3 SFTP

- 当前 SSH 会话复用独立 channel，不另存密码。
- 大目录渐进加载和虚拟滚动。
- 上传和下载全程流式传输。
- 覆盖、删除和递归删除有明确影响范围。
- 拖放上传不抢占 terminal 焦点。
- 关闭 tab 时询问正在进行的传输如何处理。

### 6.4 多会话广播

- 默认关闭。
- 开启时所有目标 pane 出现持续可见的警示边框。
- 首次发送危险命令前提示目标数量和主机名称。
- password prompt、sudo prompt 和 host key prompt 自动暂停广播。

## 7. 功能路线

| 能力 | V1 | V1.x | 后续 | 不计划 |
|---|:---:|:---:|:---:|:---:|
| Quick Connect | ✓ | | | |
| 密码/Ed25519/RSA | ✓ | | | |
| Host key/known_hosts | ✓ | | | |
| 主机、分组、标签、搜索 | ✓ | | | |
| Tabs/多层 Splits | ✓ | | | |
| SFTP 流式传输 | ✓ | | | |
| 命令片段/命令面板 | ✓ | | | |
| 加密 Browser Vault | ✓ | | | |
| IWA 签名安装/更新 | ✓ | | | |
| ProxyJump | | ✓ | | |
| 本地/远程/Dynamic Forward | | ✓ | | |
| Zmodem | | ✓ | | |
| 终端录制/回放 | | ✓ | | |
| WebAuthn PRF 解锁 | | ✓ | | |
| 端到端加密云同步 | | | ✓ | |
| wterm/Ghostty renderer | | | 实验 | |
| WASIX 离线 Shell | | | 实验 | |
| WebSerial | | | 实验 | |
| Mosh/UDP | | | 研究 | |
| RDP/VNC | | | 研究 | |
| 企业 PAM/RBAC/审计 | | | | ✓ |
| 本机 PowerShell/WSL/PTY | | | | ✓ |
| 官方 SSH Relay | | | | ✓ |

## 8. 视觉系统

目标不是复制 Vercel 页面，而是使用同样的原则：安静、精确、高信息密度，
让排版和层级承担主要视觉工作。

### 8.1 字体

- UI：本地打包 Geist Sans variable。
- 数字、地址、快捷键、时间戳：Geist Mono，开启 `tabular-nums`。
- Terminal：Geist Mono 作为首选，并提供 Cascadia Mono、JetBrains Mono、
  系统 monospace 和用户自定义字体。
- 中文 fallback：`PingFang SC`、`Microsoft YaHei UI`、`Noto Sans CJK SC`。
- 终端 coding ligatures 默认关闭，避免光标列与 glyph 视觉宽度混淆。
- 不从 Google Fonts、Vercel CDN 或其他远端加载字体。

### 8.2 色彩

- Dark-first，同时完整支持 Light。
- 背景分 3 层，不使用大面积透明毛玻璃。
- 中性色承担 90% 界面；品牌色只用于焦点、选中和主要动作。
- success/warning/danger 使用独立语义 token，不复用品牌色。
- terminal ANSI palette 与应用 UI token 分离。
- 正文与关键控件满足 WCAG AA 对比度。

建议初始 token：

```css
:root[data-theme="dark"] {
  --surface-0: #09090b;
  --surface-1: #111113;
  --surface-2: #18181b;
  --border-subtle: #27272a;
  --text-primary: #fafafa;
  --text-secondary: #a1a1aa;
  --accent: #7c8cff;
  --danger: #f87171;
  --warning: #fbbf24;
  --success: #34d399;
}
```

具体色值需要在真实 terminal 截图、CJK 字体和低质量显示器上校准，token 名称
比首批色值更稳定。

### 8.3 密度与尺寸

- 4 px 基础网格。
- 顶部 tab 高度 36 px；常规控件 32 px；紧凑控件 28 px。
- UI 正文 13–14 px，不默认使用 16 px 造成桌面工具松散。
- pane 标题和状态信息 12 px，仍需满足可读性。
- Terminal 字号默认 14 px，行高 1.2–1.3，可独立缩放。
- 图标默认 16 px；只使用一致的线性图标集。

### 8.4 动效

- 状态切换 120–180 ms。
- pane resize 和 terminal resize 不使用补间动画。
- overlay 只使用 opacity/transform，避免 layout animation。
- 遵守 `prefers-reduced-motion`。
- 任何导致 steady-state 长任务超过 50 ms 的动效直接删除。

## 9. 前端技术栈

2026-07-23 基线：

- React 19.2.x。
- TypeScript 7.0.x，启用 `strict`、`noUncheckedIndexedAccess` 和
  `exactOptionalPropertyTypes`。
- Vite 8.1.x + `@vitejs/plugin-react` 6。
- Tailwind CSS 4 + CSS variables。
- Radix Primitives 用于 Dialog、Popover、Menu、Tooltip、Tabs 等可访问基础件。
- Lucide icons，按图标 tree-shake。
- Zustand 5，只管理低频 UI 状态。
- Dexie 4 管理 IndexedDB schema、事务和迁移。
- xterm.js 6 + WebGL、fit、search、serialize、unicode11 addons。
- Biome 2.5 负责 formatter/linter/import ordering。
- Vitest 4、Playwright 1.61 和真实 Chrome/IWA integration harness。

版本必须 exact pin 并进入 lockfile。升级由自动 PR 触发，但必须经过 terminal
回放、Vault fixture、IWA build 和真实 SSH smoke test。

### 9.1 为什么不是 Next.js

产品没有 SSR、SEO 页面、Server Components 或后端路由需求。Vite 输出更直接，
更适合静态 PWA、IWA signed bundle、Worker/WASM 和严格“无运行时服务”边界。

### 9.2 为什么不是 Electron/Tauri

它们可以更容易获得 socket 和 OS Keychain，但会改变“浏览器原生、纯前端”
的产品定义。只有 IWA 分发生死验证失败并且仓库所有者明确改变产品边界时，
才能重新讨论桌面壳。

### 9.3 React 的边界

React 只负责：

- 导航、布局、表单、设置和低频 session 状态。
- 主机树、tab/split tree、SFTP 元数据和限频后的传输进度。
- dialog、menu、command palette 和错误呈现。

React 不负责：

- SSH stdin/stdout。
- terminal buffer。
- SFTP file bytes。
- KDF 和加解密循环。
- socket read/write loop。

## 10. 可访问性与国际化

- 所有操作都有键盘路径，不要求鼠标拖拽。
- 焦点环始终可见，pane 切换有明确 screen reader label。
- terminal canvas/DOM 的无障碍模式按 xterm.js 支持启用，并说明性能代价。
- UI 首发简体中文和英文；字符串不得直接散落在组件。
- 快捷键按 Windows/Linux 与 macOS 分层。
- 支持 CJK IME、emoji、combining marks、RTL UI 文本；远程 terminal 的
  bidi 行为遵循终端实现，不自行“修正”服务器输出。
- 色彩不是连接状态、危险操作或传输状态的唯一信息。

## 11. 错误与诊断

所有连接错误归一化为：

```ts
type ConnectionError =
  | { kind: "platform-unsupported"; capability: string }
  | { kind: "permission-denied"; capability: string }
  | { kind: "dns"; hostname: string }
  | { kind: "tcp"; host: string; port: number; code?: string }
  | { kind: "host-key"; reason: "unknown" | "changed" | "revoked" }
  | { kind: "auth"; method: string; attemptsRemaining?: number }
  | { kind: "ssh-protocol"; stage: string; safeDetail?: string }
  | { kind: "closed"; exitCode?: number; signal?: string };
```

错误页回答三个问题：

1. 失败发生在哪一层。
2. 用户可以做什么。
3. 哪些安全诊断信息可以复制。

不得把 OpenSSH stderr 原样当作唯一 UI；结构化事件优先，原始日志放入经过脱敏
的高级诊断。

## 12. 隐私与遥测

- 默认关闭遥测。
- 第一版不接入第三方分析脚本、崩溃 SDK 或远程字体。
- 诊断导出必须由用户主动生成并预览。
- 诊断包不包含 terminal 内容、命令历史、密码、私钥、完整路径或文件内容。
- 若未来增加匿名统计，必须独立开关、公开 schema、最小化字段并允许完全禁用。

## 13. V1 发布标准

以下条件全部满足才可标记 V1：

- 在明确支持的 IWA 平台从签名安装包直连真实 TCP/22。
- password、Ed25519、RSA、加密私钥和 host key 回归通过。
- CJK/IME、tmux、vim、htop、mouse、resize、paste 回归通过。
- 1 GiB SFTP 上传和下载内存有界，取消后资源释放。
- 20 个已连接 session、4 个可见 pane 的 UI 仍满足性能预算。
- Vault 静态检查只看到密文；锁定后 worker/VFS 生命周期结束。
- CSP、Trusted Types、SBOM、第三方许可证和依赖审计完成。
- 浏览器不支持时显示准确限制，不提供虚假的 Connect 成功路径。
- 崩溃、刷新、断网、休眠和重新联网行为有自动化或可重复手工测试。
- 安全威胁模型经过独立复核。

## 14. 产品成功指标

不依赖云端遥测也可以通过本地 benchmark 和自愿 Beta 反馈验证：

- 首次成功连接所需时间。
- 连接失败能否被用户自行诊断。
- 每周活跃用户保存的主机和工作区数量。
- terminal 输入延迟、输出吞吐和 dropped frame。
- SFTP 成功率、取消可靠性和峰值内存。
- Vault 解锁时间和恢复成功率。
- 用户是否理解 Direct/PWA/Relay 三种模式差异。

## 15. 决策检查点

### Checkpoint A：Phase 0

真实 `TCPSocket -> OpenSSH WASM -> xterm.js` 成功前，不进入完整视觉开发。

### Checkpoint B：分发

必须确认普通目标用户如何安装签名 IWA、allowlist 如何申请、更新如何到达。
技术能运行但无法分发，仍然是产品阻塞。

### Checkpoint C：Vault

威胁模型、KDF 参数、恢复流程和数据清除后果得到独立复核后，才允许保存私钥。

### Checkpoint D：云同步

本地模型和导出/恢复稳定后再开发同步。同步不能反向侵入 SSH runtime，
也不能成为核心功能的登录门槛。

## 16. 官方资料

- [React 官方版本与发布说明](https://react.dev/versions)
- [Vite 8 官方发布说明](https://vite.dev/blog/announcing-vite8)
- [TypeScript 官方文档](https://www.typescriptlang.org/docs/)
- [Tailwind CSS 官方文档](https://tailwindcss.com/docs/installation/using-vite)
- [Radix Primitives 官方文档](https://www.radix-ui.com/primitives)
- [Geist 字体与排版系统](https://vercel.com/font)
- [Biome 官方文档](https://biomejs.dev/)
- [xterm.js 官方仓库](https://github.com/xtermjs/xterm.js)
- [Chrome IWA Direct Sockets](https://developer.chrome.com/docs/iwa/direct-sockets)
- [Chrome IWA allowlist](https://developer.chrome.com/docs/iwa/allowlist)
