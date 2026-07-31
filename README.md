# Oh My SSH

浏览器端真实 SSH / SFTP 工作区。生产环境由 Vercel 托管静态 UI，Cloudflare
Worker 负责经过鉴权的原始 TCP 中继；它不终止 SSH，认证与会话内容留在浏览器端。

```text
Browser (SSH KEX / host key / auth / PTY / SFTP)
  ├─ HTTPS → Cloudflare Worker：申请一次性 ticket
  └─ WSS   → Durable Object → TCP → SSH server
              转发原始 SSH 协议字节，不终止或解密 SSH
```

> 仅把 SPA 部署到 Vercel 不能连接 TCP/22。生产连接必须先部署仓库内的
> Cloudflare Relay，并在网页中填写 Worker URL 和访问令牌。

## 核心能力

| 能力 | 当前实现 |
| --- | --- |
| SSH 认证 | Password、单密码 keyboard-interactive、RSA/ECDSA PEM、加密 PKCS#8、未加密 OpenSSH Ed25519/RSA/ECDSA |
| 主机校验 | 严格 TOFU；首次显示 SHA-256 指纹，指纹变化默认阻断且不会覆盖旧记录 |
| 终端 | PTY、交互 Shell、窗口 resize、keepalive、多标签、真实双连接分屏 |
| SFTP v3 | 列表、stat、创建/删除、重命名、128 KiB 流式上传下载、原子上传、OPFS 本地文件区 |
| 生产中继 | Bearer token、一次性 ticket、Origin/主机/端口限制、DNS/SSRF 防护、速率/会话/流量/超时边界 |
| 静态部署 | Vercel SPA rewrite、安全响应头、启动错误可视化；旧明文 Node WebSSH gateway 已移除 |

## 本地运行

要求 Node.js 22+ 与 npm；Cloudflare 部署还需要已启用 Workers 的账号。

```bash
npm ci
npm run dev
```

打开 `http://localhost:3000`。Vite 会启用仅开发期、仅同源的 WebSocket → TCP
relay，因此可测试公网或局域网 SSH；该开发中间件不会进入 Vercel 构建。

完整验收：

```bash
npm run check
```

该命令依次运行前端/协议测试、production build、Worker typecheck 和 Wrangler
dry-run。

## 生产部署

### 1. 配置 Cloudflare Relay

先编辑 [`gateway/wrangler.toml`](./gateway/wrangler.toml)：

```toml
[vars]
ALLOWED_ORIGINS = "https://你的-vercel-域名.vercel.app"
ALLOWED_PORTS = "22,2222"
ALLOWED_HOSTS = "ssh.example.com,*.servers.example.com"
```

生产环境建议明确填写 `ALLOWED_HOSTS`。留空代表持有访问令牌的人可以连接策略
允许的公网目标；私网、保留地址、TCP/25 和 Cloudflare 自身 IP 段仍会被拒绝。
SSH 域名应使用 DNS-only 记录，不能指向橙云代理地址。

生成并设置至少 32 字节的随机访问令牌：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
npx wrangler login
npx wrangler whoami
npx wrangler secret put ACCESS_TOKEN --config gateway/wrangler.toml
npm run gateway:deploy
```

记录 Wrangler 返回的 `https://...workers.dev` 地址。不要把令牌提交到 Git、写入
URL、`wrangler.toml` 或 `VITE_*` 环境变量。

### 2. 部署 Vercel UI

在 Vercel 导入此 GitHub 仓库。根目录 [`vercel.json`](./vercel.json) 已固定：

- Build Command：`npm run build`
- Output Directory：`dist`
- Framework：Vite
- SPA rewrite 与生产安全响应头

Vercel 连接 `main` 后，每次推送都会自动构建部署。前端构建不需要任何 SSH
密码、私钥或 Worker token。

本仓库使用 SSH 推送：

```bash
git remote set-url origin git@github.com:tianrking/oh_myssh.git
ssh -T git@github.com
git push origin main
```

SSH push 只会触发 Vercel 静态 UI 部署；`gateway/` 有修改时仍需单独运行
`npm run gateway:deploy`。Vercel 应把 `main` 设为 Production Branch；Preview
域名默认不在 `ALLOWED_ORIGINS`，测试 Preview 时需临时加入它的精确 origin。

