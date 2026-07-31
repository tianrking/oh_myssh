# Vercel + Cloudflare Relay 部署

这是当前唯一推荐的普通浏览器生产路径。不要重新启用旧 Node JSON WebSSH gateway。

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

## 2. 配置 Cloudflare Worker

编辑 `gateway/wrangler.toml`：

```toml
[vars]
ALLOWED_ORIGINS = "https://你的-vercel-域名.vercel.app,http://localhost:3000"
ALLOWED_PORTS = "22,2222"
ALLOWED_HOSTS = "ssh.example.com,*.servers.example.com"
```

生产环境强烈建议填写 `ALLOWED_HOSTS`；留空表示访问令牌持有者可以连接策略允许
的公网主机，但私网、保留地址、TCP/25 和 Cloudflare 自身 IP 段仍会被阻止。SSH
域名应使用 DNS-only 记录，不能指向橙云代理地址。

生成一个随机令牌，例如：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

把同一个值安全保存，然后写入 Worker secret：

```bash
npx wrangler login
npx wrangler whoami
npx wrangler secret put ACCESS_TOKEN --config gateway/wrangler.toml
npm run gateway:deploy
```

记录 Wrangler 输出的 `https://...workers.dev` 地址。不要把 token 写入 Git、
`wrangler.toml`、Vercel 环境变量或 URL。

可以为 Worker 配置自定义域名。当前浏览器 ticket 请求明确不发送 Cookie，因此尚
不支持把交互式 Cloudflare Access 登录作为强制边界；不要在未扩展客户端认证流程
前关闭唯一可用入口。

## 3. 部署 Vercel 静态 UI

在 Vercel 导入 GitHub 仓库。仓库的 `vercel.json` 已固定：

- Build Command：`npm run build`
- Output Directory：`dist`
- Framework：Vite
- SPA rewrite 和安全响应头

将 `main` 设置为 Vercel Production Branch 后，GitHub SSH push 会自动部署静态 UI。
这不会自动发布 Cloudflare Worker；`gateway/` 变化仍要执行 `npm run gateway:deploy`。
Preview 域名默认不在 `ALLOWED_ORIGINS`，需要测试时加入它的精确 origin。

前端构建不需要 SSH 密码、私钥或 Worker access token。部署完成后打开网页，进入
“Cloudflare SSH TCP 中继”设置，填写：

- Worker 基础地址：`https://你的-worker.workers.dev`
- 中继访问令牌：刚才设置的 `ACCESS_TOKEN`

URL 会保存在 localStorage；令牌只保存在本标签会话的 sessionStorage。

## 4. 第一次连接

1. 快速连接输入 `user@host:22`。
2. 输入密码，或粘贴受支持的私钥。
3. 浏览器展示服务器 host-key SHA-256 指纹。
4. 先通过云厂商控制台或服务器可信渠道核对，再接受。

服务器上可用下列命令查看 Ed25519 host key 指纹：

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
```

## 5. 常见错误

| 现象 | 检查 |
| --- | --- |
| Vercel 黑屏 | 查看静态资源是否 200；运行 `npm run build`；当前 bootstrap 会把启动异常直接显示在页面上 |
| `Origin is not allowed` | `ALLOWED_ORIGINS` 必须与浏览器 origin 完全一致，包括协议和端口 |
| `Unauthorized` | 当前标签页的 token 与 Worker secret 不一致 |
| `Target port/host is not allowlisted` | 检查 `ALLOWED_PORTS` / `ALLOWED_HOSTS` |
| `DNS returned a private or reserved address` | 生产 relay 有意拒绝私网目标；私网测试使用本地 `npm run dev` |
| `proxy request failed` / Cloudflare IP 连接失败 | SSH 域名不能走橙云代理；改用 DNS-only 记录或服务器公网 IP |
| host key changed | 不要直接接受；先确认服务器是否重装或更换密钥 |
| SFTP 本地区不可用 | 浏览器缺少 OPFS；换当前 Chromium，页面不会把失败显示成成功 |
| 加密 OpenSSH 私钥不支持 | 转成加密 PKCS#8，或使用密码/未加密 OpenSSH key |

## 6. 静态 Docker 运行

`npm run build && npm start` 或 Docker 镜像只提供静态 UI，明确拒绝 `/ssh` 和
`/ssh-ws` WebSocket。它仍需配置独立 Cloudflare relay 才能连接真实 SSH。

## 7. 部署后验收

```bash
curl https://你的-worker.workers.dev/health
```

随后打开 Vercel 生产地址，确认首屏与浏览器 console 正常，再依次验证 ticket、
可信 host-key 指纹、真实 Shell、窗口 resize、SFTP 列表以及小文件上传下载。
