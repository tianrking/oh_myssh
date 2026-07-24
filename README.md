# Oh My SSH

> **打开网页 → 填 IP/密码 → 在浏览器里管 VPS**  
> 经典 **WebSSH** 架构（和网上那些 WebSSH 一样的方向）

前端是终端工作区（xterm.js）；真正的 SSH TCP 连接由 **WebSSH 网关**完成。  
用户电脑上**不用装 Xshell**，也**不用自己理解中继**——就像打开一个网站用 SSH。

```text
你的浏览器 (网页 UI)
        │  WebSocket
        ▼
 WebSSH 网关 (Node, 本仓库 server/)
        │  真实 TCP/22
        ▼
   你的 VPS (OpenSSH)
```

---

## 30 秒上手

```bash
npm install
npm run dev          # 同时启动：网页 UI + WebSSH 网关
```

浏览器打开 http://localhost:3000  

1. 点 **快速连接**  
2. 输入例如 `root@你的VPS:22` 和密码  
3. 回车 → 进入真实远程 Shell  

状态栏显示 **WebSSH Gateway** 即成功。

---

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | UI + 网关（日常开发 / 本地使用） |
| `npm run gateway` | 只跑网关（默认 `:3922`） |
| `npm run build` | 构建静态前端 `dist/` |
| `npm run preview` | 预览构建 + 网关 |
| `npm test` | 单元测试 |
| `npm run test:webssh` | 网关 E2E（需网关已启动 + 环境变量密码） |

```bash
# 另开终端跑网关 E2E
npm run gateway
OMS_SSH_HOST=de.w0x7ce.eu OMS_SSH_USER=root OMS_SSH_PASSWORD='你的密码' npm run test:webssh
```

**不要把密码写进仓库。**

---

## 部署（打开网站就能用）

需要两样东西：

| 组件 | 部署位置 | 说明 |
|------|----------|------|
| **前端静态站** | Vercel / Cloudflare Pages / Nginx | `npm run build` → `dist` |
| **WebSSH 网关** | 任意能出站访问 22 端口的服务器 | `npm run gateway` 或 Docker/systemd |

前端通过环境变量或同域反代找到网关：

```bash
# 构建前端时指定网关 WebSocket 地址
VITE_SSH_GATEWAY=wss://ssh-gw.example.com/ssh npm run build
```

本地开发默认：浏览器连同域 `/ssh-ws`，Vite 代理到 `ws://127.0.0.1:3922/ssh`。

Nginx 示例（同域）：

```nginx
location /ssh-ws {
  proxy_pass http://127.0.0.1:3922/ssh;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

> 仅部署 Vercel 静态文件、**不部署网关**时：页面能开，但连不上真实 SSH（和所有 WebSSH 一样，必须有服务端帮你拨 TCP）。

---

## 功能

- WebSSH 默认路径：密码登录、交互 Shell、窗口 resize  
- 多标签、分屏、广播、命令片段、主题  
- 主机库（IndexedDB；密码默认只在会话内存）  
- 离线 Demo Shell（`offline.local`）  
- 高级：浏览器内 SSH 栈 / Direct Sockets（可选，非默认）

---

## 安全说明

- 与所有在线 WebSSH 相同：密码会发到 **你自己部署的网关**，再用于连接目标机  
- 请只部署在你信任的环境；公网网关务必加鉴权 / HTTPS / 防火墙（后续可增强）  
- 不要把生产密码提交到 Git  

---

## 和「纯前端直连」的关系

| 模式 | 用户体验 | 是否需要网关 |
|------|----------|--------------|
| **WebSSH（本产品默认）** | 打开网页就能连任意 VPS | 需要（云上或本机 `npm run gateway`） |
| 浏览器 Direct Sockets | 真·浏览器直连 TCP | 不需要，但要特殊浏览器/IWA |

你要的方向就是表里第一行——**已经按这个做了。**

---

## License

Apache-2.0
