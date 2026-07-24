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

## 本地开发

```bash
npm install
npm run dev      # 仅前端 http://localhost:3000
npm test
npm run build
```

可选（**不是** Vercel 纯静态路径；只有你需要真实 SSH 实验时）：

```bash
npm run dev:with-gateway   # 前端 + 可选本机网关
npm start                  # 一体服务（需先 build）
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
