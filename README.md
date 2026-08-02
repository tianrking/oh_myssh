# Oh My SSH

浏览器端真实 SSH / SFTP 工作区。推荐使用**纯 Cloudflare Workers 单体部署**：同一个
Worker 地址同时提供 Vite 静态页面、SSH ticket API、WebSocket TCP 中继和 Durable
Objects 会话，不需要在 Vercel 与 Worker 之间来回配置。

```text
同一个 https://<worker>.workers.dev
  ├─ 静态 SPA / SFTP UI
  ├─ POST /api/ticket       一次性 SSH ticket
  ├─ WSS  /api/tcp          Durable Object → TCP → SSH server
  └─ GET  /health           部署与协议健康检查
```

浏览器执行 SSH KEX、host-key 校验、认证、PTY 和 SFTP；Worker 只转发原始 SSH 协议
字节，不终止或解密 SSH。Vercel 可以作为可选的静态镜像，但 Vercel-only 不能为普通
浏览器提供任意公网 TCP/22，因此不属于完整生产 SSH 服务。

## 核心能力

| 能力 | 当前实现 |
| --- | --- |
| SSH 认证 | Password、单密码 keyboard-interactive、RSA/ECDSA PEM、加密 PKCS#8、未加密 OpenSSH Ed25519/RSA/ECDSA |
| 主机校验 | 严格 TOFU；首次显示 SHA-256 指纹，指纹变化默认阻断且不会覆盖旧记录 |
| 终端 | PTY、交互 Shell、窗口 resize、keepalive、多标签、真实双连接分屏 |
| SFTP v3 | 列表、stat、创建/删除、重命名、128 KiB 流式上传下载、原子上传、OPFS 本地文件区 |
| Workers 服务 | 静态 Assets、Bearer token、一次性 ticket、Origin/主机/端口限制、DNS/SSRF 防护、Durable Objects、速率/会话/流量/超时边界 |

## 本地运行

要求 Node.js 22+ 与 npm。

```bash
npm ci
npm run dev
```

打开 `http://localhost:3000`。Vite 开发中间件提供仅同源的本地 WebSocket → TCP
relay，可测试公网或局域网 SSH；它不会进入生产 Worker。

完整验收：

```bash
npm run check
```

该命令运行 Vitest、前端 production build、Worker typecheck 和 Wrangler dry-run。

## 推荐：纯 Workers 单体部署

### 1. 配置策略

编辑 [`gateway/wrangler.toml`](./gateway/wrangler.toml)：

```toml
[vars]
ALLOWED_ORIGINS = "https://oh-myssh.vercel.app,http://localhost:3000"
ALLOWED_PORTS = "22,2222"
ALLOWED_HOSTS = "ssh.example.com,*.servers.example.com"
```

同源的 Worker 页面会自动被允许；`ALLOWED_ORIGINS` 用于可选的 Vercel 镜像或其他
前端。生产环境建议明确填写 `ALLOWED_HOSTS`。留空代表持有访问令牌的人可以连接
策略允许的公网目标，但私网、保留地址、TCP/25 和 Cloudflare 自身 IP 段仍会被拒绝。
SSH DNS 记录必须使用 DNS-only，不能指向橙云代理地址。

### 2. 登录并设置访问令牌

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
npx wrangler login --config gateway/wrangler.toml
npx wrangler whoami --config gateway/wrangler.toml
npx wrangler secret put ACCESS_TOKEN --config gateway/wrangler.toml
```

令牌只写入 Cloudflare Secret，不要提交到 Git、`wrangler.toml`、Vercel 环境变量或
URL。当前 Worker 仍要求访问令牌，这是避免公开代理被滥用的必要边界。

### 3. 一键构建并部署完整服务

```bash
npm run workers:deploy
# 等价于：npm run build && wrangler deploy --config gateway/wrangler.toml
```

Wrangler 输出的 `https://<worker>.workers.dev` 就是完整服务地址。验证：

```bash
curl https://<worker>.workers.dev/health
```

