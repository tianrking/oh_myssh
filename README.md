# Oh My SSH

> 打开浏览器，像 Xshell 一样连远程 VPS。默认直连，不强制中继。

纯前端 SSH/SFTP 工作区：多标签、分屏、SFTP、命令面板、加密主机库。  
SSH2 协议在浏览器内完成（WebCrypto + `@microsoft/dev-tunnels-ssh`）。

---

## 默认怎么连（Xshell 体验）

1. `npm run dev` 或打开已部署站点  
2. **快速连接** → `root@你的VPS:22` + 密码  
3. 回车连接，进入真实远程 Shell  

**不会**默认走中继。中继仅在「高级设置」里可选，留空即不使用。

```bash
npm install
npm run dev          # 本地开发：可直接连真实 VPS
npm run build        # 静态构建（可部署 Vercel 等）
npm test
```

---

## 连接路径（默认 = 直连）

| 优先级 | 条件 | 行为 |
|--------|------|------|
| **1. 直连（默认）** | Chromium Direct Sockets（IWA） | 浏览器 → TCP/22 → 你的 VPS |
| **1b. 本地开发** | `npm run dev` | 开发服务器透明 TCP，仍按「直连」使用 |
| **2. 可选桥** | 用户在高级设置**主动填写** | 才使用 WebSocket→TCP（非默认） |
| 离线演示 | 仅 `offline.local` 等演示主机 | Offline Shell |

> 普通网页受浏览器安全模型限制，**不能**像桌面 Xshell 那样无条件裸开 TCP。  
> 本地用 `npm run dev` 即可连真实主机；生产环境真·纯直连请用支持 Direct Sockets 的 IWA 包。  
> **Vercel 静态托管**可部署 UI；真直连依赖浏览器 Direct Sockets，或你自行启用高级可选桥。

---

## 功能

- 真实 SSH2：密码认证、PTY Shell、窗口 resize  
- SFTP v3：列表 / 上传 / 下载  
- 多标签保活、分屏、广播、命令片段  
- 主机树、主题、快捷键  
- 离线演示 Shell（可选，不默认）

---

## 快捷键

| 键 | 功能 |
|----|------|
| `⌘/Ctrl+K` | 命令面板 |
| `⌘/Ctrl+T` | 新建连接 |
| `⌘/Ctrl+W` | 关闭标签 |
| `Ctrl+Tab` | 切换标签 |

---

## 安全

- 密码只在当前标签内存，默认不写 IndexedDB  
- 切勿把服务器密码提交到 Git  
- 高级 TCP 桥默认关闭；启用前请自担信任风险  

---

## 部署（Vercel 等）

- Framework: **Vite**  
- Build: `npm run build`  
- Output: `dist`  

静态站点可部署；是否能直连 TCP 取决于浏览器能力（Direct Sockets），与是否「默认中继」无关——产品默认就是直连模式。

---

## License

Apache-2.0