### 3. 第一次连接

1. 打开部署后的网页，在顶部“Cloudflare SSH TCP 中继”中填写 Worker 基础 URL
   和 `ACCESS_TOKEN`。
2. 使用“快速连接”输入 `user@host:port`，再输入密码或粘贴私钥。
3. 浏览器首次显示 host-key SHA-256 指纹；请通过服务器控制台等可信渠道核对后接受。
4. 打开终端或 SFTP。Relay URL 保存在 `localStorage`，token 只保存在当前标签页的
   `sessionStorage`。

完整步骤与故障排查见 [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)。

## 安全边界

- SSH KEX、加密、host-key 判断、用户密码、私钥、PTY 和 SFTP 都在浏览器执行。
- Worker 可见客户端 IP、目标地址、访问令牌、流量时序、SSH identification/KEX
  等传输元数据和原始协议字节，但不终止或解密 SSH；KEX 后的认证凭据与会话内容
  保持端到端加密。
- ticket 30 秒过期且只能消费一次，通过 WebSocket subprotocol 传递，不进入 URL。
- Worker 同时校验全部 A/AAAA 结果并固定到已校验 IP，阻断私网、保留地址与常规
  DNS rebinding。
- 保存的主机只包含连接元数据；密码和私钥不会持久化。
- 首次指纹或指纹变化都必须由用户确认；拒绝变化不会污染 known-hosts。

更完整的信任边界见 [`docs/CURRENT_ARCHITECTURE.md`](./docs/CURRENT_ARCHITECTURE.md)。

## 明确限制

- 生产 Worker 故意拒绝私网/本机目标；连接 LAN 请使用本地 `npm run dev`。
- Cloudflare Sockets 不能连接 Cloudflare IP 段；SSH DNS 记录必须是 DNS-only，或直接
  使用服务器公网 IP。
- 暂不支持 SSH agent、ProxyJump、端口转发、加密 OpenSSH 私钥和断点续传。
- OPFS 不可用时 SFTP 本地区会明确报错，不会伪装传输成功。
- 普通浏览器不能绕过 TCP 限制；Vercel-only 部署只能显示 UI，不能真实 SSH。

## 验证基线

当前版本已验证：

- Vitest：21 个测试文件、89 个测试通过。
- 独立 SSH 协议实现之间的 KEX、host key、password、PTY、shell、resize 与 SFTP v3
  互操作。
- SFTP 初始化竞态、包边界、超时清理、流式读写和原子临时文件。
- Cloudflare DNS/SSRF/Origin/端口/主机/ticket 策略与 Durable Object 限额。
- TypeScript、Vite production build、Worker typecheck、Wrangler dry-run。
- 真实 Chrome 首屏、配置弹窗、凭据重询、lazy chunk、双分屏，且无 console/page error。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 本地 UI + 仅开发期 TCP relay |
| `npm test` | 运行全部 Vitest 测试 |
| `npm run build` | 生成 Vercel/静态生产包 |
| `npm run gateway:dev` | 本地调试 Cloudflare Worker |
| `npm run gateway:typecheck` | Worker TypeScript 检查 |
| `npm run gateway:dry-run` | Worker 部署打包验证 |
| `npm run gateway:deploy` | 部署 Worker |
| `npm run check` | 运行完整项目验收 |

## 项目结构

```text
src/          React UI、浏览器 SSH/SFTP、TOFU、终端与 OPFS
gateway/      Cloudflare Worker + Durable Objects 原始 SSH TCP relay
server/       静态生产服务器；明确拒绝旧 /ssh 与 /ssh-ws 网关
scripts/      Vite 本地开发 relay 与测试
docs/         当前架构、部署说明及历史研究资料
```

## 文档

- [生产部署](./docs/DEPLOYMENT.md)
- [当前已实现架构](./docs/CURRENT_ARCHITECTURE.md)
- [历史架构研究（已归档）](./docs/ARCHITECTURE_AND_ROADMAP.md)

## License

[Apache-2.0](./LICENSE)