应看到 `"ok":true`、`"service":"oh-myssh-relay"` 和
`"deployment":"unified-workers"`。打开同一个地址即可使用页面；在中继设置里
只需填写 `ACCESS_TOKEN`，Worker 地址可以留空，前端会自动使用当前页面同源地址。

### 4. 第一次连接

1. 快速连接输入 `user@host:22` 或 `user@host:2222`。
2. 输入密码，或粘贴受支持的私钥。
3. 浏览器显示服务器 host-key SHA-256 指纹；通过服务器控制台等可信渠道核对后接受。
4. 打开终端或 SFTP。

服务器上查看 Ed25519 host key 指纹：

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
```

## 可选：Vercel 静态镜像

Vercel 仍可部署 `main` 分支的 `dist`，但它只是前端镜像。普通浏览器访问 Vercel
页面时，需要在中继设置中填写纯 Workers 部署返回的 Worker 地址和同一个访问令牌；
Vercel 本身不能替代 Worker 连接公网 TCP/22。

仓库已包含 `vercel.json`：

- Build Command：`npm run build`
- Output Directory：`dist`
- SPA rewrite 与安全响应头

GitHub SSH push 会触发 Vercel 的静态部署，但 Worker 部署必须执行
`npm run workers:deploy`，除非你额外配置了 GitHub Actions 的 Cloudflare secrets。

仓库已经提供 `.github/workflows/deploy-workers.yml`。配置
`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 和 `OH_MYSSH_ACCESS_TOKEN` 三个
GitHub Actions secrets 后，推送 `main` 会自动测试、构建并发布同一个完整 Worker；
工作流不会把令牌写入 Git 或前端产物。

## 安全边界

- SSH KEX、加密、host-key 判断、用户密码、私钥、PTY 和 SFTP 都在浏览器执行。
- Worker 可见客户端 IP、目标地址、访问令牌、流量时序、SSH identification/KEX 等
  传输元数据和原始协议字节，但不终止或解密 SSH。
- ticket 30 秒过期且只能消费一次，通过 WebSocket subprotocol 传递，不进入 URL。
- Worker 校验全部 A/AAAA 结果并固定到已校验 IP，阻断私网、保留地址与常规 DNS rebinding。
- 密码和私钥不会持久化；访问令牌只保存在当前浏览器标签页的 sessionStorage。

## 明确限制

- 生产 Worker 故意拒绝私网/本机目标；连接 LAN 请使用本地 `npm run dev`。
- Cloudflare Sockets 不能连接 Cloudflare IP 段；SSH DNS 记录必须是 DNS-only，或直接
  使用服务器公网 IP。
- 暂不支持 SSH agent、ProxyJump、端口转发、加密 OpenSSH 私钥和断点续传。
- OPFS 不可用时 SFTP 本地区会明确报错，不会伪装传输成功。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 本地 UI + 仅开发期 TCP relay |
| `npm test` | 运行全部 Vitest 测试 |
| `npm run build` | 生成前端 `dist` |
| `npm run gateway:dev` | 本地调试完整 Worker（需先构建 `dist`） |
| `npm run gateway:typecheck` | Worker TypeScript 检查 |
| `npm run gateway:dry-run` | Worker 部署打包验证 |
| `npm run workers:deploy` | 构建并部署完整纯 Workers 服务 |
| `npm run check` | 运行完整项目验收 |

## 项目结构

```text
src/          React UI、浏览器 SSH/SFTP、TOFU、终端与 OPFS
gateway/      Cloudflare Worker、静态 Assets、Durable Objects 原始 SSH TCP relay
server/       本地/静态生产服务器；不提供生产 TCP 网关
scripts/      Vite 本地开发 relay 与测试
docs/         当前架构、部署说明及历史研究资料
```

## 文档

- [纯 Workers 部署](./docs/DEPLOYMENT.md)
- [当前已实现架构](./docs/CURRENT_ARCHITECTURE.md)
- [历史架构研究（已归档）](./docs/ARCHITECTURE_AND_ROADMAP.md)

## License

[Apache-2.0](./LICENSE)
