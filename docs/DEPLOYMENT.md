# 纯 Cloudflare Workers 部署

推荐的完整生产路径是单体 Cloudflare Worker：同一个地址同时托管 Vite 静态页面、
SSH ticket API、WebSocket TCP 中继和 Durable Objects。Vercel 只能作为可选的静态
镜像，不能替代 Worker 连接公网 TCP/22。

当前生产实例：<https://oh-myssh-relay.bkgr.workers.dev>
正式产品域名：<https://ssh.w0x7ce.eu>

打开该地址即可进入页面。用户只需输入产品登录密码，Worker 会建立 HttpOnly 浏览器
会话；真实 SSH 登录仍需填写服务器账号、密码或私钥。用户不需要查看 Cloudflare
token，也不需要在本地运行任何 relay、Node、Wrangler 或 Docker。

## 1. 本地验收

```bash
npm ci
npm run check
```

本地连接真实 SSH 时运行：

```bash
npm run dev
```

打开 `http://localhost:3000`。Vite 内置 relay 只接受同源 WebSocket，并只应在开发机
使用；它允许连接局域网地址。生产部署不包含这个开发中间件。

## 2. 配置 Worker

编辑 `gateway/wrangler.toml`：

```toml
[vars]
ALLOWED_ORIGINS = "https://oh-myssh.vercel.app,http://localhost:3000"
ALLOWED_PORTS = "22,2222"
ALLOWED_HOSTS = "ssh.example.com,*.servers.example.com"
```

同源的 Worker 页面会自动通过 Origin 校验；`ALLOWED_ORIGINS` 用于可选的 Vercel
镜像或其他前端。生产环境强烈建议填写 `ALLOWED_HOSTS`；留空表示访问令牌持有者可以连接策略允许
的公网主机，但私网、保留地址、TCP/25 和 Cloudflare 自身 IP 段仍会被阻止。SSH
域名应使用 DNS-only 记录，不能指向橙云代理地址。

生成一个随机令牌，例如：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

把同一个值安全保存，然后写入 Worker secret：

```bash
npx wrangler login --config gateway/wrangler.toml
npx wrangler whoami --config gateway/wrangler.toml
npx wrangler secret put ACCESS_TOKEN --config gateway/wrangler.toml
npx wrangler secret put APP_LOGIN_PASSWORD_HASH --config gateway/wrangler.toml
npx wrangler secret put APP_SESSION_SECRET --config gateway/wrangler.toml
npm run workers:deploy
```

记录 Wrangler 输出的 `https://...workers.dev` 地址。不要把 token 写入 Git、
`wrangler.toml`、Vercel 环境变量或 URL。`npm run workers:deploy` 会先构建 `dist`，
再把静态 Assets 和 Worker 一起发布；只运行 `--dry-run` 不会创建线上服务。

网页登录现在由 Worker 自己提供：产品密码以 PBKDF2-SHA-256 记录保存，登录后由
`APP_SESSION_SECRET` 签发 HttpOnly、Secure、SameSite=Strict 会话 Cookie。ticket
请求携带该 Cookie，前端不再需要接触 `ACCESS_TOKEN`。`ACCESS_TOKEN` 仍可作为
管理员/兼容客户端的 bearer 方式，但不是普通用户流程。

本项目的生产自定义域名是 `ssh.w0x7ce.eu`，已在 Cloudflare Workers 的“网域”页
绑定到 `oh-myssh-relay`。Cloudflare 会负责该主机名的 DNS 记录和证书；部署后应从
这个域名验证，而不是只验证 `workers.dev` 回退地址：

```bash
curl https://ssh.w0x7ce.eu/health
```

如果某个控制面或反向代理没有提供 `CF-Connecting-IP`，Worker 会只为限流生成一个
匿名、短字段指纹，不会信任客户端伪造的 `X-Forwarded-For` / `X-Real-IP`，也不会
放宽 Origin、Bearer token、目标主机或端口校验。

## 3. 验证统一 Worker 服务

打开 Wrangler 返回的 Worker 地址，页面和 relay 应该来自同一个 origin：

```bash
curl https://你的-worker.workers.dev/health
```

响应必须包含 `"ok":true`、`"service":"oh-myssh-relay"` 和
`"deployment":"unified-workers"`。打开正式域名后，前端会自动探测同源 Worker，
显示网页登录页；登录后不需要填写中继地址或 Cloudflare token。

