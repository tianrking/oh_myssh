# Oh My SSH

> **纯前端静态站**：`npm run build` → 托管 **Vercel**（或任意静态 CDN）。  
> 用户、运营方都**不必**为了打开 UI 去跑 Node 网关。

---

## 你要的部署方式（可以）

```bash
npm install
npm run build
# 把 dist/ 丢到 Vercel —— Framework: Vite, Output: dist
```

或连接 GitHub 仓库一键 Import。已提供 [`vercel.json`](./vercel.json)。

**最终用户**：只打开网址，不下载客户端。  
**你**：只托管静态文件，**可以不跑任何自建 SSH 服务**。

---

## 必须先说清楚的硬限制

| 目标 | 纯 Vercel 静态（只前端） |
|------|---------------------------|
| 打开精美终端 UI、多标签、主机库、命令片段 | ✅ 可以 |
| 离线演示 Shell | ✅ 可以 |
| **对任意 IP:22 做真实 SSH** | ❌ **不行** |

**为什么网上那些 WebSSH 可以？**  
因为它们**不是纯静态**：背后有服务器用 Node/Go 去 `connect(你的IP, 22)`。  
浏览器**禁止**普通网页自己去连 TCP/22——这是浏览器安全模型，不是 Vercel 的锅，也不是我们「懒得做」。

所以在「**只编译前端 + 只托管 Vercel + 我们也不跑服务**」三条同时成立时：

- ✅ 产品形态 = 纯静态 SPA  
- ❌ 不能 magically 变成「网页直连任意 VPS」  
- 若坚持真实 SSH → 必须有人提供能拨 TCP 的服务（自建网关 / 第三方 / 特殊浏览器 Direct Sockets）

```text
纯静态 Vercel：
  浏览器 ──❌ 不能──►  任意 VPS:22

常见 WebSSH：
  浏览器 ──WebSocket──►  网站服务器 ──TCP──►  VPS:22
                         （这一段你说不要）
```

---

## 真实 SSH：用网关连接（现在就可以）

**这不是 Chrome 直连 VPS**，而是经典 WebSSH：

```text
浏览器  →  网关(免费可自建)  →  你的 VPS:22
```

### 本地马上连

```bash
npm install
npm run dev:with-gateway    # 前端 + 本机网关
# 打开 http://localhost:3000
# 快速连接 root@你的VPS:22 + 密码 → 状态栏 WebSSH Gateway
```

### 有没有「免费网关」？

| 类型 | 建议 |
|------|------|
| **公网别人家的免费公共网关** | **不建议**。密码/会话过别人服务器，极少且不安全 |
| **自己免费/白嫖机器上跑本仓库网关** | **推荐**。Oracle 免费 ARM、校园机、已有 VPS、家里 NAS 等 |
| **一体部署** | `npm run build && npm start` 或 `docker compose up`，一个地址搞定 |

你已经有一台 VPS 时，最省事：在 **同一台或另一台便宜机器** 上跑网关，前端指过去即可。

```bash
# 在「网关机器」上
npm install && npm run build && npm start
# 用户打开 http://网关机器IP:8080 即可连任意目标 VPS
```

只部署前端到 Vercel 时，构建加环境变量：

```bash
VITE_SSH_GATEWAY=wss://你的网关域名/ssh npm run build
```

### 网关 = 直连吗？

**不是直连。**  
直连 = 浏览器 TCP 直接到 VPS（普通 Chrome 做不到）。  
网关 = 浏览器只连你的网关，**由网关**去连 VPS（和网上 WebSSH 一样，可用、好用）。

---

## 本地开发（仅 UI）

```bash
npm install
npm run dev      # 仅前端，没有网关则不能真 SSH
npm test
npm run build
```

---

## 纯静态上能用什么

- xterm 终端 UI、主题、分屏、多标签  
- 主机列表（IndexedDB）  
- 命令片段 / 命令面板  
- **离线 Shell**（本地模拟，不连真机）  
- 快速连接表单（真连会说明限制）

侧边栏 **「离线开发 Shell」** 可完整体验交互终端。

---

## License

Apache-2.0