## 4. 可选：GitHub Actions 自动部署

仓库已包含 `.github/workflows/deploy-workers.yml`。在 GitHub 仓库的
Settings → Secrets and variables → Actions 中添加以下四个 Repository secrets：

- `CLOUDFLARE_API_TOKEN`：具备该 Worker 部署权限的 Cloudflare API Token。
- `OH_MYSSH_ACCESS_TOKEN`：管理员/兼容客户端使用的 legacy bearer 令牌，普通用户不接触。
- `OH_MYSSH_LOGIN_PASSWORD_HASH`：产品登录密码的 PBKDF2-SHA-256 记录，不是明文密码。
- `OH_MYSSH_SESSION_SECRET`：签名浏览器 HttpOnly 会话的随机密钥。

之后推送到 `main` 会先运行完整测试、构建静态 Assets、检查 Worker 类型，再部署同一个
Worker 并同步全部登录/兼容 Secret。首次部署前也可以手动执行 `workflow_dispatch`；
Account ID 已写入 `gateway/wrangler.toml`，工作流不会把任何令牌写入 Git 或构建产物。
本次线上实例已经通过 Wrangler OAuth 手动发布；OAuth 登录状态只在本机有效，不能代替
GitHub Actions 的非交互式 `CLOUDFLARE_API_TOKEN`。如果要启用推送后的自动发布，请在
Cloudflare 创建一个仅具备该 Worker 部署权限的长期 API Token，再填入 GitHub Secret。

## 5. Vercel 不属于生产链路

在 Vercel 导入 GitHub 仓库。仓库的 `vercel.json` 已固定：

- Build Command：`npm run build`
- Output Directory：`dist`
- Framework：Vite
- SPA rewrite 和安全响应头

将 `main` 设置为 Vercel Production Branch 后，GitHub SSH push 会自动部署静态 UI。
这不会自动发布 Cloudflare Worker；`gateway/` 变化仍要执行 `npm run workers:deploy`。
Preview 域名默认不在 `ALLOWED_ORIGINS`，需要测试时加入它的精确 origin。

生产用户不要打开 Vercel 镜像。页面、登录、ticket、WebSocket TCP 中继和 Durable
Objects 都由 `https://ssh.w0x7ce.eu` 对应的同一个 Worker 提供；Vercel 即使仍连接
仓库，也只是非生产静态镜像。

## 6. 第一次连接

1. 快速连接输入 `user@host:22`。
2. 输入密码，或粘贴受支持的私钥。
3. 浏览器展示服务器 host-key SHA-256 指纹。
4. 先通过云厂商控制台或服务器可信渠道核对，再接受。

服务器上可用下列命令查看 Ed25519 host key 指纹：

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
```

## 7. 常见错误

| 现象 | 检查 |
| --- | --- |
| Vercel 黑屏 | 查看静态资源是否 200；运行 `npm run build`；当前 bootstrap 会把启动异常直接显示在页面上 |
| `Origin is not allowed` | `ALLOWED_ORIGINS` 必须与浏览器 origin 完全一致，包括协议和端口 |
| `Unauthorized` | 产品登录会话已过期；刷新页面并重新输入产品密码 |
| `Target port/host is not allowlisted` | 检查 `ALLOWED_PORTS` / `ALLOWED_HOSTS` |
| `DNS returned a private or reserved address` | 生产 relay 有意拒绝私网目标；私网测试使用本地 `npm run dev` |
| `proxy request failed` / Cloudflare IP 连接失败 | SSH 域名不能走橙云代理；改用 DNS-only 记录或服务器公网 IP |
| host key changed | 不要直接接受；先确认服务器是否重装或更换密钥 |
| SFTP 本地区不可用 | 浏览器缺少 OPFS；换当前 Chromium，页面不会把失败显示成成功 |
| 加密 OpenSSH 私钥不支持 | 转成加密 PKCS#8，或使用密码/未加密 OpenSSH key |

## 8. 静态 Docker 运行

`npm run build && npm start` 或 Docker 镜像只提供静态 UI，不能替代完整 Worker；
生产连接请使用前面的统一 Workers 部署。

## 9. 部署后验收

```bash
curl https://你的-worker.workers.dev/health
```

随后打开 Worker 生产地址，确认首屏与浏览器 console 正常，再依次验证 `/health`、
ticket、可信 host-key 指纹、真实 Shell、窗口 resize、SFTP 列表以及小文件上传下载。
